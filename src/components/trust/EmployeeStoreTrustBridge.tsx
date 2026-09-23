'use client';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { normalizedSource, projectEmployeeStore, type EmployeeStoreSnapshot } from '../../domain/analytics/store-adapter';
import { FACTORS, type Factor } from '../../lib/evaluation/ai-contracts';
import { buildReviewRequest } from '../../lib/evaluation/explanations';
import type { EvaluationCase } from '../../lib/evaluation/harness';
import { createDatasetAuditCases } from '../../lib/evaluation/dataset-audit';
import { TrustIntegrationProvider, type TrustIntegration } from './integration';

export interface EmployeeStorePort {
  getState(): EmployeeStoreSnapshot;
  subscribe(listener: () => void): () => void;
}
/** Place under the existing EmployeeStoreProvider and pass its SAME store instance. */
export function EmployeeStoreTrustBridge({ store, access, coreEvaluationCases, children }: {
  store: EmployeeStorePort; access: 'hr' | 'employee'; coreEvaluationCases?: readonly EvaluationCase[]; children: ReactNode;
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const value = useMemo<TrustIntegration>(() => {
    if (access !== 'hr') return { access, state: 'ready', analytics: null };
    try {
      const analytics = projectEmployeeStore(snapshot);
      const selected = snapshot.selectedEmployeeId ? snapshot.views[snapshot.selectedEmployeeId] : undefined;
      const employee = analytics?.employees.find(e => e.employeeId === snapshot.selectedEmployeeId);
      const source = normalizedSource(snapshot);
      const language = employee && source ? source.employeesById[employee.employeeId].preferredLanguage : 'ru';
      const reviewRequest = selected ? buildReviewRequest(selected.recommendations.map(rec => ({ activityId: rec.activityId, factorScores: Object.fromEntries(FACTORS.map(f => [f, rec.factorScores[f]])) as Record<Factor, number> })), language) : undefined;
      return { access, analytics, state: snapshot.status === 'loading' ? 'loading' : snapshot.status === 'error' ? 'invalid' : 'ready',
        challenge: employee ? { label: `${employee.role} · ${employee.grade} → ${employee.target?.grade ?? 'Цель не задана'}`, employee } : undefined,
        reviewRequest, coreEvaluationCases: coreEvaluationCases ?? (source ? createDatasetAuditCases(source) : undefined),
        versions: selected ? { engine: selected.engineVersion, weights: 'weights-v1', adapter: 'career-quest-trust-store/1.0.0' } : undefined };
    } catch { return { access, state: 'invalid', analytics: null }; }
  }, [snapshot, access, coreEvaluationCases]);
  return <TrustIntegrationProvider value={value}>{children}</TrustIntegrationProvider>;
}
