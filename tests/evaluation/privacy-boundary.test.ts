import { describe, expect, it } from "vitest";

import { buildPrivateEmployeeDataset } from "@/domain/data";
import { recommendForEmployee } from "@/domain/recommendation";
import { recommendSkillBuddies } from "@/domain/simulation";
import { replayCompletionLedger } from "@/state/career-quest-store";
import { createDatasetFingerprint } from "@/state/progress-ledger";

import { loadChallengeDataset } from "../recommendation/test-utils";

describe("employee privacy boundary", () => {
  it("keeps the viewer journey intact without serializing colleagues' engagement data", () => {
    const full = loadChallengeDataset();
    const viewerId = "E0028";
    const privateView = buildPrivateEmployeeDataset(full, viewerId);

    expect(Object.keys(privateView.employeesById).length).toBeLessThan(
      Object.keys(full.employeesById).length,
    );
    expect(privateView.history).toEqual(full.historyByEmployeeId[viewerId]);
    expect(new Set(privateView.history.map((record) => record.employeeId))).toEqual(
      new Set([viewerId]),
    );
    Object.keys(privateView.employeesById)
      .filter((employeeId) => employeeId !== viewerId)
      .forEach((employeeId) => {
        expect(privateView.historyByEmployeeId[employeeId]).toEqual([]);
        expect(privateView.employeesById[employeeId]?.careerGoal).toBeNull();
        expect(privateView.employeesById[employeeId]?.managerId).toBeNull();
      });

    expect(recommendForEmployee(privateView, viewerId)).toEqual(
      recommendForEmployee(full, viewerId),
    );
    const top = recommendForEmployee(full, viewerId).recommendations[0];
    const buddySkill = Object.keys(top?.effectiveGains ?? {})[0];
    expect(buddySkill).toBeDefined();
    if (!buddySkill) return;
    expect(recommendSkillBuddies(privateView, viewerId, buddySkill)).toEqual(
      recommendSkillBuddies(full, viewerId, buddySkill),
    );
  });

  it("uses the canonical org fingerprint so private completions replay in HR/Trust data", () => {
    const full = loadChallengeDataset();
    const viewerId = "E0010";
    const privateView = buildPrivateEmployeeDataset(full, viewerId);
    const fingerprint = createDatasetFingerprint(full);
    const activityId = recommendForEmployee(full, viewerId).recommendations[0]?.activityId;
    expect(activityId).toBeDefined();
    if (!activityId) return;
    const entry = {
      id: `TEST_${viewerId}_${activityId}`,
      datasetFingerprint: fingerprint,
      employeeId: viewerId,
      activityId,
      completedAt: `${full.meta.asOfDate}:00001`,
    };

    const privateHydration = replayCompletionLedger(privateView, [entry], fingerprint);
    const organizationHydration = replayCompletionLedger(full, [entry], fingerprint);

    expect(privateHydration.ignoredEntries).toEqual([]);
    expect(organizationHydration.ignoredEntries).toEqual([]);
    expect(organizationHydration.dataset.history).toContainEqual(
      expect.objectContaining({ id: entry.id, employeeId: viewerId, eventId: activityId }),
    );
    expect(recommendForEmployee(privateHydration.dataset, viewerId)).toEqual(
      recommendForEmployee(organizationHydration.dataset, viewerId),
    );
  });
});
