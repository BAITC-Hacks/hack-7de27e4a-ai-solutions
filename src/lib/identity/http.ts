import { z } from "zod";
import { IdentityUnavailableError, readSession } from "./index";
import type { DemoSession } from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfter?: number,
  ) {
    super(code);
  }
}

export function apiJson(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function apiError(error: unknown): Response {
  if (error instanceof ApiError)
    return apiJson(
      { error: error.code },
      {
        status: error.status,
        ...(error.retryAfter
          ? { headers: { "Retry-After": String(error.retryAfter) } }
          : {}),
      },
    );
  if (error instanceof IdentityUnavailableError)
    return apiJson({ error: error.code }, { status: 503 });
  return apiJson({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
}

export async function requireSession(request: Request): Promise<DemoSession> {
  const session = await readSession(request);
  if (!session) throw new ApiError(401, "AUTH_REQUIRED");
  const expected = request.headers.get("x-career-identity");
  if (expected && expected !== session.employeeId)
    throw new ApiError(409, "SESSION_CHANGED");
  return session;
}

export function checkWriteOrigin(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "FORBIDDEN");
  const origin = request.headers.get("origin");
  if (!origin) return;
  try {
    const parsed = new URL(origin);
    const configured = process.env.APP_ORIGIN?.trim();
    let expected: URL;
    if (configured) {
      expected = new URL(configured);
    } else {
      // Next may canonicalize request.url to localhost. Host is the browser-facing
      // authority; forwarded host headers remain untrusted without APP_ORIGIN.
      const internal = new URL(request.url);
      const host = request.headers.get("host") ?? internal.host;
      if (!/^[A-Za-z0-9.\-:[\]]+$/.test(host)) throw new Error("Invalid Host");
      expected = new URL(`${internal.protocol}//${host}`);
    }
    if (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash &&
      (expected.protocol === "https:" || expected.protocol === "http:") &&
      !expected.username &&
      !expected.password &&
      expected.pathname === "/" &&
      !expected.search &&
      !expected.hash &&
      parsed.origin === expected.origin
    )
      return;
  } catch {
    /* Invalid origins are denied. */
  }
  throw new ApiError(403, "FORBIDDEN");
}

export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maximum = 16_384,
): Promise<T> {
  checkWriteOrigin(request);
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  )
    throw new ApiError(415, "EXPECTED_JSON");
  if (Number(request.headers.get("content-length")) > maximum)
    throw new ApiError(413, "BODY_TOO_LARGE");
  if (!request.body) throw new ApiError(400, "INVALID_JSON");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0,
    text = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new ApiError(408, "REQUEST_TIMEOUT")),
      3000,
    );
  });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new ApiError(413, "BODY_TOO_LARGE");
      text += decoder.decode(value, { stream: true });
    }
    let value: unknown;
    try {
      value = JSON.parse(text + decoder.decode());
    } catch {
      throw new ApiError(400, "INVALID_JSON");
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new ApiError(400, "INVALID_REQUEST");
    return parsed.data;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
