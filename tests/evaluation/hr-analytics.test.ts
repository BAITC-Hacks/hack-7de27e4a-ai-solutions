import { describe, expect, it } from "vitest";

import {
  PARTICIPATION_PREVIEW_LIMIT,
  participationRowsForDisplay,
} from "@/components/hr/hr-command-center";
import { buildHrAnalytics } from "@/domain/analytics";

import { loadChallengeDataset } from "../recommendation/test-utils";

describe("HR analytics", () => {
  it("uses targetable employees as the department coverage denominator", () => {
    const analytics = buildHrAnalytics(loadChallengeDataset());
    const backend = analytics.departments.find(
      (department) => department.department === "Backend Development",
    );
    const humanResources = analytics.departments.find(
      (department) => department.department === "Human Resources",
    );

    expect(backend).toMatchObject({
      employeeCount: 40,
      targetableEmployees: 39,
      employeesWithNextStep: 39,
      recommendationCoverage: 1,
    });
    expect(humanResources).toMatchObject({
      employeeCount: 14,
      targetableEmployees: 13,
      employeesWithNextStep: 13,
      recommendationCoverage: 1,
    });
  });

  it("keeps all participation events reachable while limiting the initial table", () => {
    const rows = buildHrAnalytics(loadChallengeDataset()).activityParticipation;

    expect(rows).toHaveLength(40);
    expect(participationRowsForDisplay(rows, false)).toHaveLength(
      PARTICIPATION_PREVIEW_LIMIT,
    );
    expect(participationRowsForDisplay(rows, true)).toEqual(rows);
  });
});
