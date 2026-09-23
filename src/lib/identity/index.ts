import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { loadBundledDataset } from "@/domain/data/server";
import type { NormalizedDataset } from "@/lib/contracts";
import type { DemoSession } from "./types";

export type { DemoSession, DemoPerson } from "./types";
export const SESSION_COOKIE_NAME = "cq_demo_session";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export class IdentityUnavailableError extends Error {
  readonly code = "IDENTITY_UNAVAILABLE";
  constructor() {
    super("Demo identity is not configured");
  }
}

const runtime = globalThis as typeof globalThis & {
  __careerQuestDemoSecret?: string;
  __careerQuestIdentityDataset?: Promise<NormalizedDataset>;
};

/** Trusted server source. Never accept profiles, roles or permissions from the caller. */
export function getIdentityDataset(): Promise<NormalizedDataset> {
  runtime.__careerQuestIdentityDataset ??= loadBundledDataset().catch(
    (error) => {
      runtime.__careerQuestIdentityDataset = undefined;
      throw error;
    },
  );
  return runtime.__careerQuestIdentityDataset;
}

function sessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && Buffer.byteLength(configured) >= 32) return configured;
  if (process.env.NODE_ENV === "production")
    throw new IdentityUnavailableError();
  // A public hardcoded development secret would allow forged cookies on shared demos.
  runtime.__careerQuestDemoSecret ??= randomBytes(32).toString("base64url");
  return runtime.__careerQuestDemoSecret;
}

const claimsSchema = z
  .object({
    employeeId: z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/),
    issuedAt: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
  })
  .strict();

export function signDemoSession(employeeId: string, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const claims = claimsSchema.parse({
    employeeId,
    issuedAt,
    exp: issuedAt + SESSION_MAX_AGE_SECONDS,
  });
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyDemoSession(
  token: string,
  now = Date.now(),
): string | null {
  if (token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))
    return null;
  const [payload, supplied] = token.split(".");
  const expected = createHmac("sha256", sessionSecret())
    .update(payload)
    .digest();
  const signature = Buffer.from(supplied, "base64url");
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  )
    return null;
  try {
    const claims = claimsSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    const seconds = Math.floor(now / 1000);
    if (
      claims.issuedAt > seconds + 30 ||
      claims.exp <= seconds ||
      claims.exp <= claims.issuedAt ||
      claims.exp - claims.issuedAt > SESSION_MAX_AGE_SECONDS
    )
      return null;
    return claims.employeeId;
  } catch {
    return null;
  }
}

export function sessionCookie(
  token: string,
  clear = false,
  request?: Request,
): string {
  const requestHttps = request
    ? new URL(request.url).protocol === "https:"
    : false;
  let configuredHttps = false;
  try {
    configuredHttps =
      new URL(process.env.APP_ORIGIN ?? "").protocol === "https:";
  } catch {
    /* Optional deployment origin. */
  }
  const secure = requestHttps || configuredHttps ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${clear ? "" : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_MAX_AGE_SECONDS}${secure}`;
}

export async function readSession(
  request: Request,
): Promise<DemoSession | null> {
  // Validate production configuration even before the first login.
  sessionSecret();
  const cookies = request.headers.get("cookie") ?? "";
  const matches = cookies
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (matches.length !== 1) return null;
  const employeeId = verifyDemoSession(
    matches[0].slice(SESSION_COOKIE_NAME.length + 1),
  );
  if (!employeeId) return null;
  const employees = (await getIdentityDataset()).employeesById;
  const employee = Object.hasOwn(employees, employeeId)
    ? employees[employeeId]
    : undefined;
  if (!employee) return null;
  return {
    employeeId: employee.id,
    fullName: employee.fullName,
    role: employee.role === "HR Business Partner" ? "hr" : "employee",
  };
}
