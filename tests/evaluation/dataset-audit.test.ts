import { describe, expect, it } from "vitest";
import { buildEffectiveEmployeeProfile } from "@/domain/recommendation";
import { createDatasetAuditCases } from "@/lib/evaluation/dataset-audit";
import { loadChallengeDataset } from "../recommendation/test-utils";

describe("independent dataset replay audit", () => {
  it("respects same-day import order when activity caps make the order significant", async () => {
    const dataset = structuredClone(loadChallengeDataset());
    const employeeId = "E0028";
    const employee = dataset.employeesById[employeeId];
    employee.skills.SK_SYSTEM_DESIGN = 2;
    const template = Object.values(dataset.eventsById)[0];
    dataset.eventsById.AUDIT_HIGH = {
      ...template,
      id: "AUDIT_HIGH",
      developsSkills: [{ skillId: "SK_SYSTEM_DESIGN", gain: 2, maxLevel: 5 }],
    };
    dataset.eventsById.AUDIT_LOW = {
      ...template,
      id: "AUDIT_LOW",
      developsSkills: [{ skillId: "SK_SYSTEM_DESIGN", gain: 1, maxLevel: 3 }],
    };
    const rows = [
      {
        id: "Z_HIGH_FIRST",
        employeeId,
        eventId: "AUDIT_HIGH",
        date: "2026-09-30",
        status: "completed" as const,
        completionPct: 100,
        assignedBy: "self" as const,
      },
      {
        id: "A_LOW_LAST",
        employeeId,
        eventId: "AUDIT_LOW",
        date: "2026-09-30",
        status: "completed" as const,
        completionPct: 100,
        assignedBy: "self" as const,
      },
    ];
    dataset.history = [
      ...dataset.history.filter((row) => row.employeeId !== employeeId),
      ...rows,
    ];
    dataset.historyByEmployeeId[employeeId] = rows;
    expect(
      buildEffectiveEmployeeProfile(dataset, employeeId).effectiveSkills
        .SK_SYSTEM_DESIGN,
    ).toBe(4);
    const result = await createDatasetAuditCases(dataset)
      .find((item) => item.id === "dataset-replay")!
      .run(new AbortController().signal);
    expect(result.passed).toBe(true);
    expect(result.replay?.matched).toBe(result.replay?.checked);
  });
});
