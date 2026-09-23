import { agentStepRequestSchema } from '../../../../lib/evaluation/agent-contracts';
import { readLimitedBody } from '../review/provider';
import { createAgentProvider, isAgentProviderConfigured } from './provider';
import { runAgentStep } from './service';
import { readAgentTimeout, readProviderConfig } from '../provider-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
export async function GET(): Promise<Response> {
  const config = readProviderConfig();
  const configured = config.apiKey && isAgentProviderConfigured(config);
  return Response.json({ status: !config.apiKey ? 'no_key' : configured ? 'available' : 'unavailable' }, { headers });
}
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin) {
    const host = request.headers.get('host') ?? new URL(request.url).host;
    let allowed = false;
    try { const url = new URL(origin); allowed = ['http:', 'https:'].includes(url.protocol) && url.host === host; } catch { /* Malformed origin stays denied. */ }
    if (!allowed) return Response.json({ error: 'ORIGIN_NOT_ALLOWED' }, { status: 403, headers });
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return Response.json({ error: 'EXPECTED_JSON' }, { status: 415, headers });
  let input: unknown;
  try { input = JSON.parse(await readLimitedBody(request, 512000)); }
  catch (error) {
    const tooLarge = error instanceof Error && error.message === 'BODY_TOO_LARGE';
    return Response.json({ error: tooLarge ? 'BODY_TOO_LARGE' : 'INVALID_JSON' }, { status: tooLarge ? 413 : 400, headers });
  }
  const parsed = agentStepRequestSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: 'INVALID_AGENT_REQUEST' }, { status: 400, headers });
  const config = readProviderConfig();
  const provider = config.apiKey ? createAgentProvider(config) : undefined;
  return Response.json(await runAgentStep(parsed.data, { provider, timeoutMs: readAgentTimeout(), signal: request.signal }), { headers });
}
