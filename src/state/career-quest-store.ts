import { create } from "zustand";

import {
  applyActivityCompletion,
  type ActivityCompletionResult,
} from "@/domain/simulation";
import type { NormalizedDataset } from "@/lib/contracts";

import {
  createDatasetFingerprint,
  loadCompletionLedger,
  type PersistedCompletion,
} from "./progress-ledger";

export interface DatasetSource {
  kind: "bundled" | "imported" | "employee-view";
  label: string;
}

export interface LedgerHydrationResult {
  dataset: NormalizedDataset;
  datasetFingerprint: string;
  appliedEntries: PersistedCompletion[];
  ignoredEntries: PersistedCompletion[];
}

export function replayCompletionLedger(
  baseDataset: NormalizedDataset,
  entries: PersistedCompletion[],
  datasetFingerprint = createDatasetFingerprint(baseDataset),
): LedgerHydrationResult {
  let dataset = baseDataset;
  const appliedEntries: PersistedCompletion[] = [];
  const ignoredEntries: PersistedCompletion[] = [];

  [...entries]
    .sort(
      (left, right) =>
        left.completedAt.localeCompare(right.completedAt) || left.id.localeCompare(right.id),
    )
    .forEach((entry) => {
      if (entry.datasetFingerprint !== datasetFingerprint) {
        ignoredEntries.push(entry);
        return;
      }
      const existing = dataset.history.find((record) => record.id === entry.id);
      if (existing) {
        if (
          existing.employeeId === entry.employeeId &&
          existing.eventId === entry.activityId &&
          existing.status === "completed"
        ) {
          appliedEntries.push(entry);
        } else {
          ignoredEntries.push(entry);
        }
        return;
      }
      try {
        dataset = applyActivityCompletion(
          dataset,
          entry.employeeId,
          entry.activityId,
          entry.id,
        ).dataset;
        appliedEntries.push(entry);
      } catch {
        // A ledger can outlive an imported judge dataset. Incompatible entries stay persisted,
        // but never poison the active normalized dataset.
        ignoredEntries.push(entry);
      }
    });

  return { dataset, datasetFingerprint, appliedEntries, ignoredEntries };
}

export type LedgerHydrationStatus = "idle" | "loading" | "ready" | "unavailable";

export interface CareerQuestStoreState {
  dataset: NormalizedDataset | null;
  datasetFingerprint: string | null;
  source: DatasetSource | null;
  ledgerHydrationStatus: LedgerHydrationStatus;
  appliedLedgerEntries: PersistedCompletion[];
  ignoredLedgerEntries: PersistedCompletion[];
  initializeDataset: (dataset: NormalizedDataset) => void;
  replaceDataset: (
    dataset: NormalizedDataset,
    source: DatasetSource,
    datasetFingerprint?: string,
  ) => void;
  hydrateCompletions: (
    baseDataset: NormalizedDataset,
    entries: PersistedCompletion[],
    source?: DatasetSource,
    datasetFingerprint?: string,
  ) => LedgerHydrationResult;
  markLedgerHydrationUnavailable: (datasetFingerprint: string) => void;
  registerCompletionEntry: (entry: PersistedCompletion) => void;
  applyCompletion: (
    employeeId: string,
    activityId: string,
    recordId: string,
  ) => ActivityCompletionResult;
}

export const useCareerQuestStore = create<CareerQuestStoreState>((set, get) => ({
  dataset: null,
  datasetFingerprint: null,
  source: null,
  ledgerHydrationStatus: "idle",
  appliedLedgerEntries: [],
  ignoredLedgerEntries: [],
  initializeDataset: (dataset) => {
    if (get().dataset) return;
    set({
      dataset,
      datasetFingerprint: createDatasetFingerprint(dataset),
      source: { kind: "bundled", label: dataset.meta.dataset },
      ledgerHydrationStatus: "idle",
      appliedLedgerEntries: [],
      ignoredLedgerEntries: [],
    });
  },
  replaceDataset: (dataset, source, datasetFingerprint) => set({
    dataset,
    datasetFingerprint: datasetFingerprint ?? createDatasetFingerprint(dataset),
    source,
    ledgerHydrationStatus: "idle",
    appliedLedgerEntries: [],
    ignoredLedgerEntries: [],
  }),
  hydrateCompletions: (baseDataset, entries, source, requestedFingerprint) => {
    const current = get();
    const datasetFingerprint =
      requestedFingerprint ??
      (current.dataset === baseDataset ? current.datasetFingerprint : null) ??
      createDatasetFingerprint(baseDataset);
    const hydration = replayCompletionLedger(baseDataset, entries, datasetFingerprint);
    set({
      dataset: hydration.dataset,
      datasetFingerprint,
      source: source ?? get().source ?? { kind: "bundled", label: baseDataset.meta.dataset },
      ledgerHydrationStatus: "ready",
      appliedLedgerEntries: hydration.appliedEntries,
      ignoredLedgerEntries: hydration.ignoredEntries,
    });
    return hydration;
  },
  markLedgerHydrationUnavailable: (datasetFingerprint) => {
    if (get().datasetFingerprint === datasetFingerprint) {
      set({ ledgerHydrationStatus: "unavailable" });
    }
  },
  registerCompletionEntry: (entry) => {
    if (entry.datasetFingerprint !== get().datasetFingerprint) {
      throw new Error("Completion belongs to a different dataset");
    }
    if (get().appliedLedgerEntries.some((existing) => existing.id === entry.id)) return;
    set({
      appliedLedgerEntries: [...get().appliedLedgerEntries, entry].sort(
        (left, right) =>
          left.completedAt.localeCompare(right.completedAt) || left.id.localeCompare(right.id),
      ),
    });
  },
  applyCompletion: (employeeId, activityId, recordId) => {
    const dataset = get().dataset;
    if (!dataset) throw new Error("Career Quest dataset is not initialized");
    const result = applyActivityCompletion(dataset, employeeId, activityId, recordId);
    set({ dataset: result.dataset });
    return result;
  },
}));

export function getCareerQuestStoreState() {
  return useCareerQuestStore.getState();
}

type CompletionLedgerLoader = () => Promise<PersistedCompletion[]>;

const hydrationPromises = new Map<string, Promise<LedgerHydrationResult>>();

function currentHydrationResult(state: CareerQuestStoreState): LedgerHydrationResult {
  if (!state.dataset || !state.datasetFingerprint) {
    throw new Error("Career Quest dataset is not initialized");
  }
  return {
    dataset: state.dataset,
    datasetFingerprint: state.datasetFingerprint,
    appliedEntries: state.appliedLedgerEntries,
    ignoredEntries: state.ignoredLedgerEntries,
  };
}

/**
 * One hydration task is shared by every route for the active dataset. Component unmounts never
 * cancel it, so a fast HR -> Trust transition cannot strand an initialized-but-unhydrated store.
 */
export function ensureCompletionLedgerHydrated(
  initialDataset: NormalizedDataset,
  source?: DatasetSource,
  loadEntries: CompletionLedgerLoader = loadCompletionLedger,
): Promise<LedgerHydrationResult> {
  getCareerQuestStoreState().initializeDataset(initialDataset);
  const initialState = getCareerQuestStoreState();
  if (!initialState.dataset || !initialState.datasetFingerprint) {
    return Promise.reject(new Error("Career Quest dataset is not initialized"));
  }

  const datasetFingerprint = initialState.datasetFingerprint;
  if (initialState.ledgerHydrationStatus === "ready") {
    return Promise.resolve(currentHydrationResult(initialState));
  }

  const pending = hydrationPromises.get(datasetFingerprint);
  if (pending) return pending;

  useCareerQuestStore.setState({ ledgerHydrationStatus: "loading" });
  let hydrationPromise: Promise<LedgerHydrationResult>;
  hydrationPromise = Promise.resolve()
    .then(loadEntries)
    .then((entries) => {
      const current = getCareerQuestStoreState();
      if (
        !current.dataset ||
        !current.datasetFingerprint ||
        current.datasetFingerprint !== datasetFingerprint
      ) {
        return currentHydrationResult(current);
      }
      return current.hydrateCompletions(
        current.dataset,
        entries,
        current.source ?? source,
        datasetFingerprint,
      );
    })
    .catch((error: unknown) => {
      const current = getCareerQuestStoreState();
      if (current.datasetFingerprint !== datasetFingerprint) {
        return currentHydrationResult(current);
      }
      current.markLedgerHydrationUnavailable(datasetFingerprint);
      throw error;
    })
    .finally(() => {
      if (hydrationPromises.get(datasetFingerprint) === hydrationPromise) {
        hydrationPromises.delete(datasetFingerprint);
      }
    });
  hydrationPromises.set(datasetFingerprint, hydrationPromise);
  return hydrationPromise;
}
