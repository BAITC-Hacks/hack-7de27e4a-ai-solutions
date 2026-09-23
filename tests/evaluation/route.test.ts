import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/ai/review/route";
import { recommendForEmployee } from "@/domain/recommendation";
import { SESSION_COOKIE_NAME, signDemoSession } from "@/lib/identity";

import { loadChallengeDataset } from "../recommendation/test-utils";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("SESSION_SECRET", "route-test-secret-at-least-thirty-two-bytes"); });

const dataset = loadChallengeDataset();
const engineResult = Object.keys(dataset.employeesById)
  .sort()
  .map((employeeId) => recommendForEmployee(dataset, employeeId))
  .find((result) => result.recommendations.length > 0);

if (!engineResult) throw new Error("Challenge dataset has no recommendable employee");

const requestFixture = () => ({
  employeeId: engineResult.employeeId,
  language: engineResult.effectiveProfile.employee.preferredLanguage,
  candidateIds: engineResult.recommendations.slice(0, 3).map((item) => item.activityId),
  completedActivityIds: [],
});

const post = (
  body: unknown,
  headers: Record<string, string> = { "Content-Type": "application/json" },
) =>
  new Request("http://localhost:3000/api/ai/review", {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE_NAME}=${signDemoSession(engineResult.employeeId)}`, ...headers },
    body: JSON.stringify(body),
  });

describe("AI route", () => {
  it("blocks a custom endpoint without an explicit model before making any provider request", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("LLM_MODEL", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(post(requestFixture()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "blocked", blockedReasons: ["PROVIDER_CONFIG_INVALID"] });
    expect(fetcher).not.toHaveBeenCalled();
  });


  it("rejects anonymous requests and another employee's private server evidence", async () => {
    const anonymous = await POST(post(requestFixture(), { "content-type": "application/json", cookie: "" }));
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: "AUTH_REQUIRED" });
    const other = Object.values(dataset.employeesById).find((employee) => employee.id !== engineResult.employeeId && employee.role !== "HR Business Partner")!;
    const forbidden = await POST(post(requestFixture(), { "content-type": "application/json", cookie: `${SESSION_COOKIE_NAME}=${signDemoSession(other.id)}` }));
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("cache-control")).toBe("no-store");
    expect(await forbidden.json()).toEqual({ error: "FORBIDDEN" });
    const changed = await POST(post(requestFixture(), { "content-type": "application/json", "x-career-identity": other.id }));
    expect(changed.status).toBe(409);
    expect(await changed.json()).toEqual({ error: "SESSION_CHANGED" });
  });

  it("allows a trusted HR session and fails safely when production identity is unavailable", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const hr = Object.values(dataset.employeesById).find((employee) => employee.role === "HR Business Partner")!;
    const permitted = await POST(post(requestFixture(), { "content-type": "application/json", cookie: `${SESSION_COOKIE_NAME}=${signDemoSession(hr.id)}` }));
    expect(permitted.status).toBe(200);
    expect((await permitted.json()).status).toBe("no_key");
    const request = post(requestFixture());
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    const unavailable = await POST(request);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: "IDENTITY_UNAVAILABLE" });
  });
  it("returns a no-store localized fallback without a key", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const response = await POST(post(requestFixture()));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      status: "no_key",
      language: requestFixture().language,
      selectedCandidateIds: requestFixture().candidateIds,
      fallbackUsed: true,
    });
  });

  it("rejects raw profile, malformed input, cross-origin and oversized requests", async () => {
    expect(
      (await POST(post({ ...requestFixture(), employee: { name: "PRIVATE" } }))).status,
    ).toBe(400);
    expect(
      (await POST(post(requestFixture(), { "Content-Type": "text/plain" }))).status,
    ).toBe(415);
    expect(
      (
        await POST(
          post(requestFixture(), {
            "Content-Type": "application/json",
            origin: "https://other.test",
          }),
        )
      ).status,
    ).toBe(403);
    expect((await POST(post({ text: "x".repeat(5_000) }))).status).toBe(413);
  });

  it("accepts same-host browser Origin when Next uses a different internal URL", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const response = await POST(
      post(requestFixture(), {
        "Content-Type": "application/json; charset=utf-8",
        host: "127.0.0.1:3140",
        origin: "http://127.0.0.1:3140",
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("no_key");
  });
});
