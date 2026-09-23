import {
  analyzeGaps,
  buildEffectiveEmployeeProfile,
  evaluateEligibility,
  recommendForEmployee,
  resolveTarget,
} from "@/domain/recommendation";
import type {
  ActivityHistoryRecord,
  Grade,
  NormalizedDataset,
  ProficiencyLevel,
  Recommendation,
  RecommendationResult,
} from "@/lib/contracts";

const DEFAULT_PATH_STEPS = 3;
const MIN_BUDDY_SKILL_LEVEL = 4;
export const PATH_BEAM_WIDTH = 10;
export const PATH_MAX_DEPTH = 4;
export const XP_PER_VOLUNTARY_COMPLETION = 100;
export const XP_PER_LEVEL = 300;

export interface SkillChange {
  skillId: string;
  before: ProficiencyLevel;
  after: ProficiencyLevel;
  gain: number;
}

export interface SimulationResult {
  activityId: string;
  title: string;
  readinessBefore: number;
  readinessAfter: number;
  skillChanges: SkillChange[];
  closedGaps: string[];
  remainingCriticalGaps: string[];
  rerankedRecommendations: Recommendation[];
}

export interface ActivityCompletionResult {
  dataset: NormalizedDataset;
  simulation: SimulationResult;
  recommendation: RecommendationResult;
}

export interface CareerQuestPathStep {
  step: number;
  activityId: string;
  title: string;
  readinessBefore: number;
  readinessAfter: number;
  skillChanges: SkillChange[];
  closedGaps: string[];
  remainingCriticalGaps: string[];
}

export interface CareerQuestPath {
  employeeId: string;
  readinessBefore: number;
  readinessAfter: number;
  steps: CareerQuestPathStep[];
  finalRecommendation: RecommendationResult;
}

export interface SkillBuddySuggestion {
  employeeId: string;
  fullName: string;
  department: string;
  role: string;
  grade: Grade;
  skillId: string;
  skillLevel: ProficiencyLevel;
  sameDepartment: boolean;
}

export interface PrivateProgress {
  employeeId: string;
  xp: number;
  level: number;
  levelName: string;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number;
  voluntaryCompletions: number;
  qualifyingHistoryIds: string[];
}

interface PathSearchState {
  dataset: NormalizedDataset;
  recommendation: RecommendationResult;
  steps: CareerQuestPathStep[];
  usedActivityIds: Set<string>;
  cumulativeScore: number;
  pathKey: string;
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function getEventOrThrow(dataset: NormalizedDataset, eventId: string) {
  const event = dataset.eventsById[eventId];
  if (!event) throw new Error(`Unknown activity: ${eventId}`);
  return event;
}

function assertCompletionIsAllowed(
  dataset: NormalizedDataset,
  employeeId: string,
  eventId: string,
): void {
  const event = getEventOrThrow(dataset, eventId);
  const profile = buildEffectiveEmployeeProfile(dataset, employeeId);
  const gaps = analyzeGaps(profile, resolveTarget(dataset, profile));
  const eligibility = evaluateEligibility(dataset, profile, gaps, event);
  if (!eligibility.eligible) {
    throw new Error(`Activity ${eventId} is not eligible: ${eligibility.reasons.join(",")}`);
  }
}

function appendCompletion(
  dataset: NormalizedDataset,
  employeeId: string,
  eventId: string,
  recordId: string,
): NormalizedDataset {
  if (!recordId.trim()) throw new Error("recordId must not be empty");
  if (dataset.history.some((record) => record.id === recordId)) {
    throw new Error(`History record already exists: ${recordId}`);
  }

  assertCompletionIsAllowed(dataset, employeeId, eventId);
  const record: ActivityHistoryRecord = {
    id: recordId,
    employeeId,
    eventId,
    date: dataset.meta.asOfDate,
    status: "completed",
    completionPct: 100,
    assignedBy: "self",
  };

  return {
    ...dataset,
    history: [...dataset.history, record],
    historyByEmployeeId: {
      ...dataset.historyByEmployeeId,
      [employeeId]: [...(dataset.historyByEmployeeId[employeeId] ?? []), record],
    },
  };
}

function buildSimulation(
  datasetBefore: NormalizedDataset,
  eventId: string,
  recommendationBefore: RecommendationResult,
  recommendationAfter: RecommendationResult,
): SimulationResult {
  const event = getEventOrThrow(datasetBefore, eventId);
  const beforeSkills = recommendationBefore.effectiveProfile.effectiveSkills;
  const afterSkills = recommendationAfter.effectiveProfile.effectiveSkills;
  const skillChanges = event.developsSkills
    .map((effect): SkillChange => {
      const before = beforeSkills[effect.skillId] ?? 0;
      const after = afterSkills[effect.skillId] ?? 0;
      return {
        skillId: effect.skillId,
        before,
        after,
        gain: after - before,
      };
    })
    .sort((a, b) => a.skillId.localeCompare(b.skillId));

  const readinessBefore = recommendationBefore.gapAnalysis.readiness;
  const readinessAfter = recommendationAfter.gapAnalysis.readiness;
  const gapsAfter = new Map(
    recommendationAfter.gapAnalysis.gaps.map((gap) => [gap.skillId, gap]),
  );
  const closedGaps = recommendationBefore.gapAnalysis.gaps
    .filter((gap) => gap.gap > 0 && (gapsAfter.get(gap.skillId)?.gap ?? 0) === 0)
    .map((gap) => gap.skillId)
    .sort();
  const remainingCriticalGaps = recommendationAfter.gapAnalysis.gaps
    .filter((gap) => gap.critical && gap.gap > 0)
    .map((gap) => gap.skillId)
    .sort();
  return {
    activityId: eventId,
    title: event.title,
    readinessBefore,
    readinessAfter,
    skillChanges,
    closedGaps,
    remainingCriticalGaps,
    rerankedRecommendations: recommendationAfter.recommendations,
  };
}

function uniqueDerivedRecordId(dataset: NormalizedDataset, base: string): string {
  const existing = new Set(dataset.history.map((record) => record.id));
  if (!existing.has(base)) return base;
  let suffix = 1;
  while (existing.has(`${base}:${suffix}`)) suffix += 1;
  return `${base}:${suffix}`;
}

export function applyActivityCompletion(
  dataset: NormalizedDataset,
  employeeId: string,
  eventId: string,
  recordId: string,
): ActivityCompletionResult {
  const recommendationBefore = recommendForEmployee(dataset, employeeId);
  const nextDataset = appendCompletion(dataset, employeeId, eventId, recordId);
  const recommendation = recommendForEmployee(nextDataset, employeeId);
  return {
    dataset: nextDataset,
    simulation: buildSimulation(
      dataset,
      eventId,
      recommendationBefore,
      recommendation,
    ),
    recommendation,
  };
}

export function simulateActivity(
  dataset: NormalizedDataset,
  employeeId: string,
  eventId: string,
): SimulationResult {
  const recordId = uniqueDerivedRecordId(
    dataset,
    `simulation:${employeeId}:${eventId}:${dataset.meta.asOfDate}`,
  );
  return applyActivityCompletion(dataset, employeeId, eventId, recordId).simulation;
}

export function buildCareerQuestPath(
  dataset: NormalizedDataset,
  employeeId: string,
  maxSteps = DEFAULT_PATH_STEPS,
): CareerQuestPath {
  assertNonNegativeInteger(maxSteps, "maxSteps");
  const searchDepth = Math.min(maxSteps, PATH_MAX_DEPTH);
  const candidateLimit = Math.min(
    PATH_BEAM_WIDTH,
    Object.keys(dataset.eventsById).length,
  );
  const initialRecommendation = recommendForEmployee(dataset, employeeId);
  const initialState: PathSearchState = {
    dataset,
    recommendation: initialRecommendation,
    steps: [],
    usedActivityIds: new Set<string>(),
    cumulativeScore: 0,
    pathKey: "",
  };
  let beam: PathSearchState[] = [initialState];
  const explored: PathSearchState[] = [initialState];

  const compareStates = (left: PathSearchState, right: PathSearchState) => {
    const leftReadiness = left.recommendation.gapAnalysis.readiness;
    const rightReadiness = right.recommendation.gapAnalysis.readiness;
    const leftCritical = left.recommendation.gapAnalysis.gaps.filter(
      (gap) => gap.critical && gap.gap > 0,
    ).length;
    const rightCritical = right.recommendation.gapAnalysis.gaps.filter(
      (gap) => gap.critical && gap.gap > 0,
    ).length;
    return (
      rightReadiness - leftReadiness ||
      leftCritical - rightCritical ||
      left.steps.length - right.steps.length ||
      right.cumulativeScore - left.cumulativeScore ||
      left.pathKey.localeCompare(right.pathKey)
    );
  };

  for (let depth = 0; depth < searchDepth; depth += 1) {
    const expanded: PathSearchState[] = [];

    beam.forEach((state) => {
      if (state.recommendation.gapAnalysis.promotionEligible) return;
      const candidates = recommendForEmployee(
        state.dataset,
        employeeId,
        candidateLimit,
      ).recommendations.filter(
        (candidate) => !state.usedActivityIds.has(candidate.activityId),
      );

      candidates.forEach((candidate) => {
        const nextPathIds = [
          ...state.steps.map((step) => step.activityId),
          candidate.activityId,
        ];
        const recordId = uniqueDerivedRecordId(
          state.dataset,
          `beam:${employeeId}:${nextPathIds.join("+")}:${state.dataset.meta.asOfDate}`,
        );
        const completion = applyActivityCompletion(
          state.dataset,
          employeeId,
          candidate.activityId,
          recordId,
        );
        expanded.push({
          dataset: completion.dataset,
          recommendation: completion.recommendation,
          steps: [
            ...state.steps,
            {
              step: depth + 1,
              activityId: candidate.activityId,
              title: candidate.title,
              readinessBefore: completion.simulation.readinessBefore,
              readinessAfter: completion.simulation.readinessAfter,
              skillChanges: completion.simulation.skillChanges,
              closedGaps: completion.simulation.closedGaps,
              remainingCriticalGaps: completion.simulation.remainingCriticalGaps,
            },
          ],
          usedActivityIds: new Set([...state.usedActivityIds, candidate.activityId]),
          cumulativeScore: state.cumulativeScore + candidate.totalScore,
          pathKey: nextPathIds.join("|"),
        });
      });
    });

    if (!expanded.length) break;
    expanded.sort(compareStates);
    beam = expanded.slice(0, PATH_BEAM_WIDTH);
    explored.push(...beam);
  }

  explored.sort(compareStates);
  const best = explored[0];

  return {
    employeeId,
    readinessBefore: initialRecommendation.gapAnalysis.readiness,
    readinessAfter: best.recommendation.gapAnalysis.readiness,
    steps: best.steps,
    finalRecommendation: best.recommendation,
  };
}

export function recommendSkillBuddies(
  dataset: NormalizedDataset,
  employeeId: string,
  skillId: string,
  limit = 3,
): SkillBuddySuggestion[] {
  assertNonNegativeInteger(limit, "limit");
  if (!dataset.skillsById[skillId]) throw new Error(`Unknown skill: ${skillId}`);
  const employeeProfile = buildEffectiveEmployeeProfile(dataset, employeeId);
  const employee = employeeProfile.employee;
  const employeeLevel = employeeProfile.effectiveSkills[skillId] ?? 0;

  return Object.keys(dataset.employeesById)
    .filter((candidateId) => candidateId !== employeeId)
    .map((candidateId) => buildEffectiveEmployeeProfile(dataset, candidateId))
    .filter((candidate) => {
      const candidateLevel = candidate.effectiveSkills[skillId] ?? 0;
      return candidateLevel >= MIN_BUDDY_SKILL_LEVEL && candidateLevel > employeeLevel;
    })
    .sort((a, b) => {
      const aSameDepartment = a.employee.department === employee.department;
      const bSameDepartment = b.employee.department === employee.department;
      return (
        Number(bSameDepartment) - Number(aSameDepartment) ||
        (b.effectiveSkills[skillId] ?? 0) - (a.effectiveSkills[skillId] ?? 0) ||
        Number(b.employee.role === employee.role) - Number(a.employee.role === employee.role) ||
        a.employee.id.localeCompare(b.employee.id)
      );
    })
    .slice(0, limit)
    .map((candidate) => ({
      employeeId: candidate.employee.id,
      fullName: candidate.employee.fullName,
      department: candidate.employee.department,
      role: candidate.employee.role,
      grade: candidate.employee.grade,
      skillId,
      skillLevel: candidate.effectiveSkills[skillId] ?? 0,
      sameDepartment: candidate.employee.department === employee.department,
    }));
}

export function computePrivateProgress(
  dataset: NormalizedDataset,
  employeeId: string,
): PrivateProgress {
  if (!dataset.employeesById[employeeId]) throw new Error(`Unknown employee: ${employeeId}`);
  const qualifyingRecords = (dataset.historyByEmployeeId[employeeId] ?? [])
    .filter((record) => {
      const event = dataset.eventsById[record.eventId];
      return (
        record.status === "completed" &&
        record.assignedBy === "self" &&
        record.date <= dataset.meta.asOfDate &&
        Boolean(event && !event.mandatory)
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const xp = qualifyingRecords.length * XP_PER_VOLUNTARY_COMPLETION;
  const currentLevelXp = xp % XP_PER_LEVEL;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  return {
    employeeId,
    xp,
    level,
    levelName: `Level ${level}`,
    currentLevelXp,
    nextLevelXp: XP_PER_LEVEL,
    progress: currentLevelXp / XP_PER_LEVEL,
    voluntaryCompletions: qualifyingRecords.length,
    qualifyingHistoryIds: qualifyingRecords.map((record) => record.id),
  };
}
