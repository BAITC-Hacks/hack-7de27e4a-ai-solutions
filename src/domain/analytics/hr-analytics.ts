import {
  evaluateEligibility,
  recommendForEmployee,
} from "@/domain/recommendation";
import type {
  ActivityStatus,
  Grade,
  NormalizedDataset,
  RecommendationResult,
} from "@/lib/contracts";

export interface HrSummary {
  employeeCount: number;
  targetableEmployees: number;
  employeesWithNextStep: number;
  employeesWithoutNextStep: number;
  recommendationCoverage: number;
  averageReadiness: number;
}

export interface SkillGapAggregate {
  skillId: string;
  skillName: string;
  affectedEmployees: number;
  criticalAffectedEmployees: number;
  totalGap: number;
  averageGap: number;
}

export type NoStepReason = "NO_TARGET" | "TARGET_READY" | "NO_ELIGIBLE_ACTIVITY";

export interface NoStepEmployee {
  employeeId: string;
  fullName: string;
  department: string;
  role: string;
  grade: Grade;
  target: string | null;
  reason: NoStepReason;
}

export interface ActivityParticipation {
  eventId: string;
  title: string;
  mandatory: boolean;
  total: number;
  completed: number;
  inProgress: number;
  noShow: number;
  dropped: number;
  declined: number;
  overdue: number;
  completionRate: number;
}

export interface CatalogGap {
  skillId: string;
  skillName: string;
  employeesWithOpenGap: number;
  employeesWithoutEligibleActivity: number;
  catalogActivityCount: number;
}

export interface DepartmentInsight {
  department: string;
  employeeCount: number;
  targetableEmployees: number;
  employeesWithNextStep: number;
  recommendationCoverage: number;
  topGapSkillId: string | null;
  topGapSkillName: string | null;
}

export interface HrAnalytics {
  asOfDate: string;
  summary: HrSummary;
  skillGaps: SkillGapAggregate[];
  noStepEmployees: NoStepEmployee[];
  activityParticipation: ActivityParticipation[];
  catalogGaps: CatalogGap[];
  departments: DepartmentInsight[];
}

const round = (value: number, places = 4) => Number(value.toFixed(places));

function noStepReason(result: RecommendationResult): NoStepReason {
  if (!result.gapAnalysis.target) return "NO_TARGET";
  if (result.gapAnalysis.promotionEligible) return "TARGET_READY";
  return "NO_ELIGIBLE_ACTIVITY";
}

function buildParticipation(dataset: NormalizedDataset): ActivityParticipation[] {
  const statusKeys: Record<ActivityStatus, keyof Omit<ActivityParticipation, "eventId" | "title" | "mandatory" | "total" | "completionRate">> = {
    completed: "completed",
    in_progress: "inProgress",
    no_show: "noShow",
    dropped: "dropped",
    declined: "declined",
    overdue: "overdue",
  };
  const rows = Object.values(dataset.eventsById).map((event): ActivityParticipation => ({
    eventId: event.id,
    title: event.title,
    mandatory: event.mandatory,
    total: 0,
    completed: 0,
    inProgress: 0,
    noShow: 0,
    dropped: 0,
    declined: 0,
    overdue: 0,
    completionRate: 0,
  }));
  const byId = Object.fromEntries(rows.map((row) => [row.eventId, row]));

  dataset.history.forEach((record) => {
    const row = byId[record.eventId];
    if (!row) return;
    row.total += 1;
    row[statusKeys[record.status]] += 1;
  });
  rows.forEach((row) => {
    row.completionRate = row.total ? round(row.completed / row.total) : 0;
  });
  return rows.sort(
    (left, right) =>
      right.total - left.total ||
      right.completionRate - left.completionRate ||
      left.eventId.localeCompare(right.eventId),
  );
}

/**
 * Organization aggregates only. The only employee-level output is the operational no-step
 * queue for the role-scoped HR demo surface; this module intentionally exposes no performance ranking.
 */
export function buildHrAnalytics(dataset: NormalizedDataset): HrAnalytics {
  const employeeIds = Object.keys(dataset.employeesById).sort();
  const results = employeeIds.map((employeeId) => recommendForEmployee(dataset, employeeId));
  const resultByEmployeeId = Object.fromEntries(
    results.map((result) => [result.employeeId, result]),
  );
  const targetable = results.filter((result) => result.gapAnalysis.target);
  const withNextStep = results.filter((result) => result.recommendations.length > 0);
  const averageReadiness = targetable.length
    ? targetable.reduce((sum, result) => sum + result.gapAnalysis.readiness, 0) /
      targetable.length
    : 0;

  const skillGapMap = new Map<string, SkillGapAggregate>();
  const departmentMap = new Map<
    string,
    {
      employeeCount: number;
      targetableEmployees: number;
      withNextStep: number;
      gaps: Map<string, number>;
    }
  >();
  const catalogService = new Map<
    string,
    { openEmployees: Set<string>; unservedEmployees: Set<string> }
  >();

  employeeIds.forEach((employeeId) => {
    const result = resultByEmployeeId[employeeId];
    const employee = result.effectiveProfile.employee;
    const department = departmentMap.get(employee.department) ?? {
      employeeCount: 0,
      targetableEmployees: 0,
      withNextStep: 0,
      gaps: new Map<string, number>(),
    };
    department.employeeCount += 1;
    if (result.gapAnalysis.target) department.targetableEmployees += 1;
    if (result.recommendations.length) department.withNextStep += 1;

    result.gapAnalysis.gaps
      .filter((gap) => gap.gap > 0)
      .forEach((gap) => {
        const current = skillGapMap.get(gap.skillId) ?? {
          skillId: gap.skillId,
          skillName: dataset.skillsById[gap.skillId]?.name ?? gap.skillId,
          affectedEmployees: 0,
          criticalAffectedEmployees: 0,
          totalGap: 0,
          averageGap: 0,
        };
        current.affectedEmployees += 1;
        current.criticalAffectedEmployees += Number(gap.critical);
        current.totalGap += gap.gap;
        skillGapMap.set(gap.skillId, current);
        department.gaps.set(gap.skillId, (department.gaps.get(gap.skillId) ?? 0) + gap.gap);

        const service = catalogService.get(gap.skillId) ?? {
          openEmployees: new Set<string>(),
          unservedEmployees: new Set<string>(),
        };
        service.openEmployees.add(employeeId);
        const hasEligibleActivity = Object.values(dataset.eventsById).some((event) => {
          const eligibility = evaluateEligibility(
            dataset,
            result.effectiveProfile,
            result.gapAnalysis,
            event,
          );
          return eligibility.eligible && (eligibility.effectiveGains[gap.skillId] ?? 0) > 0;
        });
        if (!hasEligibleActivity) service.unservedEmployees.add(employeeId);
        catalogService.set(gap.skillId, service);
      });
    departmentMap.set(employee.department, department);
  });

  const skillGaps = [...skillGapMap.values()]
    .map((gap) => ({
      ...gap,
      averageGap: round(gap.totalGap / gap.affectedEmployees),
    }))
    .sort(
      (left, right) =>
        right.criticalAffectedEmployees - left.criticalAffectedEmployees ||
        right.affectedEmployees - left.affectedEmployees ||
        right.totalGap - left.totalGap ||
        left.skillId.localeCompare(right.skillId),
    );

  const noStepEmployees = results
    .filter((result) => result.recommendations.length === 0)
    .map((result): NoStepEmployee => {
      const employee = result.effectiveProfile.employee;
      const target = result.gapAnalysis.target;
      return {
        employeeId: employee.id,
        fullName: employee.fullName,
        department: employee.department,
        role: employee.role,
        grade: employee.grade,
        target: target ? `${target.role} ${target.grade}` : null,
        reason: noStepReason(result),
      };
    })
    .sort(
      (left, right) =>
        left.reason.localeCompare(right.reason) || left.employeeId.localeCompare(right.employeeId),
    );

  const catalogGaps = [...catalogService.entries()]
    .filter(([, service]) => service.unservedEmployees.size > 0)
    .map(([skillId, service]): CatalogGap => ({
      skillId,
      skillName: dataset.skillsById[skillId]?.name ?? skillId,
      employeesWithOpenGap: service.openEmployees.size,
      employeesWithoutEligibleActivity: service.unservedEmployees.size,
      catalogActivityCount: Object.values(dataset.eventsById).filter(
        (event) =>
          !event.mandatory && event.developsSkills.some((effect) => effect.skillId === skillId),
      ).length,
    }))
    .sort(
      (left, right) =>
        right.employeesWithoutEligibleActivity - left.employeesWithoutEligibleActivity ||
        left.skillId.localeCompare(right.skillId),
    );

  const departments = [...departmentMap.entries()]
    .map(([department, insight]): DepartmentInsight => {
      const topGap = [...insight.gaps.entries()].sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )[0];
      return {
        department,
        employeeCount: insight.employeeCount,
        targetableEmployees: insight.targetableEmployees,
        employeesWithNextStep: insight.withNextStep,
        recommendationCoverage: insight.targetableEmployees
          ? round(insight.withNextStep / insight.targetableEmployees)
          : 1,
        topGapSkillId: topGap?.[0] ?? null,
        topGapSkillName: topGap
          ? (dataset.skillsById[topGap[0]]?.name ?? topGap[0])
          : null,
      };
    })
    .sort(
      (left, right) =>
        left.recommendationCoverage - right.recommendationCoverage ||
        left.department.localeCompare(right.department),
    );

  return {
    asOfDate: dataset.meta.asOfDate,
    summary: {
      employeeCount: employeeIds.length,
      targetableEmployees: targetable.length,
      employeesWithNextStep: withNextStep.length,
      employeesWithoutNextStep: noStepEmployees.length,
      recommendationCoverage: targetable.length ? round(withNextStep.length / targetable.length) : 1,
      averageReadiness: round(averageReadiness),
    },
    skillGaps,
    noStepEmployees,
    activityParticipation: buildParticipation(dataset),
    catalogGaps,
    departments,
  };
}
