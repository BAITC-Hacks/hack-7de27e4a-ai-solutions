import { reviewRequestSchema } from "@/lib/evaluation/ai-contracts";
import { createReviewProvider } from "../review/provider";
import { reviewEvidence } from "../review/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This endpoint verifies explanations against submitted numeric evidence, including
// browser imports. /review separately reconstructs evidence from the server dataset.
const MAX_BODY_BYTES = 64_000;
const BODY_TIMEOUT_MS = 3_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
const MAX_CONCURRENT_EXPLANATIONS = 4;
let windowStartedAt: number | undefined;
let requestCount = 0;
let activeExplanations = 0;

class BodyLimitError extends Error {}
class BodyTimeoutError extends Error {}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function hasAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host") ?? new URL(request.url).host;
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && url.host === host;
  } catch {
    return false;
  }
}

function isRateLimited(): boolean {
  const now = Date.now();
  if (
    windowStartedAt === undefined ||
    now - windowStartedAt >= RATE_WINDOW_MS
  ) {
    windowStartedAt = now;
    requestCount = 0;
  }
  requestCount += 1;
  return requestCount > RATE_LIMIT;
}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new BodyLimitError();
  }
  if (!request.body) throw new SyntaxError("Empty request body");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new BodyTimeoutError()), BODY_TIMEOUT_MS);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) throw new BodyLimitError();
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function POST(request: Request): Promise<Response> {
  if (
    !hasAllowedOrigin(request) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return json({ error: "ORIGIN_NOT_ALLOWED" }, { status: 403 });
  }
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    return json({ error: "EXPECTED_JSON" }, { status: 415 });
  }
  // One constant-memory deployment bucket; proxy headers cannot create new buckets.
  if (isRateLimited()) {
    return json(
      { error: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  if (activeExplanations >= MAX_CONCURRENT_EXPLANATIONS) {
    return json(
      { error: "BUSY" },
      { status: 503, headers: { "Retry-After": "2" } },
    );
  }

  // Reserve before the first await so simultaneous body reads cannot bypass the cap.
  activeExplanations += 1;
  try {
    let input: unknown;
    try {
      input = await readBoundedJson(request);
    } catch (error) {
      if (error instanceof BodyLimitError)
        return json({ error: "BODY_TOO_LARGE" }, { status: 413 });
      if (error instanceof BodyTimeoutError)
        return json({ error: "REQUEST_TIMEOUT" }, { status: 408 });
      return json({ error: "INVALID_JSON" }, { status: 400 });
    }
    const parsed = reviewRequestSchema.safeParse(input);
    if (!parsed.success) {
      return json(
        {
          error: "INVALID_EVIDENCE",
          message:
            "Send only language and validated candidate evidence with at least three factors.",
        },
        { status: 400 },
      );
    }
    const apiKey = process.env.LLM_API_KEY?.trim();
    const provider = apiKey
      ? createReviewProvider({
          apiKey,
          baseUrl: process.env.LLM_BASE_URL ?? "",
          model: process.env.LLM_MODEL ?? "",
        })
      : undefined;
    const configuredTimeout = Number(
      process.env.LLM_TIMEOUT_MS?.trim() || 2_500,
    );
    const timeoutMs = Number.isFinite(configuredTimeout)
      ? Math.max(100, Math.min(3_000, configuredTimeout))
      : 2_500;
    // reviewEvidence also bounds providers that ignore AbortSignal via Promise.race.
    return json(await reviewEvidence(parsed.data, { provider, timeoutMs }));
  } finally {
    activeExplanations -= 1;
  }
}
