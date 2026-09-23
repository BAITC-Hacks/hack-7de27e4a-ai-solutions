import {
  evaluateEligibility,
  recommendForEmployee,
} from "@/domain/recommendation";
import type { NormalizedDataset, RecommendationResult } from "@/lib/contracts";

export interface TrustGate {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface TrustMetrics {
  asOfDate: string;
  engineVersion: string;
  employeesEvaluated: number;
  recommendationsEvaluated: number;
  recommendationCoverage: number;
  noStepEmployees: number;
  eligibilityViolations: number;
  evidenceReceiptCompletenessRate: number;
  deterministicStabilityRate: number;
  historyReplayEmployees: number;
  weakestSkillBaselineDisagreementRate: number;
  gates: TrustGate[];
}

const round = (value: number, places = 4) => Number(value.toFixed(places));

function idsAndScores(result: RecommendationResult): string {
  return JSON.stringify(
    result.recommendations.map((recommendation) => [
      recommendation.activityId,
      recommendation.totalScore,
    ]),
  );
}

function recommendationHasCompleteReceipt(result: RecommendationResult): boolean {
  return result.recommendations.every((recommendation) => {
    const kinds = new Set(recommendation.evidenceReceipt.evidence.map((item) => item.kind));
    return (
      recommendation.evidenceReceipt.evidence.length >= 5 &&
      kinds.has("target") &&
      kinds.has("history") &&
      kinds.has("feasibility") &&
      kinds.has("projection") &&
      kinds.has("skill_gap") &&
      kinds.has("effective_gain") &&
      kinds.has("factor")
    );
  });
}

function differsFromWeakestSkillBaseline(
  dataset: NormalizedDataset,
  result: RecommendationResult,
): boolean | null {
  const top = result.recommendations[0];
  if (!top) return null;
  const skillEntries = Object.entries(result.effectiveProfile.effectiveSkills);
  if (!skillEntries.length) return null;
  const minimum = Math.min(...skillEntries.map(([, level]) => level));
  const weakestSkillIds = new Set(
    skillEntries.filter(([, level]) => level === minimum).map(([skillId]) => skillId),
  );
  const event = dataset.eventsById[top.activityId];
  return !event.developsSkills.some((effect) => weakestSkillIds.has(effect.skillId));
}

/** Deterministic, label-free quality gates. No metric here is presented as predictive accuracy. */
export function evaluateTrustMetrics(dataset: NormalizedDataset): TrustMetrics {
  const employeeIds = Object.keys(dataset.employeesById).sort();
  const results = employeeIds.map((employeeId) => recommendForEmployee(dataset, employeeId));
  const repeated = employeeIds.map((employeeId) => recommendForEmployee(dataset, employeeId));
  const recommendationsEvaluated = results.reduce(
    (sum, result) => sum + result.recommendations.length,
    0,
  );
  const targetable = results.filter((result) => result.gapAnalysis.target);
  const withNextStep = results.filter((result) => result.recommendations.length > 0);

  let eligibilityViolations = 0;
  let completeReceiptRecommendations = 0;
  results.forEach((result) => {
    result.recommendations.forEach((recommendation) => {
      const event = dataset.eventsById[recommendation.activityId];
      const eligibility = evaluateEligibility(
        dataset,
        result.effectiveProfile,
        result.gapAnalysis,
        event,
      );
      if (!eligibility.eligible) eligibilityViolations += 1;
    });
    if (recommendationHasCompleteReceipt(result)) {
      completeReceiptRecommendations += result.recommendations.length;
    }
  });

  const stableEmployees = results.filter(
    (result, index) => idsAndScores(result) === idsAndScores(repeated[index]),
  ).length;
  const baselineComparisons = results
    .map((result) => differsFromWeakestSkillBaseline(dataset, result))
    .filter((value): value is boolean => value !== null);
  const baselineDisagreements = baselineComparisons.filter(Boolean).length;
  const evidenceReceiptCompletenessRate = recommendationsEvaluated
    ? completeReceiptRecommendations / recommendationsEvaluated
    : 1;
  const deterministicStabilityRate = employeeIds.length
    ? stableEmployees / employeeIds.length
    : 1;

  return {
    asOfDate: dataset.meta.asOfDate,
    engineVersion: results[0]?.engineVersion ?? "unknown",
    employeesEvaluated: employeeIds.length,
    recommendationsEvaluated,
    recommendationCoverage: targetable.length ? round(withNextStep.length / targetable.length) : 1,
    noStepEmployees: results.filter((result) => result.recommendations.length === 0).length,
    eligibilityViolations,
    evidenceReceiptCompletenessRate: round(evidenceReceiptCompletenessRate),
    deterministicStabilityRate: round(deterministicStabilityRate),
    historyReplayEmployees: results.filter(
      (result) => result.effectiveProfile.replayEvidence.length > 0,
    ).length,
    weakestSkillBaselineDisagreementRate: baselineComparisons.length
      ? round(baselineDisagreements / baselineComparisons.length)
      : 0,
    gates: [
      {
        id: "eligibility",
        label: "Eligibility policy",
        passed: eligibilityViolations === 0,
        detail: `${eligibilityViolations} недопустимых рекомендаций из ${recommendationsEvaluated}`,
      },
      {
        id: "receipt-completeness",
        label: "Evidence receipt completeness",
        passed: evidenceReceiptCompletenessRate === 1,
        detail: `${Math.round(evidenceReceiptCompletenessRate * 100)}% рекомендаций содержат target, gap, gain, history, feasibility и projection evidence`,
      },
      {
        id: "determinism",
        label: "Stable rerun",
        passed: deterministicStabilityRate === 1,
        detail: `${stableEmployees}/${employeeIds.length} профилей дали идентичный порядок и score при повторе`,
      },
      {
        id: "replay",
        label: "History replay",
        passed: results.every((result) =>
          result.effectiveProfile.replayEvidence.every(
            (item) => item.after <= item.maxLevel && item.after <= 5 && item.after > item.before,
          ),
        ),
        detail: `${results.filter((result) => result.effectiveProfile.replayEvidence.length > 0).length} профилей пересчитаны после review date`,
      },
    ],
  };
}
