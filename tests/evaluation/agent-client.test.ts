import { describe, expect, it, vi } from 'vitest';
import { runHRAgent } from '../../src/lib/evaluation/agent-client';
import type { AgentToolCall, AgentToolResult, AgentStepRequest } from '../../src/lib/evaluation/agent-contracts';

const execute = (call: AgentToolCall, step: number): AgentToolResult => ({ callId: call.id, evidenceId: `tool:${step}:${call.name}`, tool: call.name,
  facts: [{ id: 'f1', subjectId: 'E0028', skillId: 'SK_SYSTEM_DESIGN', metric: 'gap', value: 1 }] });
const claim = (request: AgentStepRequest) => {
  const entry = request.history.at(-1)!;
  const { id, ...fact } = entry.result.facts[0];
  return { ...fact, factId: id, evidenceId: entry.result.evidenceId };
};
describe('bounded browser HR agent loop', () => {
  it('executes two different tools and verifies free text against the local trace', async () => {
    const calls = vi.fn(execute);
    const result = await runHRAgent({ question: 'Find gaps and recommendations', language: 'en', execute: calls,
      transport: async request => request.history.length < 2 ? { status: 'tools', calls: [{ id: `call${request.history.length}`, name: request.history.length ? 'getRecommendations' : 'getGaps', arguments: { employeeId: 'E0028' } }] }
        : { status: 'answer', claims: [claim(request)], text: 'E0028 has a gap of 1 in SK_SYSTEM_DESIGN.' } });
    expect(result.status).toBe('verified'); expect(result.history).toHaveLength(2);
    expect(result.history.map(h => h.call.name)).toEqual(['getGaps', 'getRecommendations']);
    expect(result.text).toBe('E0028 has a gap of 1 in SK_SYSTEM_DESIGN.'); expect(calls).toHaveBeenCalledTimes(2);
  });
  it('stops at five executions and exposes partial facts for a looping model', async () => {
    const calls = vi.fn(execute);
    const result = await runHRAgent({ question: 'Loop', language: 'ru', execute: calls,
      transport: async request => ({ status: 'tools', calls: [{ id: `call${request.history.length}`, name: 'getGaps', arguments: { employeeId: 'E0028' } }] }) });
    expect(result.status).toBe('step_limit'); expect(result.history).toHaveLength(5); expect(calls).toHaveBeenCalledTimes(5); expect(result.text).toContain('E0028');
  });
  it('blocks invented numbers and identities against browser-witnessed evidence', async () => {
    for (const changed of [{ value: 4 }, { subjectId: 'UNKNOWN_EMPLOYEE' }]) {
      const result = await runHRAgent({ question: 'Question', language: 'ru', execute,
        transport: async request => request.history.length ? { status: 'answer', claims: [{ ...claim(request), ...changed }], text: 'E0028 has a gap of 1.' }
          : { status: 'tools', calls: [{ id: 'call1', name: 'getGaps', arguments: { employeeId: 'E0028' } }] } });
      expect(result.status).toBe('blocked'); expect(result.reason).toBe('FACT_MISMATCH');
    }
  });
  it('blocks an invented free-text number even when every structured claim is valid', async () => {
    const result = await runHRAgent({ question: 'Question', language: 'en', execute,
      transport: async request => request.history.length ? { status: 'answer', claims: [claim(request)], text: 'E0028 has a gap of 9999.' }
        : { status: 'tools', calls: [{ id: 'call1', name: 'getGaps', arguments: { employeeId: 'E0028' } }] } });
    expect(result.status).toBe('blocked'); expect(result.text).not.toContain('9999'); expect(result.text).toContain('E0028');
  });
  it('returns no_key without invoking any local tool', async () => {
    const calls = vi.fn(execute);
    const result = await runHRAgent({ question: 'Question', language: 'kk', execute: calls, transport: async () => ({ status: 'no_key', reason: 'AGENT_DISABLED' }) });
    expect(result.status).toBe('no_key'); expect(calls).not.toHaveBeenCalled();
  });
  it('times out even when transport never resolves or observes AbortSignal', async () => {
    const result = await runHRAgent({ question: 'Question', language: 'en', execute, timeoutMs: 10, transport: () => new Promise(() => {}) });
    expect(result.status).toBe('timeout');
  });
  it('does not call transport again after a synchronous tool consumes the budget', async () => {
    let time = 0;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => time);
    const transport = vi.fn(async () => ({ status: 'tools' as const, calls: [{ id: 'call1', name: 'getGaps' as const, arguments: { employeeId: 'E0028' } }] }));
    try {
      const result = await runHRAgent({ question: 'Question', language: 'en', transport, timeoutMs: 100,
        execute: (call, step) => { time = 101; return execute(call, step); } });
      expect(result.status).toBe('timeout'); expect(result.history).toHaveLength(1); expect(transport).toHaveBeenCalledTimes(1);
    } finally { spy.mockRestore(); }
  });
  it('cancels on snapshot invalidation and suppresses tool execution', async () => {
    const controller = new AbortController(); const calls = vi.fn(execute);
    const task = runHRAgent({ question: 'Question', language: 'en', execute: calls, signal: controller.signal, transport: () => new Promise(() => {}) });
    controller.abort();
    expect((await task).status).toBe('cancelled'); expect(calls).not.toHaveBeenCalled();
  });
  it('keeps prior facts and a clear reason when a later tool rejects an unknown ID', async () => {
    const result = await runHRAgent({ question: 'Question', language: 'en', execute: (call, step) => { if (step === 2) throw new Error('Private failure'); return execute(call, step); },
      transport: async request => ({ status: 'tools', calls: [{ id: `call${request.history.length}`, name: 'getGaps', arguments: { employeeId: 'E0028' } }] }) });
    expect(result.status).toBe('blocked'); expect(result.history).toHaveLength(1); expect(result.reason).not.toContain('Private');
  });
});
