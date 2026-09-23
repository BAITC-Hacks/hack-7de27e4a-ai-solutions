import { agentStepRequestSchema } from "@/lib/evaluation/agent-contracts";
import {
  ApiError,
  apiError,
  apiJson,
  checkWriteOrigin,
  readJson,
  requireSession,
} from "@/lib/identity/http";
import { createAgentProvider, isAgentProviderConfigured } from "./provider";
import { runAgentStep } from "./service";
import { readAgentTimeout, readProviderConfig } from "../provider-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let activeRequests = 0;
let windowStartedAt = 0;
let requestCount = 0;

async function requireHR(request: Request): Promise<void> {
  const session = await requireSession(request);
  if (session.role !== "hr") throw new ApiError(403, "FORBIDDEN");
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requireHR(request);
    const config = readProviderConfig();
    const configured = config.apiKey && isAgentProviderConfigured(config);
    return apiJson({
      status: !config.apiKey ? "no_key" : configured ? "available" : "unavailable",
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  let reserved = false;
  try {
    checkWriteOrigin(request);
    if (
      request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase() !== "application/json"
    )
      throw new ApiError(415, "EXPECTED_JSON");
    const now = Date.now();
    if (
      !windowStartedAt ||
      now - windowStartedAt >= 60_000 ||
      now < windowStartedAt
    ) {
      windowStartedAt = now;
      requestCount = 0;
    }
    if (++requestCount > 20) throw new ApiError(429, "RATE_LIMITED", 60);
    if (activeRequests >= 4) throw new ApiError(503, "BUSY", 2);
    // Include identity and body reads in the cap, not only provider execution.
    activeRequests++;
    reserved = true;
    await requireHR(request);
    const input = await readJson(request, agentStepRequestSchema, 512_000);
    const config = readProviderConfig();
    const provider = config.apiKey ? createAgentProvider(config) : undefined;
    return apiJson(
      await runAgentStep(input, {
        provider,
        timeoutMs: readAgentTimeout(),
        signal: request.signal,
      }),
    );
  } catch (error) {
    return apiError(error);
  } finally {
    if (reserved) activeRequests--;
  }
}
