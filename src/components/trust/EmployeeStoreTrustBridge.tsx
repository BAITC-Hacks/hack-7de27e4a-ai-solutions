"use client";
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { catalogName } from "@/lib/i18n/domain";
import {
  normalizedSource,
  projectEmployeeStore,
  type EmployeeStoreSnapshot,
} from "../../domain/analytics/store-adapter";
import {
  buildHrExternalLearningPlan,
  loadExternalCourseCatalog,
  type HrExternalLearningPlan,
} from "../../domain/external";
import { FACTORS, type Factor } from "../../lib/evaluation/ai-contracts";
import { buildReviewRequest } from "../../lib/evaluation/explanations";
import type { EvaluationCase } from "../../lib/evaluation/harness";
import { createDatasetAuditCases } from "../../lib/evaluation/dataset-audit";
import { TrustIntegrationProvider, type TrustIntegration } from "./integration";

import type { AgentSnapshot } from "../../lib/evaluation/agent-tools";

export interface EmployeeStorePort {
  getState(): EmployeeStoreSnapshot;
  subscribe(listener: () => void): () => void;
}
/** Place under the existing EmployeeStoreProvider and pass its SAME store instance. */
export function EmployeeStoreTrustBridge({
  store,
  access,
  coreEvaluationCases,
  children,
}: {
  store: EmployeeStorePort;
  access: "hr" | "employee";
  coreEvaluationCases?: readonly EvaluationCase[];
  children: ReactNode;
}) {
  const { locale, t } = useI18n();
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  const externalLearningPlan = useMemo<HrExternalLearningPlan | null>(() => {
    if (access !== "hr") return null;
    const dataset = snapshot.normalizedDataset ?? normalizedSource(snapshot);
    if (!dataset) return null;
    try {
      return buildHrExternalLearningPlan(
        dataset,
        loadExternalCourseCatalog(dataset),
      );
    } catch {
      // The external catalog is optional. A judge dataset with another taxonomy must
      // not take down HR analytics, Trust or the internal recommendation surface.
      return null;
    }
  }, [access, snapshot]);
  const value = useMemo<TrustIntegration>(() => {
    if (access !== "hr") return { access, state: "ready", analytics: null };
    try {
      const analytics = projectEmployeeStore(snapshot);
      const selected = snapshot.selectedEmployeeId
        ? snapshot.views[snapshot.selectedEmployeeId]
        : undefined;
      const employee = analytics?.employees.find(
        (e) => e.employeeId === snapshot.selectedEmployeeId,
      );
      const source = normalizedSource(snapshot);
      const reviewRequest = selected
        ? buildReviewRequest(
            selected.recommendations.map((rec) => ({
              activityId: rec.activityId,
              factorScores: Object.fromEntries(
                FACTORS.map((f) => [f, rec.factorScores[f]]),
              ) as Record<Factor, number>,
            })),
            locale,
          )
        : undefined;
      return {
        access,
        analytics,
        externalLearningPlan,
        state:
          snapshot.status === "loading"
            ? "loading"
            : snapshot.status === "error"
              ? "invalid"
              : "ready",
        challenge: employee
          ? {
              label: `${catalogName(employee.role, locale)} · ${catalogName(employee.grade, locale)} → ${employee.target ? `${catalogName(employee.target.role, locale)} · ${catalogName(employee.target.grade, locale)}` : t("Цель не задана", "Мақсат белгіленбеген", "No target")}`,
              employee,
            }
          : undefined,
        reviewRequest,
        agentSnapshot: snapshot.normalizedDataset && snapshot.dataset &&
          "employees" in snapshot.dataset && "activities" in snapshot.dataset
          ? snapshot as AgentSnapshot : undefined,
        coreEvaluationCases:
          coreEvaluationCases ??
          (source
            ? createDatasetAuditCases(snapshot.normalizedDataset ?? source)
            : undefined),
        versions: selected
          ? {
              engine: selected.engineVersion,
              weights: "weights-v1",
              adapter: "career-quest-trust-store/1.0.0",
            }
          : undefined,
      };
    } catch {
      return { access, state: "invalid", analytics: null };
    }
  }, [
    snapshot,
    access,
    coreEvaluationCases,
    externalLearningPlan,
    locale,
    t,
  ]);
  return (
    <TrustIntegrationProvider value={value}>
      {children}
    </TrustIntegrationProvider>
  );
}
