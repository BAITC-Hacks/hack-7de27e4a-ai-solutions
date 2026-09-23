import { z } from 'zod';

export const FACTORS = ['targetGapImpact', 'engagementFit', 'feasibility', 'goalAlignment', 'pathDiversity'] as const;
export type Factor = typeof FACTORS[number];
const identifier = z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/);
const level = z.number().finite().min(0).max(5);
const ratio = z.number().finite().min(0).max(1);
const common = { id: identifier, factor: z.enum(FACTORS) };
export const evidenceFactSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('score'), value: ratio }).strict(),
  z.object({ ...common, kind: z.literal('skill'), skillId: identifier, current: level, required: level, gain: level, maxLevel: level, critical: z.boolean() }).strict(),
  z.object({ ...common, kind: z.literal('readiness'), before: ratio, after: ratio }).strict(),
]);
export const candidateEvidenceSchema = z.object({ id: identifier, facts: z.array(evidenceFactSchema).min(3).max(30) }).strict();
export const reviewRequestSchema = z.object({ language: z.enum(['ru', 'kk', 'en']), candidates: z.array(candidateEvidenceSchema).max(5) }).strict().superRefine((request, ctx) => {
  const ids = new Set<string>();
  for (const candidate of request.candidates) {
    if (ids.has(candidate.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate candidate ID' });
    ids.add(candidate.id);
    if (new Set(candidate.facts.map(f => f.id)).size !== candidate.facts.length) ctx.addIssue({ code: 'custom', message: 'Duplicate evidence ID' });
    if (new Set(candidate.facts.map(f => f.factor)).size < 3) ctx.addIssue({ code: 'custom', message: 'At least three distinct factors required' });
    for (const fact of candidate.facts) {
      if (fact.kind === 'skill' && fact.gain > Math.max(0, Math.min(5, fact.maxLevel) - fact.current)) ctx.addIssue({ code: 'custom', message: 'Gain exceeds skill cap' });
    }
  }
});
export const aiReviewSchema = z.object({
  selectedCandidateIds: z.array(identifier).min(1).max(3),
  reasons: z.array(z.object({ candidateId: identifier, evidenceIds: z.array(identifier).min(3).max(30), explanation: z.string().min(1).max(12000) }).strict()).min(1).max(3),
}).strict();
export type EvidenceFact = z.infer<typeof evidenceFactSchema>;
export type CandidateEvidence = z.infer<typeof candidateEvidenceSchema>;
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
export type AIReview = z.infer<typeof aiReviewSchema>;
export type Language = ReviewRequest['language'];
export type VerifierStatus = 'verified' | 'blocked' | 'timeout' | 'no_key';
export interface AIExplanationResult {
  status: VerifierStatus; language: Language; text: string;
  candidateIds: string[]; reasons: AIReview['reasons']; blockedReasons?: string[]; latencyMs?: number;
}
