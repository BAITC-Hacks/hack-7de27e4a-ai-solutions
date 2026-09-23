'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { AnalyticsInput, EmployeeAnalytics } from '../../domain/analytics/types';
import type { HrExternalLearningPlan } from '../../domain/external';
import type { EvaluationCase } from '../../lib/evaluation/harness';
import type { ReviewRequest } from '../../lib/evaluation/ai-contracts';

export interface TrustIntegration {
  /** UI access must come from the host session; this is not an authentication implementation. */
  access: 'hr' | 'employee';
  state: 'loading' | 'ready' | 'invalid';
  analytics: AnalyticsInput | null;
  /** Aggregate-only view of external learning demand; raw employee data is not exposed. */
  externalLearningPlan?: HrExternalLearningPlan | null;
  /** Selected challenge only. No employee directory/leaderboard is exposed by C. */
  challenge?: { label: string; employee: EmployeeAnalytics };
  reviewRequest?: ReviewRequest;
  coreEvaluationCases?: readonly EvaluationCase[];
  versions?: { engine: string; weights: string; adapter: string };
}
const IntegrationContext = createContext<TrustIntegration | null>(null);
/** B renders this around all routes from its existing Zustand subscription. No second store. */
export function TrustIntegrationProvider({ value, children }: { value: TrustIntegration; children: ReactNode }) {
  return <IntegrationContext.Provider value={value}>{children}</IntegrationContext.Provider>;
}
export const useTrustIntegration = () => useContext(IntegrationContext);
