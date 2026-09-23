import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getIdentityDataset,
  readSession,
  SESSION_COOKIE_NAME,
  signDemoSession,
  verifyDemoSession,
} from "@/lib/identity";
import { GET, POST, DELETE } from "@/app/api/identity/session/route";
import { GET as people } from "@/app/api/identity/people/route";
import { conversationFixture, request } from "./fixtures";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret-at-least-thirty-two-bytes");
  vi.stubEnv("APP_ORIGIN", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("Signed demo identity", () => {
  it("accepts the actual browser Host after Next canonicalizes the URL and rejects foreign or forwarded origins", async () => {
    const { requesterId } = await conversationFixture();
    const login = (headers: Record<string, string>) =>
      POST(
        new Request("http://localhost:3000/api/identity/session", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({ employeeId: requesterId }),
        }),
      );
    const accepted = await login({
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
    });
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("set-cookie")).toContain("HttpOnly");
    expect((await accepted.json()).session.employeeId).toBe(requesterId);
    expect(
      (
        await login({
          host: "127.0.0.1:3000",
          origin: "http://attacker.example",
          "x-forwarded-host": "attacker.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await login({
          host: "127.0.0.1:3000@attacker.example",
          origin: "http://attacker.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await login({
          host: "127.0.0.1:3000",
          origin: "https://127.0.0.1:3000",
        })
      ).status,
    ).toBe(403);
    vi.stubEnv("APP_ORIGIN", "https://career.example");
    expect(
      (await login({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }))
        .status,
    ).toBe(403);
    expect(
      (
        await login({
          host: "localhost:3000",
          origin: "https://career.example",
        })
      ).status,
    ).toBe(200);
  });

  it("requires a valid HMAC, bounded lifetime and a known employee", async () => {
    const { requesterId } = await conversationFixture();
    const token = signDemoSession(requesterId);
    expect(verifyDemoSession(token)).toBe(requesterId);
    const [payload, signature] = token.split(".");
    expect(
      verifyDemoSession(
        `${payload}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`,
      ),
    ).toBeNull();
    const forgedPayload = Buffer.from(
      JSON.stringify({
        employeeId: requesterId,
        role: "hr",
        issuedAt: 1,
        exp: 9999999999,
      }),
    ).toString("base64url");
    expect(verifyDemoSession(`${forgedPayload}.${signature}`)).toBeNull();
    expect(
      verifyDemoSession(
        signDemoSession(requesterId, Date.now() - 9 * 60 * 60 * 1000),
      ),
    ).toBeNull();
    expect(
      verifyDemoSession(signDemoSession(requesterId, Date.now() + 120_000)),
    ).toBeNull();
    expect(await readSession(request("/", "UNKNOWN_EMPLOYEE"))).toBeNull();
    expect(await readSession(request("/", "__proto__"))).toBeNull();
    expect(
      await readSession(
        new Request("http://localhost", {
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${token}; ${SESSION_COOKIE_NAME}=${token}`,
          },
        }),
      ),
    ).toBeNull();
  });

  it("derives HR access from trusted data and rejects injected roles or unknown identities", async () => {
    const { requesterId, hrId } = await conversationFixture();
    expect(await readSession(request("/", requesterId))).toMatchObject({
      employeeId: requesterId,
      role: "employee",
    });
    expect(await readSession(request("/", hrId))).toMatchObject({
      employeeId: hrId,
      role: "hr",
    });
    const staleLogout = await DELETE(
      request("/api/identity/session", hrId, "DELETE", undefined, {
        "x-career-identity": requesterId,
      }),
    );
    expect(staleLogout.status).toBe(409);
    expect(staleLogout.headers.get("set-cookie")).toBeNull();
    expect(
      (
        await POST(
          request("/api/identity/session", undefined, "POST", {
            employeeId: requesterId,
            role: "hr",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request("/api/identity/session", undefined, "POST", {
            employeeId: "UNKNOWN",
          }),
        )
      ).status,
    ).toBe(400);
    const response = await POST(
      request("/api/identity/session", undefined, "POST", { employeeId: hrId }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      session: {
        employeeId: hrId,
        fullName: (await getIdentityDataset()).employeesById[hrId].fullName,
        role: "hr",
      },
    });
  });

  it("sets httpOnly SameSite cookies, supports production localhost and uses Secure for HTTPS", async () => {
    const { requesterId } = await conversationFixture();
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(
      request("/api/identity/session", undefined, "POST", {
        employeeId: requesterId,
      }),
    );
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=28800");
    expect(cookie).not.toContain("Secure");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const secure = await POST(
      new Request("https://career.example/api/identity/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://career.example",
        },
        body: JSON.stringify({ employeeId: requesterId }),
      }),
    );
    expect(secure.headers.get("set-cookie")).toContain("Secure");
    expect(
      (
        await DELETE(request("/api/identity/session", requesterId, "DELETE"))
      ).headers.get("set-cookie"),
    ).toContain("Max-Age=0");
  });

  it("fails closed without a production secret while rejecting cross-site writes", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    expect((await GET(request("/api/identity/session"))).status).toBe(503);
    expect(
      (
        await DELETE(
          request("/api/identity/session", undefined, "DELETE", undefined, {
            "sec-fetch-site": "cross-site",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          request(
            "/api/identity/session",
            undefined,
            "POST",
            { employeeId: "E0001" },
            { origin: "https://evil.example" },
          ),
        )
      ).status,
    ).toBe(403);
  });

  it("returns only the minimal demo identity directory without skills or history", async () => {
    const response = await people();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.people.length).toBe(
      Object.keys((await getIdentityDataset()).employeesById).length,
    );
    for (const person of body.people)
      expect(Object.keys(person).sort()).toEqual([
        "access",
        "department",
        "employeeId",
        "fullName",
        "grade",
        "role",
      ]);
    expect(await (await GET(request("/api/identity/session"))).json()).toEqual({
      session: null,
    });
  });
});
