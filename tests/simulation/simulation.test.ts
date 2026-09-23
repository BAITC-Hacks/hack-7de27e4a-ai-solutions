import { describe, expect, it, vi } from "vitest";
import { createEmployeeStore } from "../../src/state/employeeStore";
import {
  applyGains,
  nearestSession,
  simulateStep,
} from "../../src/domain/simulation/simulator";
import { planCareerPath } from "../../src/domain/simulation/planner";
import { fixtureAdapter, fixtureDataset } from "./fixture";
import { createIntelligenceAdapter } from "../../src/state/createIntelligenceAdapter";
import type {
  IntelligenceAdapter,
  UploadSources,
} from "../../src/state/intelligenceAdapter";
const badFiles = {
  "employees.json": "{",
  "events.json": "{}",
  "skills.json": "{}",
  "activity_history.csv": "",
} satisfies UploadSources;
const setup = () => {
  const adapter = fixtureAdapter(),
    dataset = fixtureDataset(),
    store = createEmployeeStore(adapter);
  store.getState().loadDataset(dataset);
  return { adapter, dataset, store };
};
describe("simulation and store", () => {
  it("the production bridge delegates import, ranking and progress to injected A bindings", async () => {
    const dataset = fixtureDataset();
    const fixture = fixtureAdapter();
    const result = fixture.evaluate({
      dataset,
      employeeId: "E0028",
      ledger: [],
    });
    const importer = vi.fn(() => dataset);
    const recommend = vi.fn(() => result);
    const progress = vi.fn((source: typeof dataset) => source);
    const adapter = createIntelligenceAdapter({
      importCareerQuestDataset: importer,
      recommendForEmployee: recommend,
      datasetView: (source) => source,
      employeeView: (top) => top,
      withProgress: progress,
      validationIssues: () => [],
    });
    const imported = await adapter.importFiles(badFiles);
    expect(importer).toHaveBeenCalledWith({
      employees: "{",
      events: "{}",
      skills: "{}",
      activityHistoryCsv: "",
    });
    if (!imported.ok) throw new Error("Expected test import to pass");
    adapter.evaluate({
      dataset: imported.dataset,
      employeeId: "E0028",
      ledger: [],
    });
    expect(progress).toHaveBeenCalledOnce();
    expect(recommend).toHaveBeenNthCalledWith(1, dataset, "E0028", 3);
    expect(recommend).toHaveBeenNthCalledWith(
      2,
      dataset,
      "E0028",
      dataset.activities.length,
    );
  });
  it("caps gains at max_level and 5, and never lowers an existing skill", () => {
    const activity = fixtureDataset().activities[0];
    expect(
      applyGains({ SK_SYSTEM_DESIGN: 3.5 }, activity).after.SK_SYSTEM_DESIGN,
    ).toBe(4);
    expect(
      applyGains({ SK_SYSTEM_DESIGN: 5 }, activity).after.SK_SYSTEM_DESIGN,
    ).toBe(5);
    expect(() => applyGains({ SK_SYSTEM_DESIGN: NaN }, activity)).toThrow();
  });
  it("what-if leaves uploaded objects, dataset, ledger and current view unchanged", () => {
    const { store, dataset } = setup();
    const original = JSON.stringify(dataset),
      state = store.getState();
    state.previewActivity("MENTOR");
    expect(store.getState().dataset).toBe(state.dataset);
    expect(store.getState().views).toBe(state.views);
    expect(store.getState().ledger).toBe(state.ledger);
    expect(JSON.stringify(dataset)).toBe(original);
    expect(store.getState().simulation?.step.after.SK_SYSTEM_DESIGN).toBe(4);
    expect(store.getState().views.E0028.effectiveSkills.SK_SYSTEM_DESIGN).toBe(
      3,
    );
  });
  it("confirm appends exactly one frozen event and reranks for the common HR selectors", () => {
    const { store } = setup();
    const oldView = store.getState().views.E0028;
    let notifications = 0;
    const unsubscribe = store.subscribe((next, old) => {
      if (next.views !== old.views) notifications++;
    });
    store.getState().previewActivity("MENTOR");
    const id = store.getState().simulation!.requestId;
    expect(store.getState().confirmCompletion(id)).toBe(true);
    expect(store.getState().confirmCompletion(id)).toBe(false);
    const { ledger, views } = store.getState();
    expect(ledger).toHaveLength(1);
    expect(Object.isFrozen(ledger[0].after)).toBe(true);
    expect(ledger[0]).toMatchObject({
      before: { SK_SYSTEM_DESIGN: 3 },
      after: { SK_SYSTEM_DESIGN: 4 },
      delta: { SK_SYSTEM_DESIGN: 1 },
      effectiveDate: "2026-10-01",
    });
    expect(views.E0028.readiness).toBeGreaterThan(oldView.readiness!);
    expect(
      views.E0028.recommendations.some((r) => r.activityId === "MENTOR"),
    ).toBe(false);
    expect(notifications).toBe(1);
    unsubscribe();
  });
  it("failed recompute rolls back dataset, ledger and all views atomically", () => {
    const base = fixtureAdapter();
    const adapter: IntelligenceAdapter = {
      ...base,
      evaluate(input) {
        if (input.ledger.length) throw new Error("recompute failed");
        return base.evaluate(input);
      },
    };
    const store = createEmployeeStore(adapter);
    store.getState().loadDataset(fixtureDataset());
    store.getState().previewActivity("MENTOR");
    const old = store.getState();
    expect(old.confirmCompletion(old.simulation!.requestId)).toBe(false);
    expect(store.getState().ledger).toBe(old.ledger);
    expect(store.getState().views).toBe(old.views);
    expect(store.getState().error).toBe("recompute failed");
  });
  it("rejects an adapter that ignores committed gains", () => {
    const base = fixtureAdapter();
    const adapter: IntelligenceAdapter = {
      ...base,
      evaluate(input) {
        return base.evaluate({ ...input, ledger: [] });
      },
    };
    const store = createEmployeeStore(adapter);
    store.getState().loadDataset(fixtureDataset());
    store.getState().previewActivity("MENTOR");
    expect(
      store
        .getState()
        .confirmCompletion(store.getState().simulation!.requestId),
    ).toBe(false);
    expect(store.getState().ledger).toHaveLength(0);
  });
  it("cancels stale previews after employee selection or new import", () => {
    const { store, dataset } = setup();
    store.getState().previewActivity("MENTOR");
    const request = store.getState().simulation!.requestId;
    store.getState().selectEmployee("NO_HISTORY");
    expect(store.getState().confirmCompletion(request)).toBe(false);
    store.getState().loadDataset(dataset);
    expect(store.getState().confirmCompletion(request)).toBe(false);
  });
  it("invalid upload preserves the previous usable dataset and presents issues", async () => {
    const { store } = setup();
    const previous = store.getState().dataset;
    expect(await store.getState().importFiles(badFiles)).toBe(false);
    expect(store.getState().dataset).toBe(previous);
    expect(store.getState().issues[0].severity).toBe("error");
    expect(store.getState().status).toBe("ready");
  });
  it("an older async import cannot overwrite a newer successful import", async () => {
    let resolve: (
      value: Awaited<ReturnType<IntelligenceAdapter["importFiles"]>>,
    ) => void = () => {};
    const adapter = fixtureAdapter();
    adapter.importFiles = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<IntelligenceAdapter["importFiles"]>>>(
          (r) => {
            resolve = r;
          },
        ),
    );
    const store = createEmployeeStore(adapter);
    const first = store.getState().importFiles(badFiles);
    const newer = { ...fixtureDataset(), id: "newer" };
    store.getState().loadDataset(newer);
    resolve({ ok: true, dataset: fixtureDataset(), issues: [] });
    await first;
    expect(store.getState().dataset?.id).toBe("newer");
  });
  it("missing history and no target are valid empty states", () => {
    const { adapter, dataset, store } = setup();
    store.getState().selectEmployee("NO_HISTORY");
    expect(store.getState().views.NO_HISTORY.replayedActivityIds).toEqual([]);
    expect(
      planCareerPath(adapter, { dataset, employeeId: "NO_TARGET", ledger: [] })
        .reason,
    ).toBe("no-target");
  });
  it("the planner is deterministic, bounded by 4 and never repeats a completed non-recurring event", () => {
    const { adapter, dataset } = setup();
    const input = { dataset, employeeId: "E0028", ledger: [] };
    for (const strategy of ["fastest", "balanced", "stretch"] as const) {
      const path = planCareerPath(adapter, input, strategy, {
        depth: 99,
        beamWidth: 99,
      });
      expect(path).toEqual(
        planCareerPath(adapter, input, strategy, { depth: 99, beamWidth: 99 }),
      );
      expect(path.steps.length).toBeLessThanOrEqual(4);
      expect(path.steps.some((s) => s.activityId === "EV_006")).toBe(false);
      const ids = path.steps
        .filter((s) => s.activityId !== "EV_036")
        .map((s) => s.activityId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(
        path.steps.some((s) => ["ACTIVE", "MANDATORY"].includes(s.activityId)),
      ).toBe(false);
    }
  });
  it("recurring events can occur again while they still have a positive gain", () => {
    const { adapter } = setup();
    const raw = fixtureDataset();
    const dataset = {
      ...raw,
      activities: raw.activities.filter((a) => a.id === "EV_036"),
      history: [
        ...raw.history,
        {
          employeeId: "E0028",
          activityId: "EV_036",
          date: "2026-09-29",
          status: "completed",
        },
      ],
    };
    const path = planCareerPath(
      adapter,
      { dataset, employeeId: "E0028", ledger: [] },
      "stretch",
    );
    expect(path.steps).toHaveLength(4);
    expect(path.steps.every((s) => s.activityId === "EV_036")).toBe(true);
  });
  it("fastest returns a shortest discovered path to the threshold", () => {
    const { adapter, dataset } = setup();
    const result = planCareerPath(
      adapter,
      { dataset, employeeId: "E0028", ledger: [] },
      "fastest",
      { readinessThreshold: 0.8 },
    );
    expect(result.steps).toHaveLength(1);
    expect(result.reachedTarget).toBe(true);
  });
  it("empty candidates lead to an honest empty plan", () => {
    const { adapter, dataset } = setup();
    expect(
      planCareerPath(adapter, {
        dataset: { ...dataset, activities: [] },
        employeeId: "E0028",
        ledger: [],
      }).reason,
    ).toBe("no-candidates");
  });
  it("upcoming sessions are selected relative to snapshot, not local time", () => {
    const event = fixtureDataset().activities.find((a) => a.id === "CLOUD")!;
    expect(nearestSession(event, "2026-10-01")).toBe("2026-10-04");
    expect(
      nearestSession(
        { ...event, upcomingSessions: ["bad", "2026-09-01"] },
        "2026-10-01",
      ),
    ).toBeNull();
  });
  it("simulation refuses already completed, active or mandatory events", () => {
    const { adapter, dataset } = setup();
    for (const activityId of ["EV_006", "ACTIVE", "MANDATORY"])
      expect(() =>
        simulateStep(
          adapter,
          { dataset, employeeId: "E0028", ledger: [] },
          activityId,
        ),
      ).toThrow();
  });
});
