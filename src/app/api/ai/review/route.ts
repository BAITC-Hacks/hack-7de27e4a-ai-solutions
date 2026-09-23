import { loadBundledDataset } from "@/domain/data/server";
import { recommendForEmployee } from "@/domain/recommendation";
import { applyActivityCompletion } from "@/domain/simulation";
import {
  ApiError,
  apiError,
  checkWriteOrigin,
  requireSession,
} from "@/lib/identity/http";
import {
  buildCriticRequest,
  criticApiRequestSchema,
  runBoundedCritic,
  deterministicCriticFallback,
} from "@/lib/evaluation/critic";

import { readProviderConfig } from "../provider-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
const MAX_CONCURRENT_REVIEWS = 4;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

let activeReviews = 0;
let bundledDatasetPromise: ReturnType<typeof loadBundledDataset> | null = null;

class PayloadTooLargeError extends Error {}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function hasAllowedOrigin(request: Request): boolean {
  try {
    checkWriteOrigin(request);
    return true;
  } catch {
    return false;
  }
}

function configuredTimeout(value: string | undefined): number {
  if (!value?.trim()) return 2_500;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 2_500;
}

export function createFixedWindowRateLimiter(limit: number, windowMs: number) {
  let startedAt = 0;
  let count = 0;
  return {
    isLimited(now = Date.now()): boolean {
      if (!startedAt || now - startedAt >= windowMs) {
        startedAt = now;
        count = 1;
        return false;
      }
      count += 1;
      return count > limit;
    },
  };
}

// One deployment bucket bounds model usage across all demo identities.
// This cannot be bypassed with caller-controlled proxy headers and has constant memory usage.
const deploymentRateLimiter = createFixedWindowRateLimiter(
  RATE_LIMIT,
  RATE_WINDOW_MS,
);

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError("Request body is too large");
  }
  if (!request.body) throw new SyntaxError("Request body is empty");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new ApiError(408, "REQUEST_TIMEOUT")),
      3000,
    );
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        throw new PayloadTooLargeError("Request body is too large");
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(received);
    let offset = 0;
    chunks.forEach((chunk) => {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    });
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function getBundledDataset() {
  bundledDatasetPromise ??= loadBundledDataset();
  return bundledDatasetPromise;
}

export async function POST(request: Request): Promise<Response> {
  if (!hasAllowedOrigin(request)) {
    return json(
      {
        error: "FORBIDDEN",
        message: "Cross-origin AI review requests are not accepted.",
      },
      { status: 403 },
    );
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return json(
      {
        error: "FORBIDDEN",
        message: "Cross-site AI review requests are not accepted.",
      },
      { status: 403 },
    );
  }
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    return json(
      {
        error: "EXPECTED_JSON",
        message: "Request content type must be application/json.",
      },
      { status: 415 },
    );
  }
  if (deploymentRateLimiter.isLimited()) {
    return json(
      {
        error: "RATE_LIMITED",
        message: "Try the deterministic result and retry later.",
      },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  if (activeReviews >= MAX_CONCURRENT_REVIEWS) {
    return json(
      { error: "BUSY", message: "The bounded critic is at capacity." },
      { status: 503, headers: { "Retry-After": "2" } },
    );
  }

  // Reserve before any asynchronous body or identity work; slow clients also use a slot.
  activeReviews += 1;
  try {
    let payload: unknown;
    try {
      payload = await readBoundedJson(request);
    } catch (error) {
      if (error instanceof ApiError) return apiError(error);
      if (error instanceof PayloadTooLargeError) {
        return json(
          {
            error: "PAYLOAD_TOO_LARGE",
            message: `Request body is limited to ${MAX_BODY_BYTES} bytes.`,
          },
          { status: 413 },
        );
      }
      return json(
        { error: "INVALID_JSON", message: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    const parsed = criticApiRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return json(
        {
          error: "INVALID_REQUEST",
          message:
            "Only employeeId, language, candidateIds and bounded completion IDs are accepted.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    try {
      const session = await requireSession(request);
      if (
        session.employeeId !== parsed.data.employeeId &&
        session.role !== "hr"
      ) {
        return json({ error: "FORBIDDEN" }, { status: 403 });
      }
    } catch (error) {
      return apiError(error);
    }

    try {
      const dataset = await getBundledDataset();
      if (!dataset.employeesById[parsed.data.employeeId]) {
        return json(
          {
            error: "UNKNOWN_EMPLOYEE",
            message: "Employee is not present in the active server dataset.",
          },
          { status: 404 },
        );
      }
      let effectiveDataset = dataset;
      try {
        parsed.data.completedActivityIds.forEach((activityId, index) => {
          effectiveDataset = applyActivityCompletion(
            effectiveDataset,
            parsed.data.employeeId,
            activityId,
            `api-replay:${parsed.data.employeeId}:${String(index).padStart(3, "0")}:${activityId}`,
          ).dataset;
        });
      } catch {
        return json(
          {
            error: "INVALID_PROGRESS",
            message:
              "Local completions must form a valid eligible sequence on the server dataset.",
          },
          { status: 409 },
        );
      }
      const engineResult = recommendForEmployee(
        effectiveDataset,
        parsed.data.employeeId,
        3,
      );
      const recommendationById = new Map(
        engineResult.recommendations.map((recommendation) => [
          recommendation.activityId,
          recommendation,
        ]),
      );
      const selected = parsed.data.candidateIds.map((candidateId) =>
        recommendationById.get(candidateId),
      );
      if (selected.some((recommendation) => !recommendation)) {
        return json(
          {
            error: "CANDIDATE_NOT_ALLOWED",
            message:
              "Candidate IDs must belong to the current deterministic engine shortlist.",
          },
          { status: 409 },
        );
      }

      const criticRequest = buildCriticRequest(
        selected.filter((recommendation) => recommendation !== undefined),
        parsed.data.language,
      );
      const config = readProviderConfig();
      if (config.apiKey && !config.model) return json(deterministicCriticFallback(criticRequest, "blocked", ["PROVIDER_CONFIG_INVALID"]));
      const result = await runBoundedCritic(criticRequest, {
        apiKey: config.apiKey,
        endpoint: config.baseUrl,
        model: config.model,
        timeoutMs: configuredTimeout(process.env.LLM_TIMEOUT_MS),
      });

      return json(result, {
        status: 200,
        headers: NO_STORE_HEADERS,
      });
    } catch (error) {
      return apiError(error);
    }
  } finally {
    activeReviews -= 1;
  }
}
