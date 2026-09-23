import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/app/api/ai/review/route';
import { requestFixture } from './fixtures';
afterEach(() => vi.unstubAllEnvs());
const post = (body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) => new Request('http://localhost:3000/api/ai/review', { method: 'POST', headers, body: JSON.stringify(body) });
describe('AI route', () => {
  it('returns no-store localized fallback without a key', async () => {
    vi.stubEnv('LLM_API_KEY', ''); const response = await POST(post(requestFixture()));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ status: 'no_key', language: 'kk', candidateIds: ['EV_MENTORING'] });
  });
  it('rejects raw profile, malformed input, cross-origin and oversized requests', async () => {
    expect((await POST(post({ ...requestFixture(), employee: { name: 'PRIVATE' } }))).status).toBe(400);
    expect((await POST(post(requestFixture(), { 'Content-Type': 'text/plain' }))).status).toBe(415);
    expect((await POST(post(requestFixture(), { 'Content-Type': 'application/json', origin: 'https://other.test' }))).status).toBe(403);
    expect((await POST(post({ text: 'x'.repeat(64001) }))).status).toBe(413);
  });
  it('accepts same-host browser Origin when Next uses a different internal URL', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    const response = await POST(post(requestFixture(), { 'Content-Type': 'application/json', host: '127.0.0.1:3140', origin: 'http://127.0.0.1:3140' }));
    expect(response.status).toBe(200); expect((await response.json()).status).toBe('no_key');
  });
});
