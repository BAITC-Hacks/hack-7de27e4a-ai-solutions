import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildEffectiveEmployeeProfile,
  recommendForEmployee,
} from "@/domain/recommendation";
import { importCareerQuestDataset } from "@/domain/data";
import type { CareerQuestFiles, NormalizedDataset } from "@/lib/contracts";
import {
  createRealIntelligenceAdapter,
  projectDataset,
} from "../../src/state/realIntelligenceAdapter";
import {
  createEmployeeStore,
  selectNormalizedDataset,
} from "../../src/state/employeeStore";
import { planCareerPath } from "../../src/domain/simulation/planner";

const raw = (name: string) =>
  readFileSync(new URL(`../../data/source/${name}`, import.meta.url), "utf8");
const files: CareerQuestFiles = {
  employees: raw("employees.json"),
  events: raw("events.json"),
  skills: raw("skills.json"),
  activityHistoryCsv: raw("activity_history.csv"),
};
const canonical = importCareerQuestDataset(files);
const input = projectDataset(canonical);

describe("actual dataset v1.0 integration with A", () => {
  it("imports all four actual files and reproduces A's exact top-3 and replay", async () => {
    const adapter = createRealIntelligenceAdapter();
    const result = await adapter.importFiles({
      "employees.json": files.employees as string,
      "events.json": files.events as string,
      "skills.json": files.skills as string,
      "activity_history.csv": files.activityHistoryCsv,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataset.employees).toHaveLength(200);
    expect(result.dataset.activities).toHaveLength(40);
    expect(result.dataset.history).toHaveLength(2743);
    const view = adapter.evaluate({
      dataset: result.dataset,
      employeeId: "E0028",
      ledger: [],
    });
    expect(view.effectiveSkills.SK_SYSTEM_DESIGN).toBe(3);
    expect(view.replayedActivityIds).toContain("EV_006");
    expect(view.recommendations.map((r) => r.activityId)).toEqual(
      recommendForEmployee(canonical, "E0028").recommendations.map(
        (r) => r.activityId,
      ),
    );
    expect(view.recommendations.some((r) => r.activityId === "EV_006")).toBe(
      false,
    );
    expect(
      result.dataset.activities.filter((a) => a.recurring).map((a) => a.id),
    ).toEqual(["EV_036"]);
  });

  it("real what-if and confirmation preserve raw data, avoid double replay, and update shared HR dataset", () => {
    const store = createEmployeeStore(createRealIntelligenceAdapter());
    const original = JSON.stringify(canonical);
    expect(store.getState().loadDataset(input)).toBe(true);
    store.getState().selectEmployee("E0028");
    const before = store.getState();
    const chosen = before.views.E0028.recommendations[0];
    expect(chosen).toBeDefined();
    before.previewActivity(chosen.activityId);
    const preview = store.getState().simulation!;
    expect(preview).toBeTruthy();
    expect(store.getState().dataset).toBe(before.dataset);
    expect(store.getState().normalizedDataset).toBe(before.normalizedDataset);
    expect(store.getState().confirmCompletion(preview.requestId)).toBe(true);
    expect(store.getState().confirmCompletion(preview.requestId)).toBe(false);
    const after = store.getState();
    expect(after.views.E0028.effectiveSkills).toEqual(preview.step.after);
    expect(after.views.E0028.readiness).toBe(preview.step.afterView.readiness);
    expect(after.views.E0028.readiness).toBeGreaterThan(
      before.views.E0028.readiness!,
    );
    expect(after.views.E0028.replayedActivityIds).toContain("EV_006");
    expect(
      after.views.E0028.recommendations.some(
        (r) => r.activityId === chosen.activityId,
      ),
    ).toBe(false);
    expect(
      buildEffectiveEmployeeProfile(selectNormalizedDataset(after)!, "E0028")
        .effectiveSkills,
    ).toEqual(preview.step.after);
    expect(
      recommendForEmployee(
        after.normalizedDataset!,
        "E0028",
      ).recommendations.map((r) => r.activityId),
    ).toEqual(after.views.E0028.recommendations.map((r) => r.activityId));
    expect(after.ledger).toHaveLength(1);
    expect(JSON.stringify(canonical)).toBe(original);
  });

  it("two real confirmations do not replay prior completions twice", () => {
    const store = createEmployeeStore(createRealIntelligenceAdapter());
    store.getState().loadDataset(input);
    store.getState().selectEmployee("E0028");
    for (let i = 0; i < 2; i++) {
      const id = store.getState().views.E0028.recommendations[0].activityId;
      store.getState().previewActivity(id);
      const preview = store.getState().simulation!;
      expect(store.getState().confirmCompletion(preview.requestId)).toBe(true);
      expect(
        buildEffectiveEmployeeProfile(
          store.getState().normalizedDataset!,
          "E0028",
        ).effectiveSkills,
      ).toEqual(preview.step.after);
    }
    expect(store.getState().ledger).toHaveLength(2);
    expect(store.getState().normalizedDataset!.history).toHaveLength(
      canonical.history.length + 2,
    );
  });

  it("actual planner checks A eligibility at every step and stays immutable", () => {
    const adapter = createRealIntelligenceAdapter();
    for (const strategy of ["fastest", "balanced", "stretch"] as const) {
      const path = planCareerPath(
        adapter,
        { dataset: input, employeeId: "E0028", ledger: [] },
        strategy,
      );
      expect(path.steps.length).toBeGreaterThan(0);
      expect(path.steps.length).toBeLessThanOrEqual(4);
      expect(path.steps.some((s) => s.activityId === "EV_006")).toBe(false);
      expect(
        path.steps.every((step) =>
          step.beforeView.candidates.some(
            (r) => r.activityId === step.activityId,
          ),
        ),
      ).toBe(true);
    }
    expect(canonical.employeesById.E0028.skills.SK_SYSTEM_DESIGN).toBe(2);
  });

  it("accepts a new judge profile and missing history without hardcoded IDs", async () => {
    const employees = JSON.parse(files.employees as string);
    employees.employees = [
      {
        ...employees.employees[0],
        employee_id: "JUDGE_NEW",
        manager_id: null,
        grade: "Lead",
        career_goal: null,
      },
    ];
    const adapter = createRealIntelligenceAdapter();
    const result = await adapter.importFiles({
      "employees.json": JSON.stringify(employees),
      "events.json": files.events as string,
      "skills.json": files.skills as string,
      "activity_history.csv": files.activityHistoryCsv.split(/\r?\n/)[0],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const store = createEmployeeStore(adapter);
    expect(store.getState().loadDataset(result.dataset)).toBe(true);
    expect(store.getState().views.JUDGE_NEW.target).toBeNull();
    expect(store.getState().views.JUDGE_NEW.recommendations).toEqual([]);
    expect(store.getState().error).toBeNull();
  });

  it("maps actual Zod/import errors into file and field issues", async () => {
    const result = await createRealIntelligenceAdapter().importFiles({
      "employees.json": "{",
      "events.json": files.events as string,
      "skills.json": files.skills as string,
      "activity_history.csv": files.activityHistoryCsv,
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0].file).toBe("employees.json");
  });
});
