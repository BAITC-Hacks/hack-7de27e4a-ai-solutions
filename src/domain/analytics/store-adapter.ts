import type { NormalizedDataset } from '@/lib/contracts';
import type { AnalyticsInput, CandidateImpact, EmployeeAnalytics, SkillGap } from './types';
import { projectCoreHistory } from './core-adapter';

/** Structural read-only subset of B's EmployeeState; accepts its store without owning/copying it. */
export interface EmployeeStoreSnapshot {
  dataset: { source?: unknown } | null;
  selectedEmployeeId: string | null;
  status: 'empty' | 'loading' | 'ready' | 'error';
  views: Readonly<Record<string, {
    employeeId: string; target: { role: string; grade: string } | null;
    effectiveSkills: Readonly<Record<string, number>>; readiness: number | null;
    gaps: readonly SkillGap[]; engineVersion: string;
    recommendations: readonly StoreRecommendation[]; candidates: readonly StoreRecommendation[];
  }>>;
  ledger: readonly { id: string; employeeId: string; activityId: string }[];
}
export interface StoreRecommendation {
  activityId: string; expectedGains: Readonly<Record<string, number>>; projectedReadiness: number;
  factorScores: Readonly<Record<string, number>>;
}
export function normalizedSource(state: EmployeeStoreSnapshot): NormalizedDataset | null {
  const source = state.dataset?.source;
  if (!source || typeof source !== 'object' || !('employeesById' in source) || !('eventsById' in source) || !('history' in source) || !('meta' in source)) return null;
  return source as NormalizedDataset;
}
/** Uses B's recomputed views, never replays the original source over confirmed session progress. */
export function projectEmployeeStore(state: EmployeeStoreSnapshot): AnalyticsInput | null {
  const source = normalizedSource(state);
  if (!source) return null;
  const impact = (rec: StoreRecommendation): CandidateImpact => ({ activityId: rec.activityId, effectiveGains: rec.expectedGains, projectedReadiness: rec.projectedReadiness });
  const employees: EmployeeAnalytics[] = Object.keys(source.employeesById).sort().map(id => {
    const view = state.views[id];
    if (!view) throw new Error('Missing recomputed employee view');
    const employee = source.employeesById[id];
    return { employeeId: id, role: employee.role, grade: employee.grade, target: view.target,
      effectiveSkills: view.effectiveSkills, readiness: view.readiness ?? 0, gaps: view.gaps,
      recommendations: view.recommendations.map(impact), eligibleCandidates: view.candidates.map(impact) };
  });
  const history = projectCoreHistory(source);
  const seen = new Set<string>();
  for (const completion of state.ledger) {
    if (seen.has(completion.id)) throw new Error('Duplicate completion ledger ID');
    seen.add(completion.id);
    const event = source.eventsById[completion.activityId];
    if (!event || !source.employeesById[completion.employeeId]) throw new Error('Unknown ledger reference');
    history.push({ employeeId: completion.employeeId, activityId: completion.activityId, status: 'completed', assignedBy: 'self', mandatory: event.mandatory });
  }
  return { employees, history };
}
