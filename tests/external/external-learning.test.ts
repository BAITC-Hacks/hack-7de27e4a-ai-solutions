import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import { EmployeeExternalLearningSection } from "@/components/employee/external-learning-section";
import {
  buildEmployeeExternalLearningPlan,
  buildHrExternalLearningPlan,
  ExternalCatalogValidationError,
  findUncoveredSkillGaps,
  loadExternalCourseCatalog,
  parseExternalCourseCatalog,
  rankExternalCoursesForGap,
  type ExternalCourse,
  type ExternalCourseCatalog,
} from "@/domain/external";
import {
  analyzeGaps,
  buildEffectiveEmployeeProfile,
  recommendForEmployee,
  resolveTarget,
} from "@/domain/recommendation";
import type {
  NormalizedDataset,
  PreferredLanguage,
  ProficiencyLevel,
} from "@/lib/contracts";

import { loadChallengeDataset } from "../recommendation/test-utils";

function course(
  id: string,
  skillId: string,
  languages: PreferredLanguage[],
  overrides: Partial<ExternalCourse> = {},
): ExternalCourse {
  return {
    id,
    title: id,
    provider: "Test provider",
    url: "https://stepik.org/course/63054/promo",
    languages,
    durationHours: 10,
    free: true,
    developsSkillIds: [skillId],
    suitableFrom: 0,
    suitableTo: 5,
    source: "external",
    ...overrides,
  };
}

function catalog(courses: ExternalCourse[]): ExternalCourseCatalog {
  return {
    meta: {
      version: "test",
      curatedAt: "2026-09-23",
      mode: "curated_offline",
    },
    courses,
  };
}

function findEmployeeWithUncoveredCatalogSkill(
  dataset: NormalizedDataset,
): {
  employeeId: string;
  skillId: string;
  currentLevel: ProficiencyLevel;
  language: PreferredLanguage;
} {
  for (const employee of Object.values(dataset.employeesById)) {
    const gap = findUncoveredSkillGaps(dataset, employee.id)[0];
    if (gap) {
      return {
        employeeId: employee.id,
        skillId: gap.skillId,
        currentLevel: gap.currentLevel,
        language: employee.preferredLanguage,
      };
    }
  }
  throw new Error("Fixture must contain at least one uncovered skill gap");
}

function collectKeys(value: unknown, result = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return result;
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, result));
    return result;
  }
  Object.entries(value).forEach(([key, nested]) => {
    result.add(key.toLowerCase());
    collectKeys(nested, result);
  });
  return result;
}

describe("External Learning Layer", () => {
  let dataset: NormalizedDataset;
  let bundledCatalog: ExternalCourseCatalog;

  beforeAll(() => {
    dataset = loadChallengeDataset();
    bundledCatalog = loadExternalCourseCatalog(dataset);
  });

  it("loads a strict 25-35 course offline catalog with valid skill references", () => {
    const prioritySkills = new Set([
      "SK_COMMUNICATION",
      "SK_MENTORING",
      "SK_SQL",
      "SK_STAKEHOLDER_MGMT",
      "SK_LEADERSHIP",
      "SK_PROBLEM_SOLVING",
      "SK_PRODUCT_KNOWLEDGE",
      "SK_CRM",
      "SK_CRITICAL_THINKING",
      "SK_AB_TESTING",
      "SK_TEAMWORK",
      "SK_PRODUCT_ANALYTICS",
    ]);
    const coveredSkills = new Set(
      bundledCatalog.courses.flatMap((item) => item.developsSkillIds),
    );

    expect(bundledCatalog.meta.mode).toBe("curated_offline");
    expect(bundledCatalog.courses).toHaveLength(35);
    expect(new Set(bundledCatalog.courses.map((item) => item.id)).size).toBe(35);
    expect(new Set(bundledCatalog.courses.map((item) => item.url)).size).toBe(35);
    expect([...prioritySkills].every((skillId) => coveredSkills.has(skillId))).toBe(true);
    expect(
      bundledCatalog.courses.every(
        (item) =>
          item.source === "external" &&
          item.url.startsWith("https://") &&
          item.developsSkillIds.every((skillId) => Boolean(dataset.skillsById[skillId])),
      ),
    ).toBe(true);
  });

  it("rejects unknown skills and unsafe external URLs during catalog loading", () => {
    const unknownSkill = catalog([
      course("EXT_UNKNOWN_SKILL", "SK_DOES_NOT_EXIST", ["ru"]),
    ]);
    expect(() =>
      parseExternalCourseCatalog(unknownSkill, dataset.skillsById),
    ).toThrow(ExternalCatalogValidationError);

    const unsafeUrl = catalog([
      course("EXT_UNSAFE_URL", "SK_SQL", ["ru"], {
        url: "http://example.com/course",
      }),
    ]);
    expect(() =>
      parseExternalCourseCatalog(unsafeUrl, dataset.skillsById),
    ).toThrow(ExternalCatalogValidationError);

    const lookalikeUrl = catalog([
      course("EXT_LOOKALIKE_URL", "SK_SQL", ["ru"], {
        url: "https://coursera.org.evil.test/course",
      }),
    ]);
    expect(() =>
      parseExternalCourseCatalog(lookalikeUrl, dataset.skillsById),
    ).toThrow(ExternalCatalogValidationError);

    const credentialUrl = catalog([
      course("EXT_CREDENTIAL_URL", "SK_SQL", ["ru"], {
        url: "https://user:secret@stepik.org/course/63054",
      }),
    ]);
    expect(() =>
      parseExternalCourseCatalog(credentialUrl, dataset.skillsById),
    ).toThrow(ExternalCatalogValidationError);
  });

  it("rejects invented effect fields instead of silently accepting them", () => {
    const withInventedGain = {
      ...catalog([course("EXT_STRICT_FIELDS", "SK_SQL", ["ru"])]),
      courses: [
        {
          ...course("EXT_STRICT_FIELDS", "SK_SQL", ["ru"]),
          gain: 1,
          maxLevel: 5,
        },
      ],
    };

    expect(() =>
      parseExternalCourseCatalog(withInventedGain, dataset.skillsById),
    ).toThrow(ExternalCatalogValidationError);
  });

  it("ranks deterministically by level fit, preferred language, free access, duration and id", () => {
    const courses = [
      course("EXT_Z_LEVEL_MISS", "SK_SQL", ["kk"], {
        suitableFrom: 4,
        suitableTo: 5,
        durationHours: 1,
      }),
      course("EXT_A_OTHER_LANGUAGE", "SK_SQL", ["ru"], {
        durationHours: 1,
      }),
      course("EXT_D_PAID", "SK_SQL", ["kk"], {
        free: false,
        durationHours: 1,
      }),
      course("EXT_C_LONG", "SK_SQL", ["kk"], {
        durationHours: 8,
      }),
      course("EXT_B_SHORT", "SK_SQL", ["kk"], {
        durationHours: 2,
      }),
    ];
    const gap = { skillId: "SK_SQL", currentLevel: 2 as const };

    const first = rankExternalCoursesForGap(courses, gap, "kk");
    const second = rankExternalCoursesForGap(courses, gap, "kk");

    expect(first.map((item) => item.course.id)).toEqual([
      "EXT_B_SHORT",
      "EXT_C_LONG",
      "EXT_D_PAID",
      "EXT_A_OTHER_LANGUAGE",
      "EXT_Z_LEVEL_MISS",
    ]);
    expect(second).toEqual(first);
  });

  it("shows at most three courses and puts the preferred language first", () => {
    const fixture = findEmployeeWithUncoveredCatalogSkill(dataset);
    const sameLanguage = ["B", "A"].map((suffix, index) =>
      course(`EXT_${suffix}_MATCH`, fixture.skillId, [fixture.language], {
        durationHours: index + 1,
      }),
    );
    const otherLanguage: PreferredLanguage = fixture.language === "kk" ? "ru" : "kk";
    const plan = buildEmployeeExternalLearningPlan(
      dataset,
      catalog([
        ...sameLanguage,
        course("EXT_C_OTHER_LANGUAGE", fixture.skillId, [otherLanguage], { durationHours: 1 }),
        course("EXT_D_OTHER_LANGUAGE", fixture.skillId, [otherLanguage], { durationHours: 2 }),
      ]),
      fixture.employeeId,
    );

    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].courses).toHaveLength(3);
    expect(plan.groups[0].courses.map((item) => item.languageMatch)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("does not surface an external block when an eligible internal activity covers the gap", () => {
    let fixture:
      | {
          employeeId: string;
          skillId: string;
          language: PreferredLanguage;
        }
      | undefined;

    for (const employee of Object.values(dataset.employeesById)) {
      const profile = buildEffectiveEmployeeProfile(dataset, employee.id);
      const analysis = analyzeGaps(profile, resolveTarget(dataset, profile));
      const uncovered = new Set(
        findUncoveredSkillGaps(dataset, employee.id).map((gap) => gap.skillId),
      );
      const coveredGap = analysis.gaps.find(
        (gap) => gap.gap > 0 && !uncovered.has(gap.skillId),
      );
      if (coveredGap) {
        fixture = {
          employeeId: employee.id,
          skillId: coveredGap.skillId,
          language: employee.preferredLanguage,
        };
        break;
      }
    }
    expect(fixture).toBeDefined();

    const plan = buildEmployeeExternalLearningPlan(
      dataset,
      catalog([
        course("EXT_INTERNAL_ALREADY_COVERS", fixture!.skillId, [fixture!.language]),
      ]),
      fixture!.employeeId,
    );
    expect(plan.groups).toEqual([]);
  });

  it("never changes top-3, readiness, effective skills or the dataset", () => {
    const employeeId = "E0028";
    const snapshot = structuredClone(dataset);
    const before = recommendForEmployee(dataset, employeeId);

    buildEmployeeExternalLearningPlan(dataset, bundledCatalog, employeeId);

    const after = recommendForEmployee(dataset, employeeId);
    expect(after).toEqual(before);
    expect(after.recommendations.every((item) => item.activityId.startsWith("EV_"))).toBe(true);
    expect(after.gapAnalysis.readiness).toBe(before.gapAnalysis.readiness);
    expect(after.effectiveProfile.effectiveSkills).toEqual(
      before.effectiveProfile.effectiveSkills,
    );
    expect(dataset).toEqual(snapshot);
  });

  it("contains no invented gain, cap or readiness fields in course output", () => {
    const fixture = findEmployeeWithUncoveredCatalogSkill(dataset);
    const output = buildEmployeeExternalLearningPlan(
      dataset,
      catalog([
        course("EXT_NO_INVENTED_EFFECT", fixture.skillId, [fixture.language]),
      ]),
      fixture.employeeId,
    );
    const keys = collectKeys(output);

    expect(keys).not.toContain("gain");
    expect(keys).not.toContain("maxlevel");
    expect(keys).not.toContain("max_level");
    expect(keys).not.toContain("projectedreadiness");
  });

  it("computes HR demand from the live dataset and preserves the 88-person hard blocker snapshot", () => {
    const plan = buildHrExternalLearningPlan(dataset, bundledCatalog);

    expect(plan.employeesWithUncoveredGaps).toBeGreaterThan(0);
    expect(plan.employeesWithCriticalHardSkillGaps).toBe(88);
    expect(plan.directions.length).toBeGreaterThan(0);
    expect(
      plan.directions.every((direction) =>
        direction.courses.every(
          (option) =>
            option.potentialAudience > 0 &&
            option.levelFitAudience <= option.potentialAudience,
        ),
      ),
    ).toBe(true);
  });

  it("renders the separate employee block with isolated links and an honest disclaimer", () => {
    const fixture = findEmployeeWithUncoveredCatalogSkill(dataset);
    const html = renderToStaticMarkup(
      createElement(EmployeeExternalLearningSection, {
        dataset,
        employeeId: fixture.employeeId,
      }),
    );

    expect(html).toContain("Внутри компании пока нет подходящего шага");
    expect(html).toContain("не участвуют в top-3");
    expect(html).toContain("эффект не подтверждён данными компании");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
