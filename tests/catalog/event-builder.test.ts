import { describe, expect, it } from "vitest";

import { buildHrAnalytics } from "@/domain/analytics";
import {
  daysUntilEnrollmentDeadline,
  HrEventValidationError,
  nextHrEventId,
  previewHrEventImpact,
  safeValidateHrEventDraft,
  type HrEventDraft,
  validateHrEventDraft,
} from "@/domain/catalog";
import { recommendForEmployee } from "@/domain/recommendation";
import type { DevelopmentEvent, NormalizedDataset } from "@/lib/contracts";

function fixture(): NormalizedDataset {
  return {
    meta: { dataset: "catalog-test", version: "1", asOfDate: "2026-10-01" },
    proficiencyScale: {},
    skillsById: {
      SK_LEADERSHIP: {
        id: "SK_LEADERSHIP",
        name: "Leadership",
        type: "soft",
        category: "People",
        description: "",
      },
      SK_OTHER: {
        id: "SK_OTHER",
        name: "Other",
        type: "hard",
        category: "Core",
        description: "",
      },
    },
    roleProfilesByKey: {
      "Engineer::Junior": {
        role: "Engineer",
        grade: "Junior",
        requiredSkills: { SK_LEADERSHIP: 1 },
        criticalSkills: [],
      },
      "Engineer::Middle": {
        role: "Engineer",
        grade: "Middle",
        requiredSkills: { SK_LEADERSHIP: 2 },
        criticalSkills: ["SK_LEADERSHIP"],
      },
    },
    employeesById: {
      E1: {
        id: "E1",
        fullName: "One",
        department: "Engineering",
        role: "Engineer",
        grade: "Junior",
        managerId: null,
        hireDate: "2025-01-01",
        tenureMonths: 20,
        workFormat: "hybrid",
        preferredLanguage: "en",
        careerGoal: null,
        skills: { SK_LEADERSHIP: 1 },
        lastReviewDate: "2026-09-01",
      },
      E2: {
        id: "E2",
        fullName: "Two",
        department: "Engineering",
        role: "Engineer",
        grade: "Junior",
        managerId: null,
        hireDate: "2025-01-01",
        tenureMonths: 20,
        workFormat: "remote",
        preferredLanguage: "ru",
        careerGoal: null,
        skills: { SK_LEADERSHIP: 2 },
        lastReviewDate: "2026-09-01",
      },
    },
    eventsById: {
      EV_BASE: {
        id: "EV_BASE",
        title: "Baseline",
        description: "Provides the catalog event type without serving the gap",
        type: "workshop",
        format: "self_paced",
        durationHours: 1,
        mandatory: true,
        targetRoles: ["Engineer"],
        targetGrades: ["Junior", "Middle"],
        developsSkills: [{ skillId: "SK_OTHER", gain: 1, maxLevel: 5 }],
        prerequisites: {},
        upcomingSessions: [],
      },
    },
    history: [],
    historyByEmployeeId: {},
  };
}

function validDraft(overrides: Partial<HrEventDraft> = {}): HrEventDraft {
  return {
    title: "Leadership practicum",
    description: "Practice leading a small delivery team",
    type: "workshop",
    format: "online",
    duration_hours: 2,
    mandatory: false,
    target_roles: ["Engineer"],
    target_grades: ["Middle"],
    develops_skills: [{ skill_id: "SK_LEADERSHIP", gain: 1, max_level: 5 }],
    prerequisites: {},
    upcoming_sessions: ["2026-10-10"],
    enrollment_deadline: "2026-10-08",
    ...overrides,
  };
}

function errorPaths(run: () => unknown): string[] {
  try {
    run();
    throw new Error("Expected validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(HrEventValidationError);
    return (error as HrEventValidationError).issues.map((issue) => issue.path);
  }
}

describe("HR event builder validation", () => {
  it("normalizes a valid draft into the canonical event and separate metadata", () => {
    const created = validateHrEventDraft(fixture(), validDraft());

    expect(created.event).toMatchObject({
      id: "EV_HR_001",
      title: "Leadership practicum",
      mandatory: false,
      targetRoles: ["Engineer"],
      developsSkills: [{ skillId: "SK_LEADERSHIP", gain: 1, maxLevel: 5 }],
    });
    expect(created.metadata).toEqual({
      createdBy: "hr",
      createdAtSnapshot: "2026-10-01",
      enrollmentDeadline: "2026-10-08",
    });
    expect(created.event).not.toHaveProperty("enrollmentDeadline");
  });

  it("rejects an unknown developed skill and identifies its exact field", () => {
    expect(
      errorPaths(() =>
        validateHrEventDraft(
          fixture(),
          validDraft({
            develops_skills: [{ skill_id: "SK_MISSING", gain: 1, max_level: 5 }],
          }),
        ),
      ),
    ).toContain("develops_skills.0.skill_id");
  });

  it("rejects mandatory=true even when a caller bypasses the form type", () => {
    const unsafe = { ...validDraft(), mandatory: true } as unknown as HrEventDraft;
    expect(errorPaths(() => validateHrEventDraft(fixture(), unsafe))).toContain("mandatory");
  });

  it("rejects gains above two and max levels above five", () => {
    const unsafe = validDraft({
      develops_skills: [
        { skill_id: "SK_LEADERSHIP", gain: 3, max_level: 6 as 5 },
      ],
    });
    const paths = errorPaths(() => validateHrEventDraft(fixture(), unsafe));
    expect(paths).toContain("develops_skills.0.gain");
    expect(paths).toContain("develops_skills.0.max_level");
  });

  it("rejects a scheduled event without a session on or after the snapshot", () => {
    expect(
      errorPaths(() =>
        validateHrEventDraft(
          fixture(),
          validDraft({
            upcoming_sessions: ["2026-09-30"],
            enrollment_deadline: undefined,
          }),
        ),
      ),
    ).toContain("upcoming_sessions");
  });

  it("requires self-paced events to have an empty session list", () => {
    expect(
      errorPaths(() =>
        validateHrEventDraft(
          fixture(),
          validDraft({ format: "self_paced" }),
        ),
      ),
    ).toContain("upcoming_sessions");
  });

  it("rejects unknown catalog values and prerequisite skill references", () => {
    const unsafe = validDraft({
      type: "invented",
      target_roles: ["Astronaut"],
      prerequisites: { SK_MISSING: 1 },
    });
    const result = safeValidateHrEventDraft(fixture(), unsafe);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["type", "target_roles.0", "prerequisites.SK_MISSING"]),
    );
  });

  it("validates enrollment deadline against snapshot and first session", () => {
    expect(
      errorPaths(() =>
        validateHrEventDraft(
          fixture(),
          validDraft({ enrollment_deadline: "2026-09-30" }),
        ),
      ),
    ).toContain("enrollment_deadline");
    expect(
      errorPaths(() =>
        validateHrEventDraft(
          fixture(),
          validDraft({ enrollment_deadline: "2026-10-11" }),
        ),
      ),
    ).toContain("enrollment_deadline");
  });

  it("allocates a collision-free deterministic EV_HR identifier", () => {
    const dataset = fixture();
    dataset.eventsById.EV_HR_001 = dataset.eventsById.EV_BASE;
    dataset.eventsById.EV_HR_002 = dataset.eventsById.EV_BASE;
    expect(nextHrEventId(dataset)).toBe("EV_HR_003");
  });

  it("calculates remaining days from the supplied snapshot, including leap days", () => {
    expect(daysUntilEnrollmentDeadline("2026-10-01", "2026-10-08")).toBe(7);
    expect(daysUntilEnrollmentDeadline("2028-02-28", "2028-03-01")).toBe(2);
  });
});

describe("HR event impact preview", () => {
  it("matches post-save eligibility, recommendations and catalog coverage", () => {
    const dataset = fixture();
    const created = validateHrEventDraft(dataset, validDraft());
    const preview = previewHrEventImpact(dataset, created.event);

    expect(preview).toMatchObject({
      eligibleEmployeeIds: ["E1"],
      eligibleEmployeeCount: 1,
      criticalAffectedEmployeeIds: ["E1"],
      criticalAffectedEmployeeCount: 1,
      newlyCoveredSkillIds: ["SK_LEADERSHIP"],
      criticalUncoveredEmployeesBefore: 1,
      criticalUncoveredEmployeesAfter: 0,
    });

    const saved: NormalizedDataset = {
      ...dataset,
      eventsById: {
        ...dataset.eventsById,
        [created.event.id]: created.event,
      },
    };
    const actualAffected = Object.keys(saved.employeesById).filter((employeeId) =>
      recommendForEmployee(saved, employeeId).recommendations.some(
        (candidate) => candidate.activityId === created.event.id,
      ),
    );
    expect(actualAffected).toEqual(preview.eligibleEmployeeIds);
    expect(
      recommendForEmployee(saved, "E1").recommendations.some(
        (candidate) => candidate.activityId === created.event.id,
      ),
    ).toBe(true);
    expect(buildHrAnalytics(saved).catalogGaps.map((gap) => gap.skillId)).not.toContain(
      "SK_LEADERSHIP",
    );
  });
});
