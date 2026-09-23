import type { AIExplanationResult, ReviewRequest } from './ai-contracts';
import { deterministicReasons } from './explanations';
import { verifyAIReview } from './verifier';

/** Employee UI may use this optional enhancement after drawing deterministic ranking. */
export async function requestAIExplanation(request: ReviewRequest, fetcher: typeof fetch = fetch): Promise<AIExplanationResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const fallback = (): AIExplanationResult => {
    const reasons = deterministicReasons(request);
    return { status: controller.signal.aborted ? 'timeout' : 'blocked', language: request.language, text: reasons.map(r => r.explanation).join('\n\n') || { ru: 'Подходящих рекомендаций нет.', kk: 'Сәйкес ұсыныстар жоқ.', en: 'No eligible recommendations.' }[request.language], candidateIds: reasons.map(r => r.candidateId), reasons, blockedReasons: ['REVIEW_ROUTE_UNAVAILABLE'] };
  };
  try {
    if (!request.candidates.length) return { ...fallback(), status: 'verified', blockedReasons: undefined };
    const response = await fetcher('/api/ai/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal });
    if (!response.ok) return fallback();
    const data = await response.json() as AIExplanationResult;
    if (!['verified', 'blocked', 'timeout', 'no_key'].includes(data.status) || data.language !== request.language) return fallback();
    const check = verifyAIReview({ selectedCandidateIds: data.candidateIds, reasons: data.reasons }, request);
    if (!check.valid) return fallback();
    return { status: data.status, language: request.language, candidateIds: data.candidateIds, reasons: check.review.reasons,
      text: check.review.reasons.map(r => r.explanation).join('\n\n'),
      latencyMs: Number.isFinite(data.latencyMs) && data.latencyMs! >= 0 ? data.latencyMs : undefined };
  } catch { return fallback(); }
  finally { clearTimeout(timer); }
}
