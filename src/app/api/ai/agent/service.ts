import { z } from 'zod';
import { MAX_AGENT_STEPS, agentStepRequestSchema, agentToolCallSchema, type AgentStepRequest, type AgentStepResponse } from '../../../../lib/evaluation/agent-contracts';
import { verifyAgentAnswer } from '../../../../lib/evaluation/agent-grounding';

export type AgentProvider = (request: AgentStepRequest, signal: AbortSignal) => Promise<unknown>;
export interface AgentStepOptions { provider?: AgentProvider; timeoutMs?: number; signal?: AbortSignal }
const decisionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('tools'), calls: z.array(agentToolCallSchema).length(1) }).strict(),
  z.object({ status: z.literal('answer'), answer: z.unknown() }).strict(),
]);
const safeProviderReasons = new Set(['PROVIDER_ACCESS_DENIED', 'PROVIDER_RATE_LIMIT', 'PROVIDER_BAD_REQUEST', 'PROVIDER_UNAVAILABLE', 'PROVIDER_CONFIG_INVALID']);

/** One bounded model round. Browser owns the shared dataset and executes validated tools locally. */
export async function runAgentStep(input: unknown, options: AgentStepOptions = {}): Promise<AgentStepResponse> {
  const parsed = agentStepRequestSchema.safeParse(input);
  if (!parsed.success) return { status: 'blocked', reason: 'INVALID_REQUEST' };
  const request = parsed.data;
  if (!options.provider) return { status: 'no_key', reason: 'AGENT_DISABLED' };
  if (options.signal?.aborted) return { status: 'timeout', reason: 'REQUEST_ABORTED' };
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, Math.min(30000, options.timeoutMs!)) : 10000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const timedOut = Symbol('timeout');
  try {
    const timeout = new Promise<typeof timedOut>(resolve => {
      const end = () => { resolve(timedOut); controller.abort(); };
      timer = setTimeout(end, timeoutMs);
      abortListener = end;
      options.signal?.addEventListener('abort', end, { once: true });
    });
    const raw = await Promise.race([Promise.resolve().then(() => options.provider!(request, controller.signal)), timeout]);
    if (raw === timedOut) return { status: 'timeout', reason: 'TIME_BUDGET_EXCEEDED' };
    const decision = decisionSchema.safeParse(raw);
    if (!decision.success) return { status: 'blocked', reason: 'INVALID_MODEL_OUTPUT' };
    if (decision.data.status === 'tools') {
      if (request.history.length >= MAX_AGENT_STEPS) return { status: 'blocked', reason: 'STEP_LIMIT' };
      const nextId = decision.data.calls[0].id;
      if (request.history.some(entry => entry.call.id === nextId)) return { status: 'blocked', reason: 'REPEATED_CALL_ID' };
      return decision.data;
    }
    const verified = verifyAgentAnswer(decision.data.answer, request.history);
    if (!verified.valid) return { status: 'blocked', reason: verified.reasons[0] };
    return { status: 'answer', claims: verified.claims, text: verified.text };
  } catch (error) {
    return controller.signal.aborted ? { status: 'timeout', reason: 'TIME_BUDGET_EXCEEDED' }
      : { status: 'blocked', reason: error instanceof Error && safeProviderReasons.has(error.message) ? error.message : 'PROVIDER_UNAVAILABLE' };
  } finally {
    if (timer) clearTimeout(timer);
    if (abortListener) options.signal?.removeEventListener('abort', abortListener);
    controller.abort();
  }
}
