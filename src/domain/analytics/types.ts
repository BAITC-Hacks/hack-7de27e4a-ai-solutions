/** C-owned read model. Build from A's computed results and B's current store, never raw snapshots. */
export type HistoryStatus = 'completed' | 'in_progress' | 'dropped' | 'no_show' | 'declined' | 'overdue';
export type Assignment = 'self' | 'manager' | 'hr';
export interface SkillGap { skillId: string; current: number; required: number; critical: boolean }
export interface CandidateImpact { activityId: string; effectiveGains: Readonly<Record<string, number>>; projectedReadiness: number }
export interface EmployeeAnalytics {
  employeeId: string;
  role: string;
  grade: string;
  target: { role: string; grade: string } | null;
  readiness: number;
  effectiveSkills: Readonly<Record<string, number>>;
  gaps: readonly SkillGap[];
  recommendations: readonly CandidateImpact[];
  /** All currently eligible candidates, before ranking/truncation; supplied by A. */
  eligibleCandidates: readonly CandidateImpact[];
}
export interface Participation {
  employeeId: string; activityId: string; status: HistoryStatus; assignedBy: Assignment; mandatory: boolean;
  /** Preserve source dates; missing dates cannot be assigned to an analysis period. */
  date?: string | null;
  historyId?: string;
}
export interface AnalyticsInput { employees: readonly EmployeeAnalytics[]; history: readonly Participation[]; snapshotDate?: string }
export interface AnalyticsBridge<Dataset> {
  employeeIds(dataset: Dataset): readonly string[];
  employee(dataset: Dataset, id: string): EmployeeAnalytics;
  history(dataset: Dataset): readonly Participation[];
}
/** This projection is ephemeral: do not persist a second dataset/store for HR. */
export function projectAnalytics<Dataset>(dataset: Dataset, bridge: AnalyticsBridge<Dataset>): AnalyticsInput {
  return { employees: bridge.employeeIds(dataset).map(id => bridge.employee(dataset, id)), history: bridge.history(dataset) };
}

export interface GapCell {
  role: string; grade: string; skillId: string; affectedEmployees: number;
  criticalEmployees: number; weightedGap: number;
}
export interface CatalogGap {
  skillId: string; affectedEmployees: number; noAvailableStep: number; needsMultipleSteps: number;
}
export interface ProgramImpact {
  activityId: string; employees: number; weightedGapClosure: number; criticalGapClosure: number;
}
export interface Engagement {
  assignedBy: Assignment; total: number; statuses: Record<HistoryStatus, number>; completionRate: number | null;
}
export interface HRAnalytics {
  totalEmployees: number; employeesWithTarget: number; employeesWithoutTarget: number;
  coveredEmployees: number; noStepEmployees: number; coverage: number | null;
  meanReadiness: number | null; weightedCriticalGap: number;
  gaps: GapCell[]; catalogGaps: CatalogGap[]; programImpact: ProgramImpact[];
  statuses: Record<HistoryStatus, number>; engagement: Engagement[];
  mandatoryStatuses: Record<HistoryStatus, number>;
}
