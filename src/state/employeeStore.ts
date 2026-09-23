import { createStore } from "zustand/vanilla";
import type { NormalizedDataset } from "@/lib/contracts";
import {
  adapterUnavailable,
  type Dataset,
  type EmployeeView,
  type ImportIssue,
  type IntelligenceAdapter,
  type LedgerEvent,
  type UploadSources,
} from "./intelligenceAdapter";
import { appendCompletion, freezeDeep } from "../domain/simulation/ledger";
import {
  simulateStep,
  type SimulationStep,
} from "../domain/simulation/simulator";
import {
  planCareerPath,
  type CareerPath,
  type PathStrategy,
} from "../domain/simulation/planner";

type Preview = Readonly<{
  requestId: string;
  revision: number;
  employeeId: string;
  step: SimulationStep;
}>;
export type EmployeeState = {
  dataset: Dataset | null;
  normalizedDataset: NormalizedDataset | null;
  selectedEmployeeId: string | null;
  ledger: readonly LedgerEvent[];
  views: Readonly<Record<string, EmployeeView>>;
  simulation: Preview | null;
  path: CareerPath | null;
  strategy: PathStrategy;
  status: "empty" | "loading" | "ready" | "error";
  issues: readonly ImportIssue[];
  error: string | null;
  notice: string | null;
  revision: number;
  adapterReady: boolean;
  connect: (adapter: IntelligenceAdapter) => void;
  loadDataset: (dataset: Dataset) => boolean;
  importFiles: (sources: UploadSources) => Promise<boolean>;
  selectEmployee: (id: string) => void;
  previewActivity: (activityId: string) => void;
  cancelPreview: () => void;
  confirmCompletion: (requestId: string) => boolean;
  plan: (strategy?: PathStrategy) => void;
  clearError: () => void;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Не удалось выполнить действие";
export function createEmployeeStore(
  initialAdapter?: IntelligenceAdapter,
  now?: () => string,
) {
  let adapter = initialAdapter ?? adapterUnavailable;
  let generation = 0;
  let sequence = 0;
  const evaluateAll = (dataset: Dataset, ledger: readonly LedgerEvent[]) =>
    Object.fromEntries(
      dataset.employees.map((employee) => [
        employee.id,
        freezeDeep(
          adapter.evaluate({ dataset, employeeId: employee.id, ledger }),
        ),
      ]),
    );
  return createStore<EmployeeState>((set, get) => ({
    dataset: null,
    normalizedDataset: null,
    selectedEmployeeId: null,
    ledger: [],
    views: {},
    simulation: null,
    path: null,
    strategy: "balanced",
    status: "empty",
    issues: [],
    error: null,
    notice: null,
    revision: 0,
    adapterReady: !!initialAdapter,
    connect(next) {
      const previous = adapter;
      adapter = next;
      try {
        const state = get();
        const views = state.dataset
          ? evaluateAll(state.dataset, state.ledger)
          : {};
        generation++;
        set({
          views,
          normalizedDataset:
            state.dataset && adapter.normalizedState
              ? freezeDeep(adapter.normalizedState(state.dataset, state.ledger))
              : null,
          adapterReady: true,
          simulation: null,
          path: null,
          error: null,
          status: state.dataset ? "ready" : "empty",
          revision: state.revision + 1,
        });
      } catch (error) {
        adapter = previous;
        set({ error: errorMessage(error) });
      }
    },
    loadDataset(raw) {
      generation++;
      try {
        const dataset = freezeDeep(structuredClone(raw));
        const views = evaluateAll(dataset, []);
        set({
          dataset,
          normalizedDataset: adapter.normalizedState
            ? freezeDeep(adapter.normalizedState(dataset, []))
            : null,
          views,
          selectedEmployeeId: dataset.employees[0]?.id ?? null,
          ledger: freezeDeep([]),
          simulation: null,
          path: null,
          status: "ready",
          issues: [],
          error: null,
          notice:
            "Данные загружены. Изменения сохраняются только в текущей сессии.",
          revision: get().revision + 1,
        });
        return true;
      } catch (error) {
        set({
          status: get().dataset ? "ready" : "error",
          error: errorMessage(error),
        });
        return false;
      }
    },
    async importFiles(sources) {
      const ticket = ++generation;
      set({
        status: "loading",
        error: null,
        issues: [],
        simulation: null,
        path: null,
        notice: null,
      });
      try {
        const result = await adapter.importFiles(sources);
        if (ticket !== generation) return false;
        if (!result.ok) {
          set({
            status: get().dataset ? "ready" : "error",
            issues: result.issues,
          });
          return false;
        }
        const loaded = get().loadDataset(result.dataset);
        if (loaded) set({ issues: result.issues });
        return loaded;
      } catch (error) {
        if (ticket === generation)
          set({
            status: get().dataset ? "ready" : "error",
            error: errorMessage(error),
          });
        return false;
      }
    },
    selectEmployee(id) {
      if (
        get().status === "loading" ||
        !get().dataset?.employees.some((e) => e.id === id)
      )
        return;
      set({
        selectedEmployeeId: id,
        simulation: null,
        path: null,
        error: null,
        notice: null,
      });
    },
    previewActivity(activityId) {
      const state = get();
      if (
        !state.dataset ||
        !state.selectedEmployeeId ||
        state.status === "loading"
      )
        return;
      try {
        const step = freezeDeep(
          simulateStep(
            adapter,
            {
              dataset: state.dataset,
              employeeId: state.selectedEmployeeId,
              ledger: state.ledger,
            },
            activityId,
          ),
        );
        const requestId = `${state.dataset.id}:${state.revision}:${++sequence}`;
        set({
          simulation: {
            requestId,
            revision: state.revision,
            employeeId: state.selectedEmployeeId,
            step,
          },
          error: null,
          notice: null,
        });
      } catch (error) {
        set({ simulation: null, error: errorMessage(error) });
      }
    },
    cancelPreview() {
      set({ simulation: null });
    },
    confirmCompletion(requestId) {
      const state = get();
      if (state.ledger.some((event) => event.requestId === requestId))
        return false;
      const preview = state.simulation;
      if (
        !state.dataset ||
        state.status === "loading" ||
        !preview ||
        preview.requestId !== requestId ||
        preview.revision !== state.revision ||
        preview.employeeId !== state.selectedEmployeeId
      )
        return false;
      try {
        // Recheck eligibility against the current engine and commit all derived views atomically.
        const step = simulateStep(
          adapter,
          {
            dataset: state.dataset,
            employeeId: preview.employeeId,
            ledger: state.ledger,
          },
          preview.step.activityId,
        );
        const ledger = appendCompletion(state.ledger, step, {
          requestId,
          datasetId: state.dataset.id,
          employeeId: preview.employeeId,
          completedAt: now?.() ?? `${state.dataset.snapshotDate}T00:00:00.000Z`,
          effectiveDate: state.dataset.snapshotDate,
        });
        const views = evaluateAll(state.dataset, ledger);
        const recomputed = views[preview.employeeId];
        if (
          Object.entries(step.after).some(
            ([id, level]) => recomputed.effectiveSkills[id] !== level,
          )
        )
          throw new Error(
            "Движок не применил журнал завершений. Изменение отменено.",
          );
        set({
          ledger,
          normalizedDataset: adapter.normalizedState
            ? freezeDeep(adapter.normalizedState(state.dataset, ledger))
            : null,
          views,
          simulation: null,
          path: null,
          revision: state.revision + 1,
          error: null,
          notice: "Активность завершена. Навыки и рекомендации пересчитаны.",
        });
        return true;
      } catch (error) {
        set({ error: errorMessage(error) });
        return false;
      }
    },
    plan(strategy = get().strategy) {
      const state = get();
      if (
        !state.dataset ||
        !state.selectedEmployeeId ||
        state.status === "loading"
      )
        return;
      try {
        const path = freezeDeep(
          planCareerPath(
            adapter,
            {
              dataset: state.dataset,
              employeeId: state.selectedEmployeeId,
              ledger: state.ledger,
            },
            strategy,
          ),
        );
        set({ path, strategy, error: null });
      } catch (error) {
        set({ path: null, error: errorMessage(error) });
      }
    },
    clearError() {
      set({ error: null });
    },
  }));
}
export type EmployeeStore = ReturnType<typeof createEmployeeStore>;
/** Selectors for C: subscribe to this SAME store instance, not a second demo dataset. */
export const selectDataset = (state: EmployeeState) => state.dataset;
/** The shared A-contract dataset with committed progress, for direct HR/Trust engine calls. */
export const selectNormalizedDataset = (state: EmployeeState) =>
  state.normalizedDataset;
/** Original imported A payload, when using createIntelligenceAdapter. Display fields are derived views. */
export const selectNormalizedSource = (state: EmployeeState) =>
  state.dataset?.source ?? null;
export const selectLedger = (state: EmployeeState) => state.ledger;
export const selectEmployeeViews = (state: EmployeeState) => state.views;
export const selectCurrentView = (state: EmployeeState) =>
  state.selectedEmployeeId
    ? (state.views[state.selectedEmployeeId] ?? null)
    : null;
