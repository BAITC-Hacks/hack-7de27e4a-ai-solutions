import type { NormalizedDataset, RecommendationResult } from '@/lib/contracts';
import { recommendForEmployee } from '@/domain/recommendation';
import type { AnalyticsInput, CandidateImpact, EmployeeAnalytics, Participation } from './types';

export function projectCoreEmployee(dataset: NormalizedDataset, employeeId: string, current?: RecommendationResult): EmployeeAnalytics {
  const result = current ?? recommendForEmployee(dataset, employeeId);
  const all = recommendForEmployee(dataset, employeeId, Object.keys(dataset.eventsById).length);
  const employee = result.effectiveProfile.employee;
  const impact = (rec: RecommendationResult['recommendations'][number]): CandidateImpact => ({ activityId: rec.activityId, effectiveGains: rec.effectiveGains, projectedReadiness: rec.projectedReadiness });
  return { employeeId, role: employee.role, grade: employee.grade,
    target: result.gapAnalysis.target ? { role: result.gapAnalysis.target.role, grade: result.gapAnalysis.target.grade } : null,
    readiness: result.gapAnalysis.readiness, effectiveSkills: result.effectiveProfile.effectiveSkills,
    gaps: result.gapAnalysis.gaps.map(g => ({ skillId: g.skillId, current: g.currentLevel, required: g.requiredLevel, critical: g.critical })),
    recommendations: result.recommendations.map(impact), eligibleCandidates: all.recommendations.map(impact) };
}
export function projectCoreHistory(dataset: NormalizedDataset): Participation[] {
  return dataset.history.map(row => {
    const event = dataset.eventsById[row.eventId];
    if (!event) throw new Error('Unknown event in normalized history');
    return { employeeId: row.employeeId, activityId: row.eventId, status: row.status, assignedBy: row.assignedBy, mandatory: event.mandatory };
  });
}
/** For imported snapshots/evaluations. Live HR after completion must use projectEmployeeStore instead. */
export function projectCoreAnalytics(dataset: NormalizedDataset): AnalyticsInput {
  return { employees: Object.keys(dataset.employeesById).sort().map(id => projectCoreEmployee(dataset, id)), history: projectCoreHistory(dataset) };
}
