import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importCareerQuestDataset } from "@/domain/data";
import {
  bundleToFiles,
  mergeDatasetTexts,
  normalizedDatasetToBundle,
} from "@/domain/data/judge-import";
import { recommendForEmployee } from "@/domain/recommendation";
import type { NormalizedDataset } from "@/lib/contracts";
import { createEmployeeStore } from "@/state/employeeStore";
import {
  createRealIntelligenceAdapter,
  projectDataset,
} from "@/state/realIntelligenceAdapter";

const read = (name: string) =>
  readFileSync(new URL(`../../data/source/${name}`, import.meta.url), "utf8");
const source = importCareerQuestDataset({
  employees: read("employees.json"),
  events: read("events.json"),
  skills: read("skills.json"),
  activityHistoryCsv: read("activity_history.csv"),
});
const judges = readFileSync(
  new URL("../../fixtures/judge/judge_profiles.json", import.meta.url),
  "utf8",
);
const append = (dataset: NormalizedDataset) =>
  importCareerQuestDataset(
    bundleToFiles(
      mergeDatasetTexts({
        base: normalizedDatasetToBundle(dataset),
        incoming: { employees: judges },
        mode: "append",
      }).bundle,
    ),
  );

describe("append from the current authorized workspace", () => {
  it("round-trips an unchanged dataset without changing effective skills, readiness or the source", () => {
    const snapshot = structuredClone(source);
    const result = append(source);
    for (const id of ["E0001", "E0028", "E0100"]) {
      const before = recommendForEmployee(source, id);
      const after = recommendForEmployee(result, id);
      expect(after.effectiveProfile.effectiveSkills).toEqual(
        before.effectiveProfile.effectiveSkills,
      );
      expect(after.gapAnalysis.readiness).toBe(before.gapAnalysis.readiness);
      expect(after.recommendations).toEqual(before.recommendations);
    }
    expect(source).toEqual(snapshot);
  });

  it("retains only the scoped employee and removes an unavailable manager reference", () => {
    const employee = Object.values(source.employeesById).find(
      (person) => person.managerId !== null,
    )!;
    const history = source.historyByEmployeeId[employee.id] ?? [];
    const scoped = {
      ...source,
      employeesById: { [employee.id]: employee },
      history,
      historyByEmployeeId: { [employee.id]: history },
    };
    const result = append(scoped);
    expect(Object.keys(result.employeesById).sort()).toEqual(
      [employee.id, "J0001", "J0002", "J0003"].sort(),
    );
    expect(result.employeesById[employee.id].managerId).toBeNull();
    expect(result.history).toEqual(history);
    expect(source.employeesById[employee.id].managerId).toBe(
      employee.managerId,
    );
  });

  it("folds a confirmed completion into history once, preserving its skills and readiness across repeated append", () => {
    const store = createEmployeeStore(createRealIntelligenceAdapter());
    store.getState().loadDataset(projectDataset(source));
    store.getState().selectEmployee("E0028");
    const activityId =
      store.getState().views.E0028.recommendations[0].activityId;
    store.getState().previewActivity(activityId);
    const preview = store.getState().simulation!;
    expect(store.getState().confirmCompletion(preview.requestId)).toBe(true);
    const committed = store.getState();
    const historyId = `session:${committed.ledger[0].id}`;
    const first = append(committed.normalizedDataset!);
    expect(store.getState().loadDataset(projectDataset(first))).toBe(true);
    const reloaded = store.getState();
    expect(reloaded.ledger).toHaveLength(0);
    expect(reloaded.views.E0028.effectiveSkills).toEqual(
      committed.views.E0028.effectiveSkills,
    );
    expect(reloaded.views.E0028.readiness).toBe(
      committed.views.E0028.readiness,
    );
    const second = append(reloaded.normalizedDataset!);
    expect(
      second.history.filter((record) => record.id === historyId),
    ).toHaveLength(1);
    expect(second.history).toHaveLength(source.history.length + 1);
    const after = recommendForEmployee(second, "E0028");
    expect(after.effectiveProfile.effectiveSkills).toEqual(
      committed.views.E0028.effectiveSkills,
    );
    expect(after.gapAnalysis.readiness).toBe(committed.views.E0028.readiness);
  });
});
