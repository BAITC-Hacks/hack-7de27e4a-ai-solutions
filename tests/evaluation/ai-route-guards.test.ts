import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getIdentityDataset,
  SESSION_COOKIE_NAME,
  signDemoSession,
} from "@/lib/identity";
import { recommendForEmployee } from "@/domain/recommendation";
import { loadChallengeDataset } from "../recommendation/test-utils";

const dataset = loadChallengeDataset();
const hrId = Object.values(dataset.employeesById).find(
  (employee) => employee.role === "HR Business Partner",
)!.id;
const employeeId = Object.values(dataset.employeesById).find(
  (employee) =>
    employee.role !== "HR Business Partner" &&
    recommendForEmployee(dataset, employee.id).recommendations.length,
)!.id;
const review = {
  employeeId,
  language: "ru",
  candidateIds: recommendForEmployee(dataset, employeeId).recommendations.map(
    (item) => item.activityId,
  ),
  completedActivityIds: [],
};
const agent = {
  language: "ru",
  question: "Покажи разрывы навыков",
  history: [],
};
const signed = (id = hrId) => ({
  cookie: `${SESSION_COOKIE_NAME}=${signDemoSession(id)}`,
});
const request = (
  route: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`http://localhost:3000/api/ai/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...signed(), ...headers },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.resetModules();
  vi.stubEnv(
    "SESSION_SECRET",
    "ai-guard-test-secret-at-least-thirty-two-bytes",
  );
  vi.stubEnv("APP_ORIGIN", "");
  vi.stubEnv("LLM_API_KEY", "");
  await getIdentityDataset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AI endpoint authorization and request resource bounds", () => {
  it("requires a current signed HR identity for both agent configuration and execution", async () => {
    const { GET, POST } = await import("@/app/api/ai/agent/route");
    for (const [headers, status] of [
      [{ cookie: "" }, 401],
      [signed(employeeId), 403],
      [{ ...signed(), "x-career-identity": employeeId }, 409],
    ] as const) {
      const get = await GET(
        new Request("http://localhost:3000/api/ai/agent", { headers }),
      );
      const post = await POST(request("agent", agent, headers));
      expect(get.status).toBe(status);
      expect(post.status).toBe(status);
      expect(get.headers.get("cache-control")).toBe("no-store");
      expect(post.headers.get("cache-control")).toBe("no-store");
    }
    expect((await POST(request("agent", agent))).status).toBe(200);
    const configuredRequest = request("agent", agent);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    expect((await POST(configuredRequest)).status).toBe(503);
  });

  it.each(["review", "agent"] as const)(
    "%s reserves four slots before slow bodies and releases them on the body deadline",
    async (name) => {
      const { POST } =
        name === "review"
          ? await import("@/app/api/ai/review/route")
          : await import("@/app/api/ai/agent/route");
      vi.useFakeTimers();
      const cancelled = vi.fn();
      const pending = Array.from({ length: 4 }, () => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
          },
          cancel: cancelled,
        });
        return POST(
          new Request(`http://localhost:3000/api/ai/${name}`, {
            method: "POST",
            headers: { "content-type": "application/json", ...signed() },
            body,
            duplex: "half",
          } as RequestInit & { duplex: "half" }),
        );
      });
      const overloaded = await POST(
        request(name, name === "review" ? review : agent),
      );
      expect(overloaded.status).toBe(503);
      expect(await overloaded.json()).toMatchObject({ error: "BUSY" });
      await vi.advanceTimersByTimeAsync(3001);
      const finished = await Promise.all(pending);
      for (const response of finished) {
        expect(response.status).toBe(408);
        expect(await response.json()).toEqual({ error: "REQUEST_TIMEOUT" });
      }
      expect(cancelled).toHaveBeenCalledTimes(4);
      expect(
        (await POST(request(name, name === "review" ? review : agent))).status,
      ).toBe(200);
    },
  );

  it.each(["review", "agent"] as const)(
    "%s uses strict deployment origin and rejects JSON-prefix MIME spoofing",
    async (name) => {
      const { POST } =
        name === "review"
          ? await import("@/app/api/ai/review/route")
          : await import("@/app/api/ai/agent/route");
      const body = name === "review" ? review : agent;
      expect(
        (
          await POST(
            request(name, body, {
              host: "localhost:3000",
              origin: "https://localhost:3000",
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (await POST(request(name, body, { "sec-fetch-site": "cross-site" })))
          .status,
      ).toBe(403);
      expect(
        (
          await POST(
            request(name, body, { "content-type": "application/jsonp" }),
          )
        ).status,
      ).toBe(415);
      vi.stubEnv("APP_ORIGIN", "https://career.example");
      expect(
        (await POST(request(name, body, { origin: "http://localhost:3000" })))
          .status,
      ).toBe(403);
      expect(
        (await POST(request(name, body, { origin: "https://career.example" })))
          .status,
      ).toBe(200);
    },
  );

  it("bounds HR agent model requests per deployment without trusting proxy identity headers", async () => {
    const { POST } = await import("@/app/api/ai/agent/route");
    for (let i = 0; i < 20; i++)
      expect(
        (
          await POST(
            request("agent", agent, { "x-forwarded-for": `192.0.2.${i}` }),
          )
        ).status,
      ).toBe(200);
    const limited = await POST(
      request("agent", agent, { "x-forwarded-for": "192.0.2.200" }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
  });
});
