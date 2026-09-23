import { reviewRequestSchema } from '../../../../lib/evaluation/ai-contracts';
import { createReviewProvider, readLimitedBody } from './provider';
import { reviewEvidence } from './service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin) {
    // Next's internal request URL can use localhost behind a proxy; the incoming Host is the browser-facing authority.
    const host = request.headers.get('host') ?? new URL(request.url).host;
    let allowed = false;
    try { const url = new URL(origin); allowed = ['http:', 'https:'].includes(url.protocol) && url.host === host; } catch { /* Invalid Origin stays denied. */ }
    if (!allowed) return Response.json({ error: 'ORIGIN_NOT_ALLOWED' }, { status: 403, headers });
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return Response.json({ error: 'EXPECTED_JSON' }, { status: 415, headers });
  let input: unknown;
  try { input = JSON.parse(await readLimitedBody(request, 64000)); }
  catch (error) { return Response.json({ error: error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 'BODY_TOO_LARGE' : 'INVALID_JSON' }, { status: error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 400, headers }); }
  const parsed = reviewRequestSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: 'INVALID_EVIDENCE', message: 'Send only language and validated candidate evidence with at least three factors.' }, { status: 400, headers });
  const apiKey = process.env.LLM_API_KEY?.trim();
  const provider = apiKey ? createReviewProvider({ apiKey, baseUrl: process.env.LLM_BASE_URL ?? '', model: process.env.LLM_MODEL ?? '' }) : undefined;
  const result = await reviewEvidence(parsed.data, { provider, timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 8000) });
  return Response.json(result, { headers });
}
