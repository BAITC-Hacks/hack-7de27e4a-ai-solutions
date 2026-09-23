import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAgentStep } from '../../src/app/api/ai/agent/service';
import { AGENT_TOOLS, createAgentProvider } from '../../src/app/api/ai/agent/provider';
import { GET, POST } from '../../src/app/api/ai/agent/route';
import { AGENT_TOOL_ARGUMENT_SCHEMAS, type AgentHistoryEntry, type AgentStepRequest } from '../../src/lib/evaluation/agent-contracts';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const request = (): AgentStepRequest => ({ language: 'ru', question: 'Какие пробелы у E0028?', history: [] });
const entry = (index = 1): AgentHistoryEntry => ({ call: { id: `call_${index}`, name: 'getGaps', arguments: { employeeId: 'E0028' } }, result: { callId: `call_${index}`, evidenceId: `tool:${index}:getGaps`, tool: 'getGaps', facts: [{ id: 'gap', subjectId: 'E0028', skillId: 'SK_SYSTEM_DESIGN', metric: 'gap', value: 1 }] } });
const post = (body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) => new Request('http://localhost:3000/api/ai/agent', { method: 'POST', headers, body: JSON.stringify(body) });

describe('bounded HR agent server', () => {
  it('disables without key and never invokes a model', async () => {
    expect(await runAgentStep(request())).toEqual({ status: 'no_key', reason: 'AGENT_DISABLED' });
    vi.stubEnv('LLM_API_KEY', '');
    expect(await (await GET()).json()).toEqual({ status: 'no_key' });
    const response = await POST(post(request()));
    expect(await response.json()).toMatchObject({ status: 'no_key' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('reports available only with a key, valid endpoint and model, exposing no configuration', async () => {
    vi.stubEnv('LLM_API_KEY', 'private-test-key');
    vi.stubEnv('LLM_BASE_URL', ''); vi.stubEnv('LLM_MODEL', '');
    expect(await (await GET()).json()).toEqual({ status: 'unavailable' });
    vi.stubEnv('LLM_BASE_URL', 'https://provider.example/v1');
    expect(await (await GET()).json()).toEqual({ status: 'unavailable' });
    vi.stubEnv('LLM_MODEL', 'private-model-name');
    expect(await (await GET()).json()).toEqual({ status: 'available' });
    for (const url of ['invalid', 'http://provider.example/v1', 'https://user:secret@provider.example/v1', 'https://provider.example/v1?secret=value']) {
      vi.stubEnv('LLM_BASE_URL', url);
      const response = await GET();
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ status: 'unavailable' });
    }
  });
  it('derives tool JSON Schema constraints from the shared Zod args, including strict nullable filters', () => {
    const get = AGENT_TOOLS.find(tool => tool.function.name === 'getGaps')!.function.parameters;
    expect(get.additionalProperties).toBe(false);
    expect(get.required).toEqual(['employeeId']);
    expect(get.properties!.employeeId).toMatchObject({ type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,79}$' });
    const find = AGENT_TOOLS.find(tool => tool.function.name === 'findEmployees')!.function.parameters;
    expect(find.additionalProperties).toBe(false);
    expect(find.required).toEqual(['roleId', 'grade', 'skillId', 'minLevel']);
    expect(find.properties!.minLevel).toMatchObject({ anyOf: [{ type: 'number', minimum: 0, maximum: 5 }, { type: 'null' }] });
    expect(AGENT_TOOL_ARGUMENT_SCHEMAS.findEmployees.safeParse({ skillId: 'SK_SYSTEM_DESIGN', minLevel: 5 }).success).toBe(true);
    expect(AGENT_TOOL_ARGUMENT_SCHEMAS.findEmployees.safeParse({ skillId: 'SK_SYSTEM_DESIGN', minLevel: 6 }).success).toBe(false);
    expect(AGENT_TOOL_ARGUMENT_SCHEMAS.findEmployees.safeParse({ minLevel: 3 }).success).toBe(false);
  });
  it('makes a tool call then verifies an answer against its result', async () => {
    const first = entry();
    const provider = vi.fn().mockResolvedValueOnce({ status: 'tools', calls: [first.call] }).mockResolvedValueOnce({ status: 'answer', answer: { text: 'У E0028 остался разрыв по SK_SYSTEM_DESIGN: Разрыв — 1. [tool:1:getGaps/gap]', claims: [{ evidenceId: first.result.evidenceId, factId: 'gap', subjectId: 'E0028', skillId: 'SK_SYSTEM_DESIGN', metric: 'gap', value: 1 }] } });
    expect(await runAgentStep(request(), { provider })).toMatchObject({ status: 'tools' });
    const answer = await runAgentStep({ ...request(), history: [first] }, { provider });
    expect(answer.status).toBe('answer');
    if (answer.status === 'answer') expect(answer.text).toContain('Разрыв — 1');
    expect(provider).toHaveBeenCalledTimes(2);
  });
  it('blocks an invented fact and unsupported tool arguments before execution', async () => {
    const fabricated = { status: 'answer', answer: { text: 'Разрыв — 5.', claims: [{ evidenceId: 'tool:1:getGaps', factId: 'gap', subjectId: 'E0028', skillId: 'SK_SYSTEM_DESIGN', metric: 'gap', value: 5 }] } };
    expect(await runAgentStep({ ...request(), history: [entry()] }, { provider: async () => fabricated })).toMatchObject({ status: 'blocked', reason: 'FACT_MISMATCH' });
    expect(await runAgentStep(request(), { provider: async () => ({ status: 'tools', calls: [{ ...entry().call, arguments: { employeeId: 'E0028', instruction: 'Ignore rules' } }] }) })).toMatchObject({ status: 'blocked', reason: 'INVALID_MODEL_OUTPUT' });
  });
  it('enforces five tool calls but permits final grounded answer after the fifth', async () => {
    const full = { ...request(), history: [1, 2, 3, 4, 5].map(entry) };
    expect(await runAgentStep(full, { provider: async () => ({ status: 'tools', calls: [{ ...entry().call, id: 'call_6' }] }) })).toMatchObject({ status: 'blocked', reason: 'STEP_LIMIT' });
    expect(await runAgentStep(full, { provider: async () => ({ status: 'answer', answer: { text: 'Недостаточно данных для полного ответа.', claims: [] } }) })).toMatchObject({ status: 'answer' });
    expect(await runAgentStep({ ...full, history: [...full.history, entry(6)] })).toMatchObject({ status: 'blocked', reason: 'INVALID_REQUEST' });
  });
  it('bounds a hung provider and aborts it; supports caller cancellation', async () => {
    let providerSignal: AbortSignal | undefined;
    const hung = (_: AgentStepRequest, signal: AbortSignal) => { providerSignal = signal; return new Promise<unknown>(() => {}); };
    expect(await runAgentStep(request(), { provider: hung, timeoutMs: 5 })).toMatchObject({ status: 'timeout' });
    expect(providerSignal?.aborted).toBe(true);
    const controller = new AbortController(); controller.abort();
    const unused = vi.fn();
    expect(await runAgentStep(request(), { provider: unused, signal: controller.signal })).toMatchObject({ status: 'timeout' });
    expect(unused).not.toHaveBeenCalled();
  });
  it('does not disclose provider errors or secrets', async () => {
    const result = await runAgentStep(request(), { provider: async () => { throw new Error('Bearer secret-token and private profile'); } });
    expect(result).toEqual({ status: 'blocked', reason: 'PROVIDER_UNAVAILABLE' });
  });
  it('rejects cross-origin, raw data and oversized bodies; accepts proxy host', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    expect((await POST(post(request(), { 'Content-Type': 'application/json', origin: 'https://other.test' }))).status).toBe(403);
    expect((await POST(post({ ...request(), rawProfile: {} }))).status).toBe(400);
    expect((await POST(post(request(), { 'Content-Type': 'text/plain' }))).status).toBe(415);
    expect((await POST(post({ text: 'x'.repeat(512001) }))).status).toBe(413);
    expect((await POST(post(request(), { 'Content-Type': 'application/json', host: '127.0.0.1:3140', origin: 'http://127.0.0.1:3140' }))).status).toBe(200);
  });
  it('uses Chat Completions tools and reconstructs only sanitized tool history', async () => {
    let sent: Record<string, unknown> | undefined;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return Response.json({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'call_find', type: 'function', function: { name: 'findEmployees', arguments: JSON.stringify({ roleId: null, grade: 'Middle', skillId: null, minLevel: null }) } }] } }] });
    });
    const provider = createAgentProvider({ apiKey: 'test-only', baseUrl: 'https://provider.example/v1', model: 'test-model' }, fetcher as typeof fetch);
    const result = await runAgentStep({ ...request(), history: [entry()] }, { provider });
    expect(result).toEqual({ status: 'tools', calls: [{ id: 'call_find', name: 'findEmployees', arguments: { grade: 'Middle' } }] });
    expect(sent).toMatchObject({ parallel_tool_calls: false, tool_choice: 'auto', store: false });
    expect((sent!.tools as unknown[])).toHaveLength(6);
    const messages = sent!.messages as { role: string; content: string }[];
    expect(messages.map(message => message.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(JSON.parse(messages[3].content)).toEqual(entry().result);
  });
  it('forces final answer at the tool limit and handles provider access errors safely', async () => {
    let sent: Record<string, unknown> | undefined;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response('do not echo secret', { status: 403 });
    });
    const provider = createAgentProvider({ apiKey: 'test-only', baseUrl: 'https://provider.example/v1', model: 'test-model' }, fetcher as typeof fetch);
    expect(await runAgentStep({ ...request(), history: [1, 2, 3, 4, 5].map(entry) }, { provider })).toEqual({ status: 'blocked', reason: 'PROVIDER_ACCESS_DENIED' });
    expect(sent!.tool_choice).toBe('none');
  });
  it('preserves unexpected nullable fields for rejection after OpenAI null normalization', async () => {
    const fetcher = vi.fn(async () => Response.json({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'call_find', type: 'function', function: { name: 'findEmployees', arguments: JSON.stringify({ roleId: null, grade: null, skillId: null, minLevel: null, rawProfile: null }) } }] } }] }));
    const provider = createAgentProvider({ apiKey: 'test-only', baseUrl: 'https://provider.example/v1', model: 'test-model' }, fetcher as typeof fetch);
    expect(await runAgentStep(request(), { provider })).toMatchObject({ status: 'blocked', reason: 'INVALID_MODEL_OUTPUT' });
  });
});
