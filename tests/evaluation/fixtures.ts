import type { AnalyticsInput, EmployeeAnalytics } from '../../src/domain/analytics/types';
import { buildReviewRequest } from '../../src/lib/evaluation/explanations';

/** Synthetic fixture anchored to the documented E0028 trap; not the organizers' dataset. */
export const employee = (): EmployeeAnalytics => ({
  employeeId: 'E0028', role: 'Backend Engineer', grade: 'Middle', target: { role: 'Backend Engineer', grade: 'Senior' }, readiness: 0.6,
  effectiveSkills: { SK_SYSTEM_DESIGN: 3, SK_API_DESIGN: 4, SK_DATA_VIZ: 1, SK_PUBLIC_SPEAKING: 2 },
  gaps: [{ skillId: 'SK_SYSTEM_DESIGN', current: 3, required: 4, critical: true }, { skillId: 'SK_API_DESIGN', current: 4, required: 4, critical: true }],
  recommendations: [{ activityId: 'EV_MENTORING', effectiveGains: { SK_SYSTEM_DESIGN: 1 }, projectedReadiness: 0.8 }],
  eligibleCandidates: [
    { activityId: 'EV_DATA', effectiveGains: { SK_DATA_VIZ: 1 }, projectedReadiness: 0.6 },
    { activityId: 'EV_MENTORING', effectiveGains: { SK_SYSTEM_DESIGN: 1 }, projectedReadiness: 0.8 },
  ],
});
export const dataset = (): AnalyticsInput => ({ employees: [employee(), { ...employee(), employeeId: 'NO_STEP', recommendations: [], eligibleCandidates: [] }, { ...employee(), employeeId: 'LEAD', grade: 'Lead', target: null, gaps: [], recommendations: [], eligibleCandidates: [] }], history: [
  { employeeId: 'E0028', activityId: 'EV_006', status: 'completed', assignedBy: 'self', mandatory: false },
  { employeeId: 'E0028', activityId: 'EV_OTHER', status: 'no_show', assignedBy: 'manager', mandatory: false },
  { employeeId: 'NO_STEP', activityId: 'EV_ACTIVE', status: 'in_progress', assignedBy: 'self', mandatory: false },
  { employeeId: 'E0028', activityId: 'EV_MANDATORY', status: 'overdue', assignedBy: 'hr', mandatory: true },
] });
export const requestFixture = () => buildReviewRequest([{ activityId: 'EV_MENTORING', factorScores: { targetGapImpact: 0.9, engagementFit: 0.6, feasibility: 1, goalAlignment: 0.8, pathDiversity: 0.5 } }], 'kk', {
  EV_MENTORING: [{ id: 'system-design-gain', factor: 'targetGapImpact', kind: 'skill', skillId: 'SK_SYSTEM_DESIGN', current: 3, required: 4, gain: 1, maxLevel: 4, critical: true }],
});
