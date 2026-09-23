import { MAX_AGENT_STEPS, TOTAL_AGENT_TIMEOUT_MS, agentStepRequestSchema, agentStepResponseSchema, agentToolResultSchema, type AgentHistoryEntry, type AgentStepRequest, type AgentStepResponse, type AgentToolCall, type AgentToolResult, type AgentClaim } from './agent-contracts';
import { renderAgentClaims, verifyAgentAnswer } from './agent-grounding';

export type AgentRunStatus = 'verified' | 'no_key' | 'blocked' | 'timeout' | 'step_limit' | 'cancelled';
export interface AgentRunResult { status: AgentRunStatus; text: string; history: AgentHistoryEntry[]; reason?: string; latencyMs: number }
export type AgentStepTransport = (request: AgentStepRequest, signal: AbortSignal) => Promise<AgentStepResponse>;

export const requestAgentStep: AgentStepTransport = async (request, signal) => {
  const response = await fetch('/api/ai/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal, cache: 'no-store' });
  if (!response.ok) throw new Error('AGENT_HTTP_ERROR');
  // Bound even an unexpected/replaced endpoint before parsing anything into the UI.
  const reader = response.body?.getReader();
  if (!reader) throw new Error('EMPTY_RESPONSE');
  let size = 0, text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 128000) throw new Error('RESPONSE_TOO_LARGE');
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  return agentStepResponseSchema.parse(JSON.parse(text));
};

/** Exact partial facts; used for limits, outage or blocked output. No generated prose. */
export function partialAgentSummary(history: AgentHistoryEntry[], language: AgentStepRequest['language']): string {
  const claims: AgentClaim[] = history.flatMap(entry => entry.result.facts.slice(0, 6).map(fact => {
    const { id, ...value } = fact;
    return { ...value, factId: id, evidenceId: entry.result.evidenceId };
  }));
  return renderAgentClaims(claims, language);
}

/** Read-only tools run locally; the server receives only the projected facts and user question. */
export async function runHRAgent(options: {
  question: string; language: AgentStepRequest['language'];
  execute: (call: AgentToolCall, step: number) => AgentToolResult;
  transport?: AgentStepTransport; signal?: AbortSignal;
  timeoutMs?: number; onStep?: (history: AgentHistoryEntry[]) => void;
}): Promise<AgentRunResult> {
  const started = performance.now();
  const history: AgentHistoryEntry[] = [];
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  let timedOut = false;
  const budget = Math.max(1, Math.min(options.timeoutMs ?? TOTAL_AGENT_TIMEOUT_MS, TOTAL_AGENT_TIMEOUT_MS));
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, budget);
  const finish = (status: AgentRunStatus, reason?: string, text?: string): AgentRunResult => ({ status, reason, history: [...history], text: text ?? partialAgentSummary(history, options.language), latencyMs: Math.round(performance.now() - started) });
  const interrupt = () => finish(timedOut ? 'timeout' : 'cancelled', timedOut ? 'TOTAL_TIMEOUT' : 'CANCELLED');
  const checkDeadline = () => {
    if (!controller.signal.aborted && performance.now() - started >= budget) { timedOut = true; controller.abort(); }
    return controller.signal.aborted;
  };
  const transport = options.transport ?? requestAgentStep;
  try {
    for (let round = 0; round <= MAX_AGENT_STEPS; round++) {
      if (checkDeadline()) return interrupt();
      const request = agentStepRequestSchema.parse({ question: options.question, language: options.language, history });
      // Race enforces budget even when a mock or a network transport ignores abort.
      const response = await new Promise<AgentStepResponse>((resolve, reject) => {
        const abort = () => { cleanup(); reject(new Error('ABORTED')); };
        const cleanup = () => controller.signal.removeEventListener('abort', abort);
        controller.signal.addEventListener('abort', abort, { once: true });
        if (controller.signal.aborted) abort();
        else Promise.resolve().then(() => transport(request, controller.signal)).then(
          value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); },
        );
      });
      if (controller.signal.aborted || performance.now() - started >= budget) { timedOut ||= !options.signal?.aborted; return interrupt(); }
      const next = agentStepResponseSchema.parse(response);
      if (next.status === 'answer') {
        const verified = verifyAgentAnswer({ claims: next.claims, text: next.text }, history);
        if (!verified.valid) return finish('blocked', verified.reasons.join(','));
        // Recheck both free text and claim tuples against locally witnessed results.
        return finish('verified', undefined, verified.text);
      }
      if (next.status !== 'tools') return finish(next.status === 'blocked' && next.reason === 'STEP_LIMIT' ? 'step_limit' : next.status, next.reason);
      if (history.length >= MAX_AGENT_STEPS) return finish('step_limit', 'STEP_LIMIT');
      const call = next.calls[0];
      if (history.some(entry => entry.call.id === call.id)) return finish('blocked', 'REPEATED_CALL_ID');
      let result: AgentToolResult;
      try {
        result = agentToolResultSchema.parse(options.execute(call, history.length + 1));
        agentStepRequestSchema.parse({ ...request, history: [...history, { call, result }] });
      } catch { return finish('blocked', 'INVALID_TOOL_ARGUMENTS_OR_RESULT'); }
      history.push({ call, result });
      options.onStep?.([...history]);
      if (checkDeadline()) return interrupt();
    }
    return finish('step_limit', 'STEP_LIMIT');
  } catch {
    return controller.signal.aborted ? interrupt() : finish('blocked', 'AGENT_UNAVAILABLE_OR_INVALID_RESPONSE');
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener('abort', onAbort);
  }
}
