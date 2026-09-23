import {
  DatasetValidationError,
  importCareerQuestDataset,
} from "@/domain/data";
import {
  analyzeGaps,
  buildEffectiveEmployeeProfile,
  evaluateEligibility,
  recommendForEmployee,
  resolveTarget,
} from "@/domain/recommendation";
import type {
  ActivityHistoryRecord,
  IneligibilityReason,
  NormalizedDataset,
  ProficiencyLevel,
  Recommendation as CoreRecommendation,
  RecommendationResult,
} from "@/lib/contracts";
import { createIntelligenceAdapter } from "./createIntelligenceAdapter";
import type {
  Dataset,
  EmployeeView,
  EvaluationInput,
  IntelligenceAdapter,
  LedgerEvent,
  Recommendation,
  SkillLevels,
} from "./intelligenceAdapter";

const reasons: Record<IneligibilityReason, string> = {
  MANDATORY_EVENT:
    "Обязательное мероприятие: не является добровольной рекомендацией",
  ROLE_MISMATCH: "Не соответствует текущей роли или карьерной цели",
  GRADE_MISMATCH: "Не соответствует текущему или целевому грейду",
  PREREQUISITES_NOT_MET: "Не выполнены требования к навыкам для участия",
  ALREADY_COMPLETED: "Активность уже завершена",
  ALREADY_IN_PROGRESS: "Активность уже выполняется",
  NO_UPCOMING_SESSION: "Нет доступной сессии после даты среза",
  NO_TARGET_GAP_IMPACT: "Не закрывает разрыв до карьерной цели",
};

function toLevels(skills: SkillLevels): Record<string, ProficiencyLevel> {
  const result: Record<string, ProficiencyLevel> = {};
  for (const [id, level] of Object.entries(skills)) {
    if (!Number.isInteger(level) || level < 0 || level > 5)
      throw new Error(`Некорректный уровень ${id}: ${level}`);
    result[id] = level as ProficiencyLevel;
  }
  return result;
}

/** Rebase the effective vector once; keep all history for A's engagement and eligibility.
 * Marking the derived snapshot at the latest accounted date prevents duplicate replay.
 * Every object written here is new; the imported NormalizedDataset is never mutated.
 */
export function withSessionProgress(
  source: NormalizedDataset,
  input: Pick<EvaluationInput, "employeeId" | "ledger" | "overlay">,
): NormalizedDataset {
  const employee = source.employeesById[input.employeeId];
  if (!employee) throw new Error(`Unknown employee: ${input.employeeId}`);
  const events = input.ledger.filter(
    (event) => event.employeeId === employee.id,
  );
  if (!events.length && !input.overlay) return source;
  const skills = input.overlay?.skills ?? events.at(-1)!.after;
  const originalHistory = source.historyByEmployeeId[employee.id] ?? [];
  const appended: ActivityHistoryRecord[] = events.map((event) => ({
    id: `session:${event.id}`,
    employeeId: employee.id,
    eventId: event.activityId,
    date: event.effectiveDate,
    status: "completed",
    completionPct: 100,
    assignedBy: "self",
  }));
  for (const [index, id] of (
    input.overlay?.simulatedActivityIds ?? []
  ).entries()) {
    appended.push({
      id: `simulation:${employee.id}:${index}:${id}`,
      employeeId: employee.id,
      eventId: id,
      date: source.meta.asOfDate,
      status: "completed",
      completionPct: 100,
      assignedBy: "self",
    });
  }
  const history = [...originalHistory, ...appended];
  const accountedThrough = history.reduce(
    (date, record) =>
      record.status === "completed" && record.date > date ? record.date : date,
    source.meta.asOfDate,
  );
  return {
    ...source,
    employeesById: {
      ...source.employeesById,
      [employee.id]: {
        ...employee,
        skills: toLevels(skills),
        lastReviewDate: accountedThrough,
      },
    },
    history: [...source.history, ...appended],
    historyByEmployeeId: {
      ...source.historyByEmployeeId,
      [employee.id]: history,
    },
  };
}

/** Ask A whether completion blocks each event, instead of copying its recurring-ID rule. */
function recurringEvents(source: NormalizedDataset): Set<string> {
  const recurring = new Set<string>();
  for (const employee of Object.values(source.employeesById)) {
    const profile = buildEffectiveEmployeeProfile(source, employee.id);
    const target = resolveTarget(source, profile);
    if (!target) continue;
    const gaps = analyzeGaps(profile, target);
    for (const event of Object.values(source.eventsById)) {
      const probe: ActivityHistoryRecord = {
        id: `recurrence-probe:${event.id}`,
        employeeId: employee.id,
        eventId: event.id,
        date: source.meta.asOfDate,
        status: "completed",
        completionPct: 100,
        assignedBy: "self",
      };
      const dataset = {
        ...source,
        historyByEmployeeId: {
          ...source.historyByEmployeeId,
          [employee.id]: [
            ...(source.historyByEmployeeId[employee.id] ?? []),
            probe,
          ],
        },
      };
      if (
        !evaluateEligibility(dataset, profile, gaps, event).reasons.includes(
          "ALREADY_COMPLETED",
        )
      )
        recurring.add(event.id);
    }
    break;
  }
  return recurring;
}

export function projectDataset(source: NormalizedDataset): Dataset {
  const recurring = recurringEvents(source);
  return {
    id: `${source.meta.dataset}:${source.meta.version}:${source.meta.asOfDate}`,
    snapshotDate: source.meta.asOfDate,
    source,
    employees: Object.values(source.employeesById).map((e) => ({
      id: e.id,
      name: e.fullName,
      role: e.role,
      grade: e.grade,
      preferredLanguage: e.preferredLanguage,
      workFormat: e.workFormat,
      lastReviewDate: e.lastReviewDate,
      skills: e.skills,
    })),
    activities: Object.values(source.eventsById).map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      format: e.format,
      durationHours: e.durationHours,
      mandatory: e.mandatory,
      recurring: recurring.has(e.id),
      gains: e.developsSkills,
      upcomingSessions: e.upcomingSessions,
    })),
    skills: Object.values(source.skillsById).map((s) => ({
      id: s.id,
      name: s.name,
    })),
    history: source.history.map((h) => ({
      employeeId: h.employeeId,
      activityId: h.eventId,
      status: h.status,
      date: h.date,
      completionPct: h.completionPct,
    })),
  };
}

function projectRecommendation(rec: CoreRecommendation): Recommendation {
  return {
    activityId: rec.activityId,
    rank: rec.rank,
    totalScore: rec.totalScore,
    projectedReadiness: rec.projectedReadiness,
    factorScores: { ...rec.factorScores },
    expectedGains: { ...rec.effectiveGains },
    evidence: rec.evidenceReceipt.evidence.map((e) => ({
      id: e.id,
      label: e.label,
      value: String(e.value),
    })),
    deterministicExplanation: rec.deterministicExplanation,
  };
}

/** Explicitly naive comparison, not an alternative production ranker. C can replace this hook. */
export function weakestSkillBaseline(
  source: NormalizedDataset,
  result: RecommendationResult,
): EmployeeView["baseline"] {
  if (!result.gapAnalysis.target) return undefined;
  const skills = Object.entries(result.effectiveProfile.effectiveSkills).sort(
    ([a, av], [b, bv]) => av - bv || a.localeCompare(b),
  );
  for (const [skillId, level] of skills) {
    const candidate = Object.values(source.eventsById)
      .filter(
        (e) =>
          !e.mandatory &&
          e.developsSkills.some(
            (g) => g.skillId === skillId && g.maxLevel > level,
          ),
      )
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!candidate) continue;
    const excluded = result.excluded.find((e) => e.activityId === candidate.id);
    const gap = result.gapAnalysis.gaps.find((g) => g.skillId === skillId);
    return {
      activityId: candidate.id,
      explanation: `${source.skillsById[skillId]?.name ?? skillId}: ${level}/5 — минимальный доступный уровень. ${!gap ? "Навык не входит в требования целевого грейда." : gap.gap === 0 ? "Требование по этому навыку уже закрыто." : "Baseline не учитывает приоритет критичных навыков и историю."}${excluded ? ` ${excluded.reasons.map((r) => reasons[r]).join("; ")}.` : ""}`,
    };
  }
  return undefined;
}

export function createRealIntelligenceAdapter(
  baseline = weakestSkillBaseline,
): IntelligenceAdapter {
  const bridge = createIntelligenceAdapter<
    NormalizedDataset,
    RecommendationResult
  >({
    importCareerQuestDataset,
    recommendForEmployee,
    datasetView: projectDataset,
    withProgress: withSessionProgress,
    validationIssues: (error) =>
      error instanceof DatasetValidationError
        ? error.issues.map((issue) => ({
            file: issue.source,
            path: issue.path,
            row: /^row\.(\d+)/.test(issue.path)
              ? Number(issue.path.match(/^row\.(\d+)/)![1])
              : undefined,
            message: issue.message,
            severity: "error",
          }))
        : [
            {
              file: "dataset",
              message:
                error instanceof Error ? error.message : "Ошибка импорта",
              severity: "error",
            },
          ],
    employeeView(result, all, source) {
      const history = source.historyByEmployeeId[result.employeeId] ?? [];
      return {
        employeeId: result.employeeId,
        target: result.gapAnalysis.target && {
          role: result.gapAnalysis.target.role,
          grade: result.gapAnalysis.target.grade,
        },
        effectiveSkills: result.effectiveProfile.effectiveSkills,
        readiness: result.gapAnalysis.target
          ? result.gapAnalysis.readiness
          : null,
        gaps: result.gapAnalysis.gaps.map((g) => ({
          skillId: g.skillId,
          current: g.currentLevel,
          required: g.requiredLevel,
          critical: g.critical,
        })),
        recommendations: result.recommendations.map(projectRecommendation),
        candidates: all.recommendations.map(projectRecommendation),
        completedActivityIds: [
          ...new Set(
            history
              .filter((h) => h.status === "completed")
              .map((h) => h.eventId),
          ),
        ],
        activeActivityIds: [
          ...new Set(
            history
              .filter((h) => h.status === "in_progress")
              .map((h) => h.eventId),
          ),
        ],
        replayedActivityIds: [
          ...new Set(
            result.effectiveProfile.replayEvidence.map((r) => r.eventId),
          ),
        ],
        excluded: result.excluded.map((e) => ({
          activityId: e.activityId,
          title: e.title,
          reasons: e.reasons.map((r) => reasons[r]),
        })),
        baseline: baseline(source, result),
        explanationStatus: "deterministic",
        engineVersion: result.engineVersion,
      };
    },
  });
  return {
    ...bridge,
    evaluate(input) {
      const view = bridge.evaluate(input);
      const replay = buildEffectiveEmployeeProfile(
        input.dataset.source as NormalizedDataset,
        input.employeeId,
      ).replayEvidence;
      return {
        ...view,
        replayedActivityIds: [...new Set(replay.map((e) => e.eventId))],
      };
    },
    normalizedState(dataset, ledger) {
      const source = dataset.source as NormalizedDataset;
      return [...new Set(ledger.map((e) => e.employeeId))].reduce(
        (current, employeeId) =>
          withSessionProgress(current, { employeeId, ledger }),
        source,
      );
    },
  };
}
