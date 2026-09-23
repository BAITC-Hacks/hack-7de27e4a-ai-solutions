import { beforeAll, describe, expect, it } from "vitest";

import {
  analyzeGaps,
  buildEffectiveEmployeeProfile,
  evaluateEligibility,
  recommendForEmployee,
  resolveTarget,
  scoreCandidate,
} from "@/domain/recommendation";
import { simulateActivity } from "@/domain/simulation";
import type { DevelopmentEvent, NormalizedDataset } from "@/lib/contracts";

import { cloneDataset, loadChallengeDataset } from "./test-utils";

describe("Career Quest Intelligence Engine", () => {
  let dataset: NormalizedDataset;

  beforeAll(() => {
    dataset = loadChallengeDataset();
  });

  it("replays E0028 completed EV_006 after review and never recommends it again", () => {
    const profile = buildEffectiveEmployeeProfile(dataset, "E0028");
    const result = recommendForEmployee(dataset, "E0028");

    expect(profile.employee.lastReviewDate).toBe("2026-06-24");
    expect(profile.employee.skills.SK_SYSTEM_DESIGN).toBe(2);
    expect(profile.effectiveSkills.SK_SYSTEM_DESIGN).toBe(3);
    expect(profile.replayEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventId: "EV_006", skillId: "SK_SYSTEM_DESIGN", before: 2, after: 3 }),
      ]),
    );
    expect(result.recommendations.map((item) => item.activityId)).not.toContain("EV_006");
    expect(result.excluded.find((item) => item.activityId === "EV_006")?.reasons).toContain(
      "ALREADY_COMPLETED",
    );
  });

  it("uses career_goal first and otherwise resolves the next grade", () => {
    const e0028 = buildEffectiveEmployeeProfile(dataset, "E0028");
    expect(e0028.employee.careerGoal).toBeNull();
    expect(resolveTarget(dataset, e0028)).toMatchObject({
      role: "Backend Engineer",
      grade: "Senior",
      source: "next_grade",
    });

    const withGoal = Object.values(dataset.employeesById).find((employee) => employee.careerGoal);
    expect(withGoal).toBeDefined();
    const target = resolveTarget(dataset, buildEffectiveEmployeeProfile(dataset, withGoal!.id));
    expect(target).toMatchObject({
      role: withGoal!.careerGoal!.targetRole,
      grade: withGoal!.careerGoal!.targetGrade,
      source: "career_goal",
    });
  });

  it("prioritizes a target critical gap and rejects an unrelated weakest skill", () => {
    const changed = cloneDataset(dataset);
    changed.employeesById.E0028.skills.SK_DATA_VIZ = 0;
    const profile = buildEffectiveEmployeeProfile(changed, "E0028");
    const gaps = analyzeGaps(profile, resolveTarget(changed, profile));
    const criticalGap = gaps.gaps.find((gap) => gap.critical && gap.gap > 0)!;
    const template = changed.eventsById.EV_036;
    const criticalEvent: DevelopmentEvent = {
      ...template,
      id: "TEST_CRITICAL",
      targetRoles: [profile.employee.role],
      targetGrades: [profile.employee.grade],
      developsSkills: [{ skillId: criticalGap.skillId, gain: 1, maxLevel: 5 }],
    };
    const weakestEvent: DevelopmentEvent = {
      ...criticalEvent,
      id: "TEST_WEAKEST",
      developsSkills: [{ skillId: "SK_DATA_VIZ", gain: 1, maxLevel: 5 }],
    };

    expect(evaluateEligibility(changed, profile, gaps, criticalEvent)).toMatchObject({
      eligible: true,
      effectiveGains: { [criticalGap.skillId]: 1 },
    });
    expect(evaluateEligibility(changed, profile, gaps, weakestEvent)).toMatchObject({
      eligible: false,
      reasons: expect.arrayContaining(["NO_TARGET_GAP_IMPACT"]),
    });
  });

  it("hard-excludes mandatory events before scoring", () => {
    const result = recommendForEmployee(dataset, "E0028");

    expect(result.recommendations.every((item) => !dataset.eventsById[item.activityId].mandatory)).toBe(
      true,
    );
    expect(result.excluded.find((item) => item.activityId === "EV_001")?.reasons).toContain(
      "MANDATORY_EVENT",
    );
  });

  it("excludes candidates with unmet prerequisites", () => {
    const profile = buildEffectiveEmployeeProfile(dataset, "E0028");
    const target = resolveTarget(dataset, profile);
    const gaps = analyzeGaps(profile, target);
    const base = Object.values(dataset.eventsById).find((event) =>
      event.developsSkills.some((effect) => gaps.gaps.some((gap) => gap.skillId === effect.skillId && gap.gap > 0)),
    )!;
    const event: DevelopmentEvent = {
      ...base,
      id: "TEST_PREREQUISITE",
      mandatory: false,
      targetRoles: [profile.employee.role, target!.role],
      targetGrades: [profile.employee.grade, target!.grade],
      prerequisites: { SK_PUBLIC_SPEAKING: 5 },
      upcomingSessions: base.format === "self_paced" ? [] : [dataset.meta.asOfDate],
    };

    expect(evaluateEligibility(dataset, profile, gaps, event)).toMatchObject({
      eligible: false,
      reasons: expect.arrayContaining(["PREREQUISITES_NOT_MET"]),
    });
  });

  it("excludes an event whose max_level cannot create an effective gain", () => {
    const profile = buildEffectiveEmployeeProfile(dataset, "E0028");
    const target = resolveTarget(dataset, profile);
    const gaps = analyzeGaps(profile, target);
    const open = gaps.gaps.find((gap) => gap.gap > 0)!;
    const event: DevelopmentEvent = {
      id: "TEST_MAX_LEVEL",
      title: "Capped activity",
      description: "Test fixture",
      type: "course",
      format: "self_paced",
      durationHours: 1,
      mandatory: false,
      targetRoles: [profile.employee.role, target!.role],
      targetGrades: [profile.employee.grade, target!.grade],
      developsSkills: [
        { skillId: open.skillId, gain: 1, maxLevel: profile.effectiveSkills[open.skillId] ?? 0 },
      ],
      prerequisites: {},
      upcomingSessions: [],
    };

    expect(evaluateEligibility(dataset, profile, gaps, event)).toEqual({
      eligible: false,
      reasons: ["NO_TARGET_GAP_IMPACT"],
      effectiveGains: {},
    });
  });

  it("does not lower a skill above event max_level when projecting readiness", () => {
    const employeeId = "E0070";
    const eventId = "EV_008";
    const profile = buildEffectiveEmployeeProfile(dataset, employeeId);
    const event = dataset.eventsById[eventId];
    const cappedEffect = event.developsSkills.find(
      (effect) => effect.skillId === "SK_COMMUNICATION",
    );

    expect(profile.effectiveSkills.SK_COMMUNICATION).toBe(4);
    expect(cappedEffect?.maxLevel).toBe(3);

    const result = recommendForEmployee(dataset, employeeId);
    const recommendation = result.recommendations.find(
      (item) => item.activityId === eventId,
    );
    const simulation = simulateActivity(dataset, employeeId, eventId);

    expect(recommendation).toBeDefined();
    expect(
      simulation.skillChanges.find((change) => change.skillId === "SK_COMMUNICATION"),
    ).toEqual({
      skillId: "SK_COMMUNICATION",
      before: 4,
      after: 4,
      gain: 0,
    });
    expect(recommendation!.projectedReadiness).toBe(
      Number(simulation.readinessAfter.toFixed(4)),
    );
    expect(recommendation!.projectedReadiness).toBeGreaterThanOrEqual(
      result.gapAnalysis.readiness,
    );
  });

  it("excludes a scheduled event without a future session", () => {
    const profile = buildEffectiveEmployeeProfile(dataset, "E0028");
    const target = resolveTarget(dataset, profile);
    const gaps = analyzeGaps(profile, target);
    const open = gaps.gaps.find((gap) => gap.gap > 0)!;
    const event: DevelopmentEvent = {
      id: "TEST_PAST_SESSION",
      title: "Past session",
      description: "Test fixture",
      type: "course",
      format: "online",
      durationHours: 2,
      mandatory: false,
      targetRoles: [profile.employee.role, target!.role],
      targetGrades: [profile.employee.grade, target!.grade],
      developsSkills: [{ skillId: open.skillId, gain: 1, maxLevel: 5 }],
      prerequisites: {},
      upcomingSessions: ["2026-09-30"],
    };

    expect(evaluateEligibility(dataset, profile, gaps, event)).toMatchObject({
      eligible: false,
      reasons: expect.arrayContaining(["NO_UPCOMING_SESSION"]),
    });
  });

  it("allows recurring EV_036 after completion but excludes ordinary completed events", () => {
    const changed = cloneDataset(dataset);
    const profile = buildEffectiveEmployeeProfile(changed, "E0028");
    const gaps = analyzeGaps(profile, resolveTarget(changed, profile));
    const recurring = changed.eventsById.EV_036;
    const completed = changed.eventsById.EV_006;
    changed.historyByEmployeeId.E0028.push({
      id: "TEST_EV036_COMPLETED",
      employeeId: "E0028",
      eventId: "EV_036",
      date: "2026-05-01",
      status: "completed",
      completionPct: 100,
      assignedBy: "self",
    });

    expect(evaluateEligibility(changed, profile, gaps, completed).reasons).toContain("ALREADY_COMPLETED");
    expect(evaluateEligibility(changed, profile, gaps, recurring).reasons).not.toContain(
      "ALREADY_COMPLETED",
    );
  });

  it("returns an honest no-target result for Lead without career_goal", () => {
    const changed = cloneDataset(dataset);
    const employee = changed.employeesById.E0028;
    employee.grade = "Lead";
    employee.careerGoal = null;
    employee.role = "Backend Engineer";
    const result = recommendForEmployee(changed, "E0028");

    expect(result.gapAnalysis.target).toBeNull();
    expect(result.recommendations).toEqual([]);
    expect(result.consideredCandidates).toBe(0);
  });

  it("returns no recommendations when all eligible activities are disabled", () => {
    const changed = cloneDataset(dataset);
    Object.values(changed.eventsById).forEach((event) => {
      event.mandatory = true;
    });
    const result = recommendForEmployee(changed, "E0028");

    expect(result.recommendations).toEqual([]);
    expect(result.excluded).toHaveLength(40);
  });

  it("separates voluntary engagement from mandatory assigned history", () => {
    const changed = cloneDataset(dataset);
    const profile = buildEffectiveEmployeeProfile(changed, "E0028");
    const gaps = analyzeGaps(profile, resolveTarget(changed, profile));
    const criticalGap = gaps.gaps.find((gap) => gap.critical && gap.gap > 0)!;
    const candidate: DevelopmentEvent = {
      ...changed.eventsById.EV_007,
      id: "TEST_CANDIDATE",
      developsSkills: [{ skillId: criticalGap.skillId, gain: 1, maxLevel: 5 }],
    };
    changed.historyByEmployeeId.E0028 = [
      {
        id: "TEST_MANDATORY_OVERDUE",
        employeeId: "E0028",
        eventId: "EV_001",
        date: "2026-09-01",
        dueDate: "2026-09-15",
        status: "overdue",
        completionPct: 0,
        assignedBy: "hr",
      },
    ];
    const assignedOnly = scoreCandidate(changed, profile, gaps, candidate, {
      [criticalGap.skillId]: 1,
    });

    changed.eventsById.TEST_PRIOR = { ...candidate, id: "TEST_PRIOR" };
    changed.historyByEmployeeId.E0028.push({
      id: "TEST_SELF_COMPLETED",
      employeeId: "E0028",
      eventId: "TEST_PRIOR",
      date: "2026-09-02",
      status: "completed",
      completionPct: 100,
      feedbackRating: 5,
      assignedBy: "self",
    });
    const withVoluntarySignal = scoreCandidate(changed, profile, gaps, candidate, {
      [criticalGap.skillId]: 1,
    });

    expect(assignedOnly.factorScores.engagementFit).toBe(0.55);
    expect(withVoluntarySignal.factorScores.engagementFit).toBeGreaterThan(
      assignedOnly.factorScores.engagementFit,
    );
  });

  it("is deterministic and uses event_id as the stable tie-break", () => {
    const first = recommendForEmployee(dataset, "E0028");
    const second = recommendForEmployee(dataset, "E0028");

    expect(second).toEqual(first);
    expect(second.recommendations.map((item) => item.activityId)).toEqual(
      first.recommendations.map((item) => item.activityId),
    );
    expect(first.recommendations).toHaveLength(Math.min(3, first.consideredCandidates));
    const top = first.recommendations[0];
    expect(
      Number(Object.values(top.factorContributions).reduce((sum, value) => sum + value, 0).toFixed(4)),
    ).toBe(top.baseScore);
    expect(top.evidenceReceipt.evidence.some((item) => item.kind === "factor")).toBe(true);
  });

  it("uses event_id as the tie-break for otherwise identical candidates", () => {
    const changed = cloneDataset(dataset);
    const profile = buildEffectiveEmployeeProfile(changed, "E0028");
    const gaps = analyzeGaps(profile, resolveTarget(changed, profile));
    const open = gaps.gaps.find((gap) => gap.gap > 0)!;
    const event: DevelopmentEvent = {
      id: "TEST_B",
      title: "Identical candidate",
      description: "Test fixture",
      type: "course",
      format: "self_paced",
      durationHours: 2,
      mandatory: false,
      targetRoles: [profile.employee.role],
      targetGrades: [profile.employee.grade],
      developsSkills: [{ skillId: open.skillId, gain: 1, maxLevel: 5 }],
      prerequisites: {},
      upcomingSessions: [],
    };
    changed.eventsById = {
      TEST_B: event,
      TEST_A: { ...event, id: "TEST_A" },
    };

    expect(recommendForEmployee(changed, "E0028", 2).recommendations.map((item) => item.activityId)).toEqual([
      "TEST_A",
      "TEST_B",
    ]);
  });

  it("produces policy-safe outputs for every one of the 200 employees", () => {
    const results = Object.keys(dataset.employeesById).map((employeeId) =>
      recommendForEmployee(dataset, employeeId),
    );

    expect(results).toHaveLength(200);
    results.forEach((result) => {
      expect(result.recommendations.length).toBeLessThanOrEqual(3);
      expect(result.consideredCandidates + result.excluded.length).toBe(40);
      result.recommendations.forEach((recommendation, index) => {
        expect(recommendation.rank).toBe(index + 1);
        expect(recommendation.totalScore).toBeGreaterThanOrEqual(0);
        expect(recommendation.totalScore).toBeLessThanOrEqual(1);
        expect(dataset.eventsById[recommendation.activityId].mandatory).toBe(false);
      });
    });
  });
});
