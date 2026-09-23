"use client";

import { useEffect } from "react";

import type { NormalizedDataset } from "@/lib/contracts";
import {
  ensureCompletionLedgerHydrated,
  useCareerQuestStore,
} from "@/state/career-quest-store";

export interface ActiveDatasetState {
  dataset: NormalizedDataset;
  sourceLabel: string;
  hydrationStatus: "loading" | "ready" | "unavailable";
  ignoredLedgerEntries: number;
}

/**
 * Initializes the shared B-owned store only on a direct route load. Client navigation keeps
 * the current imported or already-mutated dataset intact instead of replacing it with bundled data.
 */
export function useActiveCareerQuestDataset(
  initialDataset: NormalizedDataset,
): ActiveDatasetState {
  const storedDataset = useCareerQuestStore((state) => state.dataset);
  const source = useCareerQuestStore((state) => state.source);
  const ledgerHydrationStatus = useCareerQuestStore((state) => state.ledgerHydrationStatus);
  const ignoredLedgerEntries = useCareerQuestStore((state) => state.ignoredLedgerEntries);
  const initializeDataset = useCareerQuestStore((state) => state.initializeDataset);
  const replaceDataset = useCareerQuestStore((state) => state.replaceDataset);

  useEffect(() => {
    if (source?.kind === "employee-view") {
      replaceDataset(initialDataset, { kind: "bundled", label: initialDataset.meta.dataset });
    } else {
      initializeDataset(initialDataset);
    }
    void ensureCompletionLedgerHydrated(initialDataset).catch(() => {
      // The store exposes the unavailable state while the deterministic snapshot stays usable.
    });
  }, [initialDataset, initializeDataset, replaceDataset, source?.kind]);

  const hydrationStatus: ActiveDatasetState["hydrationStatus"] =
    ledgerHydrationStatus === "ready" || ledgerHydrationStatus === "unavailable"
      ? ledgerHydrationStatus
      : "loading";

  return {
    dataset: storedDataset ?? initialDataset,
    sourceLabel: source?.label ?? initialDataset.meta.dataset,
    hydrationStatus,
    ignoredLedgerEntries: ignoredLedgerEntries.length,
  };
}
