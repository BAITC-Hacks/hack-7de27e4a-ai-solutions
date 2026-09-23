import { describe, expect, it, vi } from "vitest";

import { buildEffectiveEmployeeProfile } from "@/domain/recommendation";
import {
  applyActivityCompletion,
  buildCareerQuestPath,
  computePrivateProgress,
  PATH_MAX_DEPTH,
  recommendSkillBuddies,
  simulateActivity,
} from "@/domain/simulation";
import {
  ensureCompletionLedgerHydrated,
  replayCompletionLedger,
  useCareerQuestStore,
} from "@/state/career-quest-store";
import {
  createDatasetFingerprint,
  type PersistedCompletion,
} from "@/state/progress-ledger";
import type {
  ActivityHistoryRecord,
  DevelopmentEvent,
  Employee,
  NormalizedDataset,
  RoleProfile,
} from "@/lib/contracts";
import { roleProfileKey } from "@/lib/contracts";

import { loadChallengeDataset } from "../recommendation/test-utils";

const employee = (id: string, department: string, core: 0 | 1 | 2 | 3 | 4 | 5): Employee => ({
  id,
  fullName: `Employee ${id}`,
  department,
  role: "Engineer",
  grade: "Junior",
  managerId: null,
  hireDate: "2025-01-01",
  tenureMonths: 20,
  workFormat: "hybrid",
  preferredLanguage: "en",
  careerGoal: null,
  skills: { SK_CORE: core, SK_COMM: 1 },
  lastReviewDate: "2026-09-01",
});

const event = (
  id: string,
  skillId: string,
  gain: number,
  maxLevel: 0 | 1 | 2 | 3 | 4 | 5,
  mandatory = false,
): DevelopmentEvent => ({
  id,
  title: `Activity ${id}`,
  description: "Fixture",
  type: "course",
  format: "self_paced",
  durationHours: 2,
  mandatory,
  targetRoles: ["Engineer"],
  targetGrades: ["Junior", "Middle"],
  developsSkills: [{ skillId, gain, maxLevel }],
  prerequisites: {},
  upcomingSessions: [],
});

function makeDataset(): NormalizedDataset {
  const employees = [
    employee("TARGET", "Platform", 1),
    employee("SAME_FIVE", "Platform", 5),
    employee("SAME_FOUR", "Platform", 4),
    employee("OTHER_FIVE", "Data", 5),
    employee("LOW", "Platform", 2),
  ];
  const events = [
    event("EV_CORE", "SK_CORE", 2, 3),
    event("EV_COMM", "SK_COMM", 1, 2),
    event("EV_CAPPED", "SK_CORE", 5, 2),
    event("EV_PROGRESS", "SK_COMM", 1, 5),
    event("EV_MANDATORY", "SK_COMM", 1, 5, true),
    event("EV_036", "SK_CORE", 1, 5),
  ];
  const history: ActivityHistoryRecord[] = [
    { id: "H_SELF", employeeId: "TARGET", eventId: "EV_PROGRESS", date: "2026-08-01", status: "completed", completionPct: 100, assignedBy: "self" },
    { id: "H_MANAGER", employeeId: "TARGET", eventId: "EV_PROGRESS", date: "2026-08-02", status: "completed", completionPct: 100, assignedBy: "manager" },
    { id: "H_MANDATORY", employeeId: "TARGET", eventId: "EV_MANDATORY", date: "2026-08-03", status: "completed", completionPct: 100, assignedBy: "self" },
    { id: "H_FUTURE", employeeId: "TARGET", eventId: "EV_PROGRESS", date: "2026-10-02", status: "completed", completionPct: 100, assignedBy: "self" },
    { id: "H_NO_SHOW", employeeId: "TARGET", eventId: "EV_PROGRESS", date: "2026-08-04", status: "no_show", completionPct: 0, assignedBy: "self" },
  ];
  const profiles: RoleProfile[] = [
    { role: "Engineer", grade: "Junior", requiredSkills: { SK_CORE: 1, SK_COMM: 1 }, criticalSkills: ["SK_CORE"] },
    { role: "Engineer", grade: "Middle", requiredSkills: { SK_CORE: 3, SK_COMM: 2 }, criticalSkills: ["SK_CORE"] },
    { role: "Engineer", grade: "Senior", requiredSkills: { SK_CORE: 4, SK_COMM: 3 }, criticalSkills: ["SK_CORE"] },
    { role: "Engineer", grade: "Lead", requiredSkills: { SK_CORE: 5, SK_COMM: 4 }, criticalSkills: ["SK_CORE"] },
  ];
  return {
    meta: { dataset: "test", version: "1", asOfDate: "2026-10-01" },
    proficiencyScale: {},
    skillsById: {
      SK_CORE: { id: "SK_CORE", name: "Core", type: "hard", category: "Tech", description: "" },
      SK_COMM: { id: "SK_COMM", name: "Communication", type: "soft", category: "People", description: "" },
    },
    roleProfilesByKey: Object.fromEntries(profiles.map((profile) => [roleProfileKey(profile.role, profile.grade), profile])),
    employeesById: Object.fromEntries(employees.map((item) => [item.id, item])),
    eventsById: Object.fromEntries(events.map((item) => [item.id, item])),
    history,
    historyByEmployeeId: { TARGET: history },
  };
}

function makeBeamDataset(): NormalizedDataset {
  const target = employee("BEAM_TARGET", "Platform", 0);
  target.skills = { SK_A: 0, SK_B: 0, SK_C: 0 };
  const profiles: RoleProfile[] = [
    {
      role: "Engineer",
      grade: "Junior",
      requiredSkills: { SK_A: 0, SK_B: 0, SK_C: 0 },
      criticalSkills: [],
    },
    {
      role: "Engineer",
      grade: "Middle",
      requiredSkills: { SK_A: 3, SK_B: 3, SK_C: 1 },
      criticalSkills: ["SK_A", "SK_B"],
    },
    {
      role: "Engineer",
      grade: "Senior",
      requiredSkills: { SK_A: 4, SK_B: 4, SK_C: 2 },
      criticalSkills: ["SK_A", "SK_B"],
    },
    {
      role: "Engineer",
      grade: "Lead",
      requiredSkills: { SK_A: 5, SK_B: 5, SK_C: 3 },
      criticalSkills: ["SK_A", "SK_B"],
    },
  ];
  const events: DevelopmentEvent[] = [
    {
      ...event("EV_GREEDY", "SK_A", 2, 2),
      developsSkills: [
        { skillId: "SK_A", gain: 2, maxLevel: 2 },
        { skillId: "SK_B", gain: 2, maxLevel: 2 },
      ],
    },
    event("EV_UNLOCK", "SK_C", 1, 1),
    {
      ...event("EV_BIG", "SK_A", 3, 3),
      developsSkills: [
        { skillId: "SK_A", gain: 3, maxLevel: 3 },
        { skillId: "SK_B", gain: 3, maxLevel: 3 },
      ],
      prerequisites: { SK_C: 1 },
    },
  ];

  return {
    meta: { dataset: "beam-test", version: "1", asOfDate: "2026-10-01" },
    proficiencyScale: {},
    skillsById: {
      SK_A: { id: "SK_A", name: "A", type: "hard", category: "Tech", description: "" },
      SK_B: { id: "SK_B", name: "B", type: "hard", category: "Tech", description: "" },
      SK_C: { id: "SK_C", name: "C", type: "hard", category: "Tech", description: "" },
    },
    roleProfilesByKey: Object.fromEntries(
      profiles.map((profile) => [roleProfileKey(profile.role, profile.grade), profile]),
    ),
    employeesById: { BEAM_TARGET: target },
    eventsById: Object.fromEntries(events.map((item) => [item.id, item])),
    history: [],
    historyByEmployeeId: { BEAM_TARGET: [] },
  };
}

describe("Career Quest experience domain", () => {
  it("simulates gains, max_level, readiness and reranking without mutating input", () => {
    const dataset = makeDataset();
    const snapshot = structuredClone(dataset);
    const simulation = simulateActivity(dataset, "TARGET", "EV_CAPPED");

    expect(dataset).toEqual(snapshot);
    expect(simulation.skillChanges).toEqual([
      { skillId: "SK_CORE", before: 1, after: 2, gain: 1 },
    ]);
    expect(simulation.readinessAfter).toBeGreaterThan(simulation.readinessBefore);
    expect(simulation.rerankedRecommendations.map((item) => item.activityId)).not.toContain("EV_CAPPED");
  });

  it("applies completion immutably at snapshot date and rejects duplicate completion", () => {
    const dataset = makeDataset();
    const result = applyActivityCompletion(dataset, "TARGET", "EV_CORE", "LEDGER_1");

    expect(result.dataset).not.toBe(dataset);
    expect(dataset.history.some((item) => item.id === "LEDGER_1")).toBe(false);
    expect(result.dataset.historyByEmployeeId.TARGET.at(-1)).toMatchObject({
      id: "LEDGER_1",
      date: "2026-10-01",
      status: "completed",
      assignedBy: "self",
    });
    expect(() => applyActivityCompletion(result.dataset, "TARGET", "EV_CORE", "LEDGER_2")).toThrow(
      /ALREADY_COMPLETED/,
    );
  });

  it("allows the recurring activity completion but never repeats one activity inside a path", () => {
    const dataset = makeDataset();
    const prior = { id: "H_RECURRING", employeeId: "TARGET", eventId: "EV_036", date: "2026-08-20", status: "completed" as const, completionPct: 100, assignedBy: "self" as const };
    dataset.history.push(prior);
    dataset.historyByEmployeeId.TARGET.push(prior);

    expect(() => applyActivityCompletion(dataset, "TARGET", "EV_036", "LEDGER_RECURRING")).not.toThrow();
    const path = buildCareerQuestPath(dataset, "TARGET", 3);
    expect(new Set(path.steps.map((step) => step.activityId)).size).toBe(path.steps.length);
    expect(path.readinessAfter).toBeGreaterThanOrEqual(path.readinessBefore);
  });

  it("uses bounded beam search to choose an unlock path over the greedy first step", () => {
    const dataset = makeBeamDataset();
    const first = buildCareerQuestPath(dataset, "BEAM_TARGET", 2);
    const second = buildCareerQuestPath(dataset, "BEAM_TARGET", 2);

    expect(first.steps.map((step) => step.activityId)).toEqual(["EV_UNLOCK", "EV_BIG"]);
    expect(first.readinessAfter).toBe(1);
    expect(second).toEqual(first);
    expect(buildCareerQuestPath(dataset, "BEAM_TARGET", 99).steps.length).toBeLessThanOrEqual(
      PATH_MAX_DEPTH,
    );
  });

  it("returns an honest empty path when no activity is eligible", () => {
    const dataset = makeDataset();
    Object.values(dataset.eventsById).forEach((item) => {
      item.mandatory = true;
    });

    const path = buildCareerQuestPath(dataset, "TARGET", 3);
    expect(path.steps).toEqual([]);
    expect(path.readinessAfter).toBe(path.readinessBefore);
  });

  it("uses activity_id as the stable path tie-break", () => {
    const dataset = makeBeamDataset();
    const later = event("EV_Z", "SK_A", 1, 3);
    const earlier = event("EV_A", "SK_A", 1, 3);
    dataset.eventsById = { EV_Z: later, EV_A: earlier };

    expect(buildCareerQuestPath(dataset, "BEAM_TARGET", 1).steps[0]?.activityId).toBe(
      "EV_A",
    );
  });

  it("suggests stronger colleagues privately, preferring the same department", () => {
    const buddies = recommendSkillBuddies(makeDataset(), "TARGET", "SK_CORE", 3);

    expect(buddies.map((item) => item.employeeId)).toEqual(["SAME_FIVE", "SAME_FOUR", "OTHER_FIVE"]);
    expect(buddies.every((item) => item.employeeId !== "TARGET" && item.skillLevel >= 4)).toBe(true);
    expect(buddies.map((item) => item.sameDepartment)).toEqual([true, true, false]);
    expect(buddies.every((item) => !("rank" in item))).toBe(true);
  });

  it("computes private XP only from self-assigned voluntary completions by snapshot date", () => {
    expect(computePrivateProgress(makeDataset(), "TARGET")).toEqual({
      employeeId: "TARGET",
      xp: 100,
      level: 1,
      levelName: "Level 1",
      currentLevelXp: 100,
      nextLevelXp: 300,
      progress: 1 / 3,
      voluntaryCompletions: 1,
      qualifyingHistoryIds: ["H_SELF"],
    });
  });

  it("validates deterministic caller inputs", () => {
    const dataset = makeDataset();
    expect(() => buildCareerQuestPath(dataset, "TARGET", -1)).toThrow(/maxSteps/);
    expect(() => recommendSkillBuddies(dataset, "TARGET", "UNKNOWN")).toThrow(/Unknown skill/);
    expect(() => applyActivityCompletion(dataset, "TARGET", "EV_CORE", "")).toThrow(/recordId/);
  });

  it("rehydrates compatible local completions and isolates stale judge-dataset entries", () => {
    const dataset = makeDataset();
    const datasetFingerprint = createDatasetFingerprint(dataset);
    const hydration = replayCompletionLedger(dataset, [
      {
        id: "STALE",
        datasetFingerprint,
        employeeId: "UNKNOWN",
        activityId: "EV_CORE",
        completedAt: "2026-10-01:00001",
      },
      {
        id: "VALID",
        datasetFingerprint,
        employeeId: "TARGET",
        activityId: "EV_CORE",
        completedAt: "2026-10-01:00002",
      },
    ]);

    expect(hydration.appliedEntries.map((entry) => entry.id)).toEqual(["VALID"]);
    expect(hydration.ignoredEntries.map((entry) => entry.id)).toEqual(["STALE"]);
    expect(hydration.dataset.historyByEmployeeId.TARGET.at(-1)?.id).toBe("VALID");

    const repeated = replayCompletionLedger(
      hydration.dataset,
      hydration.appliedEntries,
      datasetFingerprint,
    );
    expect(repeated.appliedEntries.map((entry) => entry.id)).toEqual(["VALID"]);
    expect(repeated.ignoredEntries).toEqual([]);
    expect(repeated.dataset.history.filter((record) => record.id === "VALID")).toHaveLength(1);
  });

  it("preserves same-day completion order when max_level caps differ", () => {
    const dataset = loadChallengeDataset();
    const datasetFingerprint = createDatasetFingerprint(dataset);
    const hydration = replayCompletionLedger(dataset, [
      {
        // Old UI IDs deliberately sort in the opposite order by activity ID.
        id: "LOCAL_E0090_EV_021_001",
        datasetFingerprint,
        employeeId: "E0090",
        activityId: "EV_021",
        completedAt: "2026-10-01:00001",
      },
      {
        id: "LOCAL_E0090_EV_020_002",
        datasetFingerprint,
        employeeId: "E0090",
        activityId: "EV_020",
        completedAt: "2026-10-01:00002",
      },
    ]);

    expect(hydration.ignoredEntries).toEqual([]);
    expect(hydration.appliedEntries.map((entry) => entry.activityId)).toEqual([
      "EV_021",
      "EV_020",
    ]);
    expect(
      buildEffectiveEmployeeProfile(hydration.dataset, "E0090").effectiveSkills
        .SK_STATISTICS,
    ).toBe(4);
  });

  it("never replays a completion from a different dataset namespace", () => {
    const dataset = makeDataset();
    const datasetFingerprint = createDatasetFingerprint(dataset);
    const foreignEntry: PersistedCompletion = {
      id: "FOREIGN",
      datasetFingerprint: `${datasetFingerprint}:other`,
      employeeId: "TARGET",
      activityId: "EV_CORE",
      completedAt: "2026-10-01:00001",
    };

    const hydration = replayCompletionLedger(dataset, [foreignEntry], datasetFingerprint);

    expect(hydration.appliedEntries).toEqual([]);
    expect(hydration.ignoredEntries).toEqual([foreignEntry]);
    expect(hydration.dataset).toBe(dataset);
  });

  it("shares one global hydration promise across route consumers", async () => {
    const dataset = makeDataset();
    const datasetFingerprint = createDatasetFingerprint(dataset);
    useCareerQuestStore.setState({
      dataset: null,
      datasetFingerprint: null,
      source: null,
      ledgerHydrationStatus: "idle",
      appliedLedgerEntries: [],
      ignoredLedgerEntries: [],
    });

    let resolveEntries!: (entries: PersistedCompletion[]) => void;
    const pendingEntries = new Promise<PersistedCompletion[]>((resolve) => {
      resolveEntries = resolve;
    });
    const loader = vi.fn(() => pendingEntries);
    const firstConsumer = ensureCompletionLedgerHydrated(dataset, undefined, loader);
    const secondConsumer = ensureCompletionLedgerHydrated(dataset, undefined, loader);

    expect(secondConsumer).toBe(firstConsumer);
    expect(useCareerQuestStore.getState().ledgerHydrationStatus).toBe("loading");
    resolveEntries([
      {
        id: "ROUTE_SHARED",
        datasetFingerprint,
        employeeId: "TARGET",
        activityId: "EV_CORE",
        completedAt: "2026-10-01:00001",
      },
    ]);
    const [first, second] = await Promise.all([firstConsumer, secondConsumer]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first.appliedEntries.map((entry) => entry.id)).toEqual(["ROUTE_SHARED"]);
    expect(useCareerQuestStore.getState().ledgerHydrationStatus).toBe("ready");
    expect(useCareerQuestStore.getState().dataset?.history).toContainEqual(
      expect.objectContaining({ id: "ROUTE_SHARED" }),
    );
  });
});
