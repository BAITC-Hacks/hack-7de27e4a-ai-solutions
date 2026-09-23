import { describe, expect, it } from "vitest";

import { DatasetValidationError, importCareerQuestDataset } from "@/domain/data";

import { loadChallengeDataset, loadChallengeFiles } from "./test-utils";

describe("Career Quest exact dataset adapter", () => {
  it("imports all four challenge files with the expected cardinalities", () => {
    const dataset = loadChallengeDataset();

    expect(Object.keys(dataset.employeesById)).toHaveLength(200);
    expect(Object.keys(dataset.skillsById)).toHaveLength(60);
    expect(Object.keys(dataset.eventsById)).toHaveLength(40);
    expect(dataset.history).toHaveLength(2743);
    expect(Object.keys(dataset.roleProfilesByKey)).toHaveLength(32);
    expect(dataset.meta.asOfDate).toBe("2026-10-01");
  });

  it("reports the source file and field for malformed input", () => {
    expect(() =>
      importCareerQuestDataset({
        employees: { meta: {}, employees: [] },
        events: { meta: {}, events: [] },
        skills: { meta: {}, skills: [], role_profiles: [], proficiency_scale: {} },
        activityHistoryCsv: "record_id,employee_id,event_id,date,due_date,status,completion_pct,score,feedback_rating,assigned_by\n",
      }),
    ).toThrowError(DatasetValidationError);

    try {
      importCareerQuestDataset({
        employees: { meta: {}, employees: [] },
        events: { meta: {}, events: [] },
        skills: { meta: {}, skills: [], role_profiles: [], proficiency_scale: {} },
        activityHistoryCsv: "record_id,employee_id,event_id,date,due_date,status,completion_pct,score,feedback_rating,assigned_by\n",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(DatasetValidationError);
      expect((error as DatasetValidationError).issues[0]).toMatchObject({ source: "skills.json" });
      expect((error as DatasetValidationError).issues[0].path).not.toBe("");
    }
  });

  it("rejects broken foreign keys with a relation-level issue", () => {
    const files = loadChallengeFiles();
    files.activityHistoryCsv = files.activityHistoryCsv.replace(",EV_035,", ",EV_UNKNOWN,");

    try {
      importCareerQuestDataset(files);
      throw new Error("Expected relation validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(DatasetValidationError);
      expect((error as DatasetValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "relations",
            path: "history.R000001.event_id",
            message: "Unknown event",
          }),
        ]),
      );
    }
  });
});
