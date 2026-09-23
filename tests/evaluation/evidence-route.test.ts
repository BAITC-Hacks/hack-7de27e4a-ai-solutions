import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestAIExplanation } from "../../src/lib/evaluation/client";
import { deterministicReasons } from "../../src/lib/evaluation/explanations";
import { requestFixture } from "./fixtures";

let POST: typeof import("../../src/app/api/ai/explain/route").POST;
beforeEach(async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.resetModules();
  ({ POST } = await import("../../src/app/api/ai/explain/route"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const post = (
  body: unknown,
  headers: Record<string, string> = { "Content-Type": "application/json" },
) =>
  new Request("http://localhost:3000/api/ai/explain", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

describe("Evidence explanation route", () => {
  it.each(["ru", "kk", "en"] as const)(
    "preserves the browser-import evidence contract without a key in %s",
    async (language) => {
      vi.stubEnv("LLM_API_KEY", "");
      // Fixture IDs are absent from the bundled server dataset; no employee profile is sent.
      const request = { ...requestFixture(), language };
      const response = await POST(post(request));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        status: "no_key",
        language,
        candidateIds: ["EV_MENTORING"],
      });
      const fetcher = vi.fn(
        async (url: string | URL | Request, init?: RequestInit) => {
          expect(url).toBe("/api/ai/explain");
          return POST(new Request(`http://localhost:3000${String(url)}`, init));
        },
      );
      const result = await requestAIExplanation(request, fetcher);
      expect(result.status).toBe("no_key");
      expect(result.reasons).toEqual(deterministicReasons(request));
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );

  it("rejects raw profile, malformed input, cross-origin and oversized streamed requests", async () => {
    expect(
      (await POST(post({ ...requestFixture(), employee: { name: "PRIVATE" } })))
        .status,
    ).toBe(400);
    expect(
      (await POST(post(requestFixture(), { "Content-Type": "text/plain" })))
        .status,
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
    expect((await POST(post({ text: "x".repeat(64001) }))).status).toBe(413);
    expect(
      (
        await POST(
          new Request("http://localhost/api/ai/explain", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
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

  it("rejects cross-site requests without Origin and misleading JSON media types before calling the provider", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const [headers, status] of [
      [
        { "content-type": "application/json", "sec-fetch-site": "cross-site" },
        403,
      ],
      [{ "content-type": "application/jsonp" }, 415],
    ] as const) {
      const response = await POST(post(requestFixture(), headers));
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("enforces one deployment rate bucket despite spoofed proxy headers and resets the window", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    for (let index = 0; index < 20; index += 1) {
      expect(
        (
          await POST(
            post(requestFixture(), {
              "content-type": "application/json",
              "x-forwarded-for": `192.0.2.${index}`,
            }),
          )
        ).status,
      ).toBe(200);
    }
    const limited = await POST(
      post(requestFixture(), {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.1",
      }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(limited.headers.get("cache-control")).toBe("no-store");
    vi.setSystemTime(70_000);
    expect((await POST(post(requestFixture()))).status).toBe(200);
  });

  it("caps simultaneous explanations, bounds an uncooperative provider and releases every slot", async () => {
    vi.useFakeTimers();
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("LLM_MODEL", "test-model");
    vi.stubEnv("LLM_TIMEOUT_MS", "999999");
    const fetcher = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetcher);
    const pending = Array.from({ length: 4 }, () =>
      POST(post(requestFixture())),
    );
    const busy = await POST(post(requestFixture()));
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).toBe("2");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(3_000);
    for (const response of await Promise.all(pending)) {
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        status: "timeout",
        candidateIds: ["EV_MENTORING"],
      });
    }
    for (const call of fetcher.mock.calls) {
      const init = (call as unknown as [string, RequestInit])[1];
      expect(init.signal?.aborted).toBe(true);
    }
    vi.stubEnv("LLM_API_KEY", "");
    expect((await POST(post(requestFixture()))).status).toBe(200);
    const cancel = vi.fn();
    const stalledBody = new ReadableStream<Uint8Array>({ cancel });
    const stalled = POST(
      new Request("http://localhost/api/ai/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: stalledBody,
        duplex: "half",
      } as RequestInit),
    );
    await vi.advanceTimersByTimeAsync(3_000);
    const timedOutBody = await stalled;
    expect(timedOutBody.status).toBe(408);
    expect(timedOutBody.headers.get("cache-control")).toBe("no-store");
    expect(cancel).toHaveBeenCalledOnce();
    expect((await POST(post(requestFixture()))).status).toBe(200);
  });
});
