import {
  analyzeGaps,
  buildEffectiveEmployeeProfile,
  evaluateEligibility,
  resolveTarget,
} from "@/domain/recommendation";
import type {
  NormalizedDataset,
  PreferredLanguage,
  ProficiencyLevel,
  SkillGap,
} from "@/lib/contracts";

import type { ExternalCourse, ExternalCourseCatalog } from "./schema";

export interface UncoveredSkillGap extends SkillGap {
  skillName: string;
  skillType: "hard" | "soft";
}

export interface RankedExternalCourse {
  course: ExternalCourse;
  languageMatch: boolean;
  levelFit: boolean;
}

export interface EmployeeExternalLearningGroup {
  gap: UncoveredSkillGap;
  courses: RankedExternalCourse[];
}

export interface EmployeeExternalLearningPlan {
  employeeId: string;
  preferredLanguage: PreferredLanguage;
  groups: EmployeeExternalLearningGroup[];
}

export interface HrExternalCourseOption {
  course: ExternalCourse;
  potentialAudience: number;
  levelFitAudience: number;
}

export interface HrExternalLearningDirection {
  skillId: string;
  skillName: string;
  skillType: "hard" | "soft";
  affectedEmployees: number;
  criticalAffectedEmployees: number;
  courses: HrExternalCourseOption[];
}

export interface HrExternalLearningPlan {
  employeesWithUncoveredGaps: number;
  employeesWithCriticalHardSkillGaps: number;
  directions: HrExternalLearningDirection[];
}

/** Uses existing engine primitives and eligibility rules without touching recommendation scoring. */
export function findUncoveredSkillGaps(
  dataset: NormalizedDataset,
  employeeId: string,
): UncoveredSkillGap[] {
  const effectiveProfile = buildEffectiveEmployeeProfile(dataset, employeeId);
  const gapAnalysis = analyzeGaps(
    effectiveProfile,
    resolveTarget(dataset, effectiveProfile),
  );
  const coveredSkillIds = new Set<string>();
  Object.values(dataset.eventsById).forEach((event) => {
    const eligibility = evaluateEligibility(
      dataset,
      effectiveProfile,
      gapAnalysis,
      event,
    );
    if (!eligibility.eligible) return;
    Object.keys(eligibility.effectiveGains).forEach((skillId) => {
      coveredSkillIds.add(skillId);
    });
  });

  return gapAnalysis.gaps
    .filter(
      (gap) => gap.gap > 0 && !coveredSkillIds.has(gap.skillId),
    )
    .map((gap) => {
      const skill = dataset.skillsById[gap.skillId];
      if (!skill) throw new Error(`Unknown gap skill: ${gap.skillId}`);
      return {
        ...gap,
        skillName: skill.name,
        skillType: skill.type,
      };
    });
}

function isLevelFit(
  course: ExternalCourse,
  currentLevel: ProficiencyLevel,
): boolean {
  return currentLevel >= course.suitableFrom && currentLevel <= course.suitableTo;
}

export function rankExternalCoursesForGap(
  courses: readonly ExternalCourse[],
  gap: Pick<UncoveredSkillGap, "skillId" | "currentLevel">,
  preferredLanguage: PreferredLanguage,
): RankedExternalCourse[] {
  return courses
    .filter((course) => course.developsSkillIds.includes(gap.skillId))
    .map((course) => ({
      course,
      languageMatch: course.languages.includes(preferredLanguage),
      levelFit: isLevelFit(course, gap.currentLevel),
    }))
    .sort(
      (left, right) =>
        Number(right.levelFit) - Number(left.levelFit) ||
        Number(right.languageMatch) - Number(left.languageMatch) ||
        Number(right.course.free) - Number(left.course.free) ||
        left.course.durationHours - right.course.durationHours ||
        left.course.id.localeCompare(right.course.id),
    );
}

export function buildEmployeeExternalLearningPlan(
  dataset: NormalizedDataset,
  catalog: ExternalCourseCatalog,
  employeeId: string,
  maxCoursesPerSkill = 3,
): EmployeeExternalLearningPlan {
  const employee = dataset.employeesById[employeeId];
  if (!employee) throw new Error(`Unknown employee: ${employeeId}`);
  const groups = findUncoveredSkillGaps(dataset, employeeId)
    .map((gap): EmployeeExternalLearningGroup => ({
      gap,
      courses: rankExternalCoursesForGap(
        catalog.courses,
        gap,
        employee.preferredLanguage,
      )
        .slice(0, Math.max(0, maxCoursesPerSkill)),
    }))
    .filter((group) => group.courses.length > 0);

  return {
    employeeId,
    preferredLanguage: employee.preferredLanguage,
    groups,
  };
}

interface EmployeeGapContext {
  employeeId: string;
  preferredLanguage: PreferredLanguage;
  gap: UncoveredSkillGap;
}

export function buildHrExternalLearningPlan(
  dataset: NormalizedDataset,
  catalog: ExternalCourseCatalog,
  maxCoursesPerSkill = 3,
  employeeIds: readonly string[] = Object.keys(dataset.employeesById),
): HrExternalLearningPlan {
  const contexts: EmployeeGapContext[] = [];
  const employeesWithUncoveredGaps = new Set<string>();
  const employeesWithCriticalHardSkillGaps = new Set<string>();

  [...new Set(employeeIds)]
    .sort()
    .forEach((employeeId) => {
      const employee = dataset.employeesById[employeeId];
      if (!employee) throw new Error(`Unknown employee: ${employeeId}`);
      findUncoveredSkillGaps(dataset, employeeId).forEach((gap) => {
        contexts.push({
          employeeId,
          preferredLanguage: employee.preferredLanguage,
          gap,
        });
        employeesWithUncoveredGaps.add(employeeId);
        if (gap.critical && gap.skillType === "hard") {
          employeesWithCriticalHardSkillGaps.add(employeeId);
        }
      });
    });

  const bySkill = new Map<string, EmployeeGapContext[]>();
  contexts.forEach((context) => {
    const current = bySkill.get(context.gap.skillId) ?? [];
    current.push(context);
    bySkill.set(context.gap.skillId, current);
  });

  const directions = [...bySkill.entries()]
    .map(([skillId, affected]): HrExternalLearningDirection => {
      const criticalEmployees = new Set(
        affected
          .filter((context) => context.gap.critical)
          .map((context) => context.employeeId),
      );
      const options = catalog.courses
        .filter((course) => course.developsSkillIds.includes(skillId))
        .map((course): HrExternalCourseOption => {
          const languageAudience = affected.filter((context) =>
            course.languages.includes(context.preferredLanguage),
          );
          return {
            course,
            potentialAudience: new Set(
              languageAudience.map((context) => context.employeeId),
            ).size,
            levelFitAudience: new Set(
              languageAudience
                .filter((context) => isLevelFit(course, context.gap.currentLevel))
                .map((context) => context.employeeId),
            ).size,
          };
        })
        .filter((option) => option.potentialAudience > 0)
        .sort(
          (left, right) =>
            right.levelFitAudience - left.levelFitAudience ||
            right.potentialAudience - left.potentialAudience ||
            Number(right.course.free) - Number(left.course.free) ||
            left.course.durationHours - right.course.durationHours ||
            left.course.id.localeCompare(right.course.id),
        )
        .slice(0, Math.max(0, maxCoursesPerSkill));

      const sample = affected[0].gap;
      return {
        skillId,
        skillName: sample.skillName,
        skillType: sample.skillType,
        affectedEmployees: new Set(
          affected.map((context) => context.employeeId),
        ).size,
        criticalAffectedEmployees: criticalEmployees.size,
        courses: options,
      };
    })
    .filter((direction) => direction.courses.length > 0)
    .sort(
      (left, right) =>
        right.criticalAffectedEmployees - left.criticalAffectedEmployees ||
        right.affectedEmployees - left.affectedEmployees ||
        left.skillId.localeCompare(right.skillId),
    );

  return {
    employeesWithUncoveredGaps: employeesWithUncoveredGaps.size,
    employeesWithCriticalHardSkillGaps:
      employeesWithCriticalHardSkillGaps.size,
    directions,
  };
}
