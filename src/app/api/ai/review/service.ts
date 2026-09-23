import { reviewRequestSchema, type AIExplanationResult, type ReviewRequest, type VerifierStatus } from '../../../../lib/evaluation/ai-contracts';
import { deterministicReasons } from '../../../../lib/evaluation/explanations';
import { verifyAIReview } from '../../../../lib/evaluation/verifier';

export type ReviewProvider = (request: ReviewRequest, signal: AbortSignal) => Promise<unknown>;
export interface ReviewOptions { provider?: ReviewProvider; timeoutMs?: number; now?: () => number }

export async function reviewEvidence(input: unknown, options: ReviewOptions = {}): Promise<AIExplanationResult> {
  const request = reviewRequestSchema.parse(input);
  const now = options.now ?? (() => performance.now());
  const started = now();
  const fallback = (status: VerifierStatus, blockedReasons?: string[]): AIExplanationResult => {
    const reasons = deterministicReasons(request);
    const empty = { ru: 'Подходящих рекомендаций нет.', kk: 'Сәйкес ұсыныстар жоқ.', en: 'No eligible recommendations.' }[request.language];
    return { status, language: request.language, text: reasons.map(r => r.explanation).join('\n\n') || empty,
      candidateIds: request.candidates.slice(0, 3).map(c => c.id), reasons, blockedReasons,
      latencyMs: Math.max(0, now() - started) };
  };
  if (!request.candidates.length) return fallback('verified');
  if (!options.provider) return fallback('no_key');
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.min(30000, Math.max(1, options.timeoutMs!)) : 8000;
  const timedOut = Symbol('timeout');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<typeof timedOut>(resolve => { timer = setTimeout(() => { resolve(timedOut); controller.abort(); }, timeoutMs); });
    // Promise.race also bounds providers that fail to honor AbortSignal.
    const raw = await Promise.race([Promise.resolve().then(() => options.provider!(request, controller.signal)), timeout]);
    if (raw === timedOut) return fallback('timeout');
    const verdict = verifyAIReview(raw, request);
    if (!verdict.valid) return fallback('blocked', verdict.reasons);
    const reasons = request.candidates.slice(0, 3).map(c => verdict.review.reasons.find(r => r.candidateId === c.id)!);
    return { status: 'verified', language: request.language, text: reasons.map(r => r.explanation).join('\n\n'),
      candidateIds: request.candidates.slice(0, 3).map(c => c.id), reasons, latencyMs: Math.max(0, now() - started) };
  } catch {
    return fallback(controller.signal.aborted ? 'timeout' : 'blocked', ['PROVIDER_UNAVAILABLE']);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
