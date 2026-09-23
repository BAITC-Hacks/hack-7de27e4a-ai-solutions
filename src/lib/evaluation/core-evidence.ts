import type { NormalizedDataset, RecommendationResult } from '@/lib/contracts';
import { buildReviewRequest } from './explanations';
import type { EvidenceFact } from './ai-contracts';

/** Retains A's gain/projection IDs. C's score:* IDs refer to normalized scores, not A's weighted factor:* contributions. */
export function buildCoreReviewRequest(dataset: NormalizedDataset, result: RecommendationResult) {
  const additional: Record<string, EvidenceFact[]> = {};
  for (const rec of result.recommendations.slice(0, 5)) {
    const event = dataset.eventsById[rec.activityId];
    if (!event) throw new Error('Unknown recommended event');
    const facts: EvidenceFact[] = [];
    for (const [skillId, gain] of Object.entries(rec.effectiveGains)) {
      const gap = result.gapAnalysis.gaps.find(g => g.skillId === skillId);
      const effect = event.developsSkills.find(s => s.skillId === skillId);
      if (!gap || !effect) throw new Error('Missing gain evidence');
      facts.push({ id: `gain:${rec.activityId}:${skillId}`, kind: 'skill', factor: 'targetGapImpact', skillId,
        current: gap.currentLevel, required: gap.requiredLevel, gain, maxLevel: effect.maxLevel, critical: gap.critical });
    }
    facts.push({ id: `projection:${rec.activityId}`, kind: 'readiness', factor: 'goalAlignment', before: result.gapAnalysis.readiness, after: rec.projectedReadiness });
    additional[rec.activityId] = facts;
  }
  return buildReviewRequest(result.recommendations, result.effectiveProfile.employee.preferredLanguage, additional);
}
