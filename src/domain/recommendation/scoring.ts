import type {
  ActivityHistoryRecord,
  DevelopmentEvent,
  EffectiveEmployeeProfile,
  EvidenceItem,
  FactorScores,
  GapAnalysis,
  NormalizedDataset,
  ProficiencyLevel,
  ScoredCandidate,
} from "@/lib/contracts";

import { analyzeGaps, applyEventEffects } from "./profile";

export const SCORE_WEIGHTS = {
  targetGapImpact: 0.45,
  engagementFit: 0.2,
  feasibility: 0.15,
  goalAlignment: 0.1,
  pathDiversity: 0.1,
} as const;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const round = (value: number, places = 4) => Number(value.toFixed(places));

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((value) => b.has(value)).length;
  return intersection / new Set([...a, ...b]).size;
}

function statusValue(record: ActivityHistoryRecord): number {
  switch (record.status) {
    case "completed": {
      const feedback = record.feedbackRating ? (record.feedbackRating - 1) / 4 : 0.75;
      return 0.8 + feedback * 0.2;
    }
    case "in_progress":
      return 0.65;
    case "dropped":
      return 0.2 + (record.completionPct / 100) * 0.25;
    case "no_show":
      return 0.05;
    case "declined":
      return record.assignedBy === "self" ? 0.1 : 0.35;
    case "overdue":
      return 0.25;
  }
}

function engagementFit(
  dataset: NormalizedDataset,
  employeeId: string,
  candidate: DevelopmentEvent,
): {
  score: number;
  matched: number;
  positive: number;
  negative: number;
  selfMatched: number;
  assignedMatched: number;
} {
  const candidateSkills = new Set(candidate.developsSkills.map((effect) => effect.skillId));
  let weightedSum = 0;
  let similaritySum = 0;
  let matched = 0;
  let positive = 0;
  let negative = 0;
  let selfMatched = 0;
  let assignedMatched = 0;
  (dataset.historyByEmployeeId[employeeId] ?? []).forEach((record) => {
    const priorEvent = dataset.eventsById[record.eventId];
    if (!priorEvent || priorEvent.mandatory) return;
    const skillSimilarity = overlapRatio(
      candidateSkills,
      new Set(priorEvent.developsSkills.map((effect) => effect.skillId)),
    );
    const similarity =
      (candidate.type === priorEvent.type ? 0.4 : 0) +
      (candidate.format === priorEvent.format ? 0.2 : 0) +
      skillSimilarity * 0.4;
    if (similarity < 0.2) return;
    const value = statusValue(record);
    const ownershipWeight = record.assignedBy === "self" ? 1 : record.assignedBy === "manager" ? 0.7 : 0.5;
    weightedSum += value * similarity * ownershipWeight;
    similaritySum += similarity * ownershipWeight;
    matched += 1;
    if (record.assignedBy === "self") selfMatched += 1;
    else assignedMatched += 1;
    if (value >= 0.65) positive += 1;
    if (value <= 0.35) negative += 1;
  });
  const prior = 0.55;
  const priorWeight = 2;
  return {
    score: clamp01((prior * priorWeight + weightedSum) / (priorWeight + similaritySum)),
    matched,
    positive,
    negative,
    selfMatched,
    assignedMatched,
  };
}

function feasibilityScore(
  dataset: NormalizedDataset,
  profile: EffectiveEmployeeProfile,
  event: DevelopmentEvent,
): number {
  const formatFit: Record<EffectiveEmployeeProfile["employee"]["workFormat"], Record<DevelopmentEvent["format"], number>> = {
    remote: { online: 1, self_paced: 0.95, offline: 0.55 },
    hybrid: { online: 0.95, self_paced: 0.9, offline: 0.9 },
    office: { online: 0.85, self_paced: 0.8, offline: 1 },
  };
  const durationFit = event.durationHours <= 4 ? 1 : event.durationHours <= 8 ? 0.9 : event.durationHours <= 16 ? 0.75 : 0.6;
  let availability = 1;
  if (event.format !== "self_paced") {
    const nextSession = event.upcomingSessions.find((date) => date >= dataset.meta.asOfDate);
    if (!nextSession) availability = 0;
    else {
      const days = Math.max(
        0,
        Math.round((Date.parse(nextSession) - Date.parse(dataset.meta.asOfDate)) / 86_400_000),
      );
      availability = days <= 14 ? 1 : days <= 45 ? 0.85 : 0.7;
    }
  }
  return clamp01(formatFit[profile.employee.workFormat][event.format] * 0.5 + durationFit * 0.3 + availability * 0.2);
}

function targetGapImpact(
  gapAnalysis: GapAnalysis,
  effectiveGains: Record<string, number>,
): number {
  if (!gapAnalysis.weightedRemainingGap) return 0;
  const weightedGain = gapAnalysis.gaps.reduce(
    (sum, gap) => sum + Math.min(gap.gap, effectiveGains[gap.skillId] ?? 0) * gap.weight,
    0,
  );
  return clamp01(weightedGain / gapAnalysis.weightedRemainingGap);
}

function goalAlignment(
  profile: EffectiveEmployeeProfile,
  gapAnalysis: GapAnalysis,
  event: DevelopmentEvent,
): number {
  const target = gapAnalysis.target;
  if (!target) return 0;
  const role = event.targetRoles.includes(target.role)
    ? 1
    : event.targetRoles.includes(profile.employee.role)
      ? 0.65
      : 0;
  const grade = event.targetGrades.includes(target.grade)
    ? 1
    : event.targetGrades.includes(profile.employee.grade)
      ? 0.7
      : 0;
  return role * 0.6 + grade * 0.4;
}

function pathValue(gapAnalysis: GapAnalysis, effectiveGains: Record<string, number>): number {
  const openGaps = gapAnalysis.gaps.filter((gap) => gap.gap > 0);
  if (!openGaps.length) return 0;
  const affected = openGaps.filter((gap) => (effectiveGains[gap.skillId] ?? 0) > 0);
  const criticalAffected = affected.filter((gap) => gap.critical).length;
  const criticalOpen = openGaps.filter((gap) => gap.critical).length;
  const breadth = affected.length / openGaps.length;
  const criticalCoverage = criticalOpen ? criticalAffected / criticalOpen : breadth;
  return clamp01(criticalCoverage * 0.7 + breadth * 0.3);
}

function projectedSkills(
  profile: EffectiveEmployeeProfile,
  event: DevelopmentEvent,
): Record<string, ProficiencyLevel> {
  return applyEventEffects(profile.effectiveSkills, event).skills;
}

export function scoreCandidate(
  dataset: NormalizedDataset,
  profile: EffectiveEmployeeProfile,
  gapAnalysis: GapAnalysis,
  event: DevelopmentEvent,
  effectiveGains: Record<string, number>,
): ScoredCandidate {
  const engagement = engagementFit(dataset, profile.employee.id, event);
  const factorScores: FactorScores = {
    targetGapImpact: round(targetGapImpact(gapAnalysis, effectiveGains)),
    engagementFit: round(engagement.score),
    feasibility: round(feasibilityScore(dataset, profile, event)),
    goalAlignment: round(goalAlignment(profile, gapAnalysis, event)),
    pathDiversity: round(pathValue(gapAnalysis, effectiveGains)),
  };
  const factorContributions: FactorScores = {
    targetGapImpact: round(factorScores.targetGapImpact * SCORE_WEIGHTS.targetGapImpact),
    engagementFit: round(factorScores.engagementFit * SCORE_WEIGHTS.engagementFit),
    feasibility: round(factorScores.feasibility * SCORE_WEIGHTS.feasibility),
    goalAlignment: round(factorScores.goalAlignment * SCORE_WEIGHTS.goalAlignment),
    pathDiversity: round(factorScores.pathDiversity * SCORE_WEIGHTS.pathDiversity),
  };
  const baseScore = round(
    Object.values(factorContributions).reduce((sum, contribution) => sum + contribution, 0),
  );

  const simulated = { ...profile, effectiveSkills: projectedSkills(profile, event) };
  const projectedReadiness = round(analyzeGaps(simulated, gapAnalysis.target).readiness);
  const target = gapAnalysis.target;
  const evidence: EvidenceItem[] = [
    {
      id: `target:${profile.employee.id}`,
      kind: "target",
      label: "Career target",
      value: target ? `${target.role} ${target.grade}` : "No target",
      source: target?.source ?? "none",
    },
    {
      id: `history:${event.id}`,
      kind: "history",
      label: "Similar activity history",
      value: `${engagement.positive} positive / ${engagement.negative} negative; ${engagement.selfMatched} self / ${engagement.assignedMatched} assigned`,
      source: "activity_history.csv",
    },
    {
      id: `feasibility:${event.id}`,
      kind: "feasibility",
      label: "Format and availability fit",
      value: factorScores.feasibility,
      source: "employee.work_format + event sessions",
    },
    {
      id: `projection:${event.id}`,
      kind: "projection",
      label: "Projected readiness",
      value: projectedReadiness,
      source: "deterministic simulation",
    },
  ];
  Object.entries(effectiveGains).forEach(([skillId, gain]) => {
    const gap = gapAnalysis.gaps.find((item) => item.skillId === skillId);
    evidence.push(
      {
        id: `gap:${event.id}:${skillId}`,
        kind: "skill_gap",
        label: skillId,
        value: gap ? `${gap.currentLevel}/${gap.requiredLevel}${gap.critical ? " critical" : ""}` : "unknown",
        source: "employee skills + target role profile",
      },
      {
        id: `gain:${event.id}:${skillId}`,
        kind: "effective_gain",
        label: `${skillId} effective gain`,
        value: gain,
        source: "event gain/max_level",
      },
    );
  });
  Object.entries(factorContributions).forEach(([factor, contribution]) => {
    evidence.push({
      id: `factor:${event.id}:${factor}`,
      kind: "factor",
      label: `${factor} contribution`,
      value: contribution,
      source: `factor score x weight ${SCORE_WEIGHTS[factor as keyof FactorScores]}`,
    });
  });

  return {
    event,
    baseScore,
    factorScores,
    factorContributions,
    effectiveGains,
    projectedReadiness,
    evidence,
  };
}

export function candidateSimilarity(a: ScoredCandidate, b: ScoredCandidate): number {
  const aSkills = new Set(Object.keys(a.effectiveGains));
  const bSkills = new Set(Object.keys(b.effectiveGains));
  const skillSimilarity = overlapRatio(aSkills, bSkills);
  const typeSimilarity = a.event.type === b.event.type ? 1 : 0;
  const formatSimilarity = a.event.format === b.event.format ? 1 : 0;
  return clamp01(skillSimilarity * 0.65 + typeSimilarity * 0.25 + formatSimilarity * 0.1);
}
