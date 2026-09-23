import type {
  EvidenceReceipt,
  ExcludedCandidate,
  NormalizedDataset,
  Recommendation,
  RecommendationResult,
  ScoredCandidate,
} from "@/lib/contracts";

import { evaluateEligibility } from "./eligibility";
import { deterministicExplanation } from "./explanation";
import { analyzeGaps, buildEffectiveEmployeeProfile, resolveTarget } from "./profile";
import { candidateSimilarity, SCORE_WEIGHTS, scoreCandidate } from "./scoring";

export const ENGINE_VERSION = "career-quest-engine/1.0.0";
const DIVERSITY_PENALTY = 0.08;
const BASE_SHORTLIST_SIZE = 5;

const round = (value: number, places = 4) => Number(value.toFixed(places));

function diversify(candidates: ScoredCandidate[], limit: number) {
  const remaining = [...candidates]
    .sort((a, b) => b.baseScore - a.baseScore || a.event.id.localeCompare(b.event.id))
    .slice(0, Math.max(BASE_SHORTLIST_SIZE, limit));
  const selected: Array<{ candidate: ScoredCandidate; adjustedScore: number; penalty: number }> = [];

  while (remaining.length && selected.length < limit) {
    const evaluated = remaining.map((candidate) => {
      const similarity = selected.length
        ? Math.max(...selected.map((item) => candidateSimilarity(candidate, item.candidate)))
        : 0;
      const penalty = similarity * DIVERSITY_PENALTY;
      return { candidate, penalty, adjustedScore: round(Math.max(0, candidate.baseScore - penalty)) };
    });
    evaluated.sort(
      (a, b) => b.adjustedScore - a.adjustedScore || a.candidate.event.id.localeCompare(b.candidate.event.id),
    );
    const winner = evaluated[0];
    selected.push(winner);
    remaining.splice(
      remaining.findIndex((candidate) => candidate.event.id === winner.candidate.event.id),
      1,
    );
  }
  return selected;
}

export function recommendForEmployee(
  dataset: NormalizedDataset,
  employeeId: string,
  limit = 3,
): RecommendationResult {
  const effectiveProfile = buildEffectiveEmployeeProfile(dataset, employeeId);
  const target = resolveTarget(dataset, effectiveProfile);
  const gapAnalysis = analyzeGaps(effectiveProfile, target);
  const excluded: ExcludedCandidate[] = [];
  const candidates: ScoredCandidate[] = [];

  Object.values(dataset.eventsById).forEach((event) => {
    const eligibility = evaluateEligibility(dataset, effectiveProfile, gapAnalysis, event);
    if (!eligibility.eligible) {
      excluded.push({ activityId: event.id, title: event.title, reasons: eligibility.reasons });
      return;
    }
    candidates.push(
      scoreCandidate(dataset, effectiveProfile, gapAnalysis, event, eligibility.effectiveGains),
    );
  });

  const recommendations: Recommendation[] = diversify(candidates, limit).map(
    ({ candidate, adjustedScore, penalty }, index) => {
      const evidenceReceipt: EvidenceReceipt = {
        engineVersion: ENGINE_VERSION,
        targetRole: gapAnalysis.target?.role ?? "",
        targetGrade: gapAnalysis.target?.grade ?? effectiveProfile.employee.grade,
        scoringWeights: { ...SCORE_WEIGHTS },
        factorScores: candidate.factorScores,
        factorContributions: candidate.factorContributions,
        evidence: [
          ...candidate.evidence,
          ...effectiveProfile.replayEvidence.map((item) => ({
            id: `replay:${item.historyRecordId}:${item.skillId}`,
            kind: "replay" as const,
            label: `Replayed ${item.skillId}`,
            value: `${item.before}->${item.after}`,
            source: `${item.historyRecordId}/${item.eventId}`,
          })),
        ],
        diversityPenalty: round(penalty),
      };
      return {
        activityId: candidate.event.id,
        title: candidate.event.title,
        rank: index + 1,
        baseScore: candidate.baseScore,
        totalScore: adjustedScore,
        projectedReadiness: candidate.projectedReadiness,
        factorScores: candidate.factorScores,
        factorContributions: candidate.factorContributions,
        effectiveGains: candidate.effectiveGains,
        evidenceReceipt,
        deterministicExplanation: deterministicExplanation(
          effectiveProfile,
          gapAnalysis,
          candidate,
        ),
      };
    },
  );

  return {
    employeeId,
    effectiveProfile,
    gapAnalysis,
    recommendations,
    excluded: excluded.sort((a, b) => a.activityId.localeCompare(b.activityId)),
    consideredCandidates: candidates.length,
    engineVersion: ENGINE_VERSION,
  };
}

/** Stable integration entry point for Employee, Simulation, HR and Trust streams. */
export function recommend(
  dataset: NormalizedDataset,
  employeeId: string,
  limit = 3,
): RecommendationResult {
  return recommendForEmployee(dataset, employeeId, limit);
}
