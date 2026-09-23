import { aiReviewSchema, type AIReview, type ReviewRequest } from './ai-contracts';
import { renderExplanation } from './explanations';

export type Verification = { valid: true; review: AIReview } | { valid: false; reasons: string[] };
/** A deterministic whitelist grammar: mere occurrence of a number somewhere in evidence is NOT proof. */
export function verifyAIReview(raw: unknown, request: ReviewRequest): Verification {
  const parsed = aiReviewSchema.safeParse(raw);
  if (!parsed.success) return { valid: false, reasons: ['INVALID_OUTPUT_SCHEMA'] };
  const review = parsed.data;
  const expected = request.candidates.slice(0, 3).map(c => c.id);
  const errors = new Set<string>();
  if (JSON.stringify(review.selectedCandidateIds) !== JSON.stringify(expected)) errors.add('RANKING_OR_ALLOWLIST_CHANGED');
  if (review.reasons.length !== expected.length || new Set(review.reasons.map(r => r.candidateId)).size !== expected.length) errors.add('MISSING_OR_DUPLICATE_REASON');
  for (const reason of review.reasons) {
    const candidate = request.candidates.find(c => c.id === reason.candidateId && expected.includes(c.id));
    if (!candidate) { errors.add('UNKNOWN_CANDIDATE'); continue; }
    if (new Set(reason.evidenceIds).size !== reason.evidenceIds.length) errors.add('DUPLICATE_EVIDENCE');
    const facts = reason.evidenceIds.map(id => candidate.facts.find(f => f.id === id));
    if (facts.some(f => !f)) { errors.add('UNKNOWN_EVIDENCE'); continue; }
    if (new Set(facts.map(f => f!.factor)).size < 3) errors.add('INSUFFICIENT_FACTORS');
    if (reason.explanation !== renderExplanation(candidate, reason.evidenceIds, request.language)) errors.add('UNSUPPORTED_CLAIM_OR_CHANGED_FACT');
  }
  return errors.size ? { valid: false, reasons: [...errors] } : { valid: true, review };
}
