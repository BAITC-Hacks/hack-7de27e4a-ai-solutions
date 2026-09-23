import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/ai/review/route";
import { recommendForEmployee } from "@/domain/recommendation";

import { loadChallengeDataset } from "../recommendation/test-utils";

beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

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
    headers,
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
