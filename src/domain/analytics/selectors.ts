import type { AnalyticsInput, Assignment, CatalogGap, GapCell, HRAnalytics, HistoryStatus, ProgramImpact } from './types';

const statuses = (): Record<HistoryStatus, number> => ({ completed: 0, in_progress: 0, dropped: 0, no_show: 0, declined: 0, overdue: 0 });
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** All counts are aggregates. Employee IDs/names never appear in the returned HR view. */
export function selectHRAnalytics(input: AnalyticsInput): HRAnalytics {
  if (new Set(input.employees.map(e => e.employeeId)).size !== input.employees.length) throw new Error('Duplicate employee IDs in analytics projection');
  const knownIds = new Set(input.employees.map(e => e.employeeId));
  const gaps = new Map<string, GapCell>();
  const catalog = new Map<string, CatalogGap>();
  const programs = new Map<string, ProgramImpact>();
  let withTarget = 0, covered = 0, readiness = 0, weightedCriticalGap = 0;
  for (const employee of input.employees) {
    if (!employee.target) continue;
    withTarget++;
    readiness += employee.readiness;
    if (employee.recommendations.length > 0) covered++;
    for (const gap of employee.gaps) {
      const remaining = Math.max(0, gap.required - gap.current);
      if (remaining === 0) continue;
      const weight = gap.critical ? 2 : 1;
      const key = JSON.stringify([employee.target.role, employee.target.grade, gap.skillId]);
      const cell = gaps.get(key) ?? { role: employee.target.role, grade: employee.target.grade, skillId: gap.skillId, affectedEmployees: 0, criticalEmployees: 0, weightedGap: 0 };
      cell.affectedEmployees++;
      cell.criticalEmployees += Number(gap.critical);
      cell.weightedGap += remaining * weight;
      gaps.set(key, cell);
      if (gap.critical) weightedCriticalGap += remaining * weight;
      const bestGain = employee.eligibleCandidates.reduce((best, candidate) => Math.max(best, candidate.effectiveGains[gap.skillId] ?? 0), 0);
      if (bestGain < remaining) {
        const item = catalog.get(gap.skillId) ?? { skillId: gap.skillId, affectedEmployees: 0, noAvailableStep: 0, needsMultipleSteps: 0 };
        item.affectedEmployees++;
        if (bestGain <= 0) item.noAvailableStep++; else item.needsMultipleSteps++;
        catalog.set(gap.skillId, item);
      }
    }
    // Use all eligible candidates: top-3 alone understates the reach of HR programmes.
    for (const candidate of new Map(employee.eligibleCandidates.map(c => [c.activityId, c])).values()) {
      let closure = 0, critical = 0;
      for (const gap of employee.gaps) {
        const gain = Math.min(Math.max(0, gap.required - gap.current), Math.max(0, candidate.effectiveGains[gap.skillId] ?? 0));
        closure += gain * (gap.critical ? 2 : 1);
        if (gap.critical) critical += gain;
      }
      if (!closure) continue;
      const item = programs.get(candidate.activityId) ?? { activityId: candidate.activityId, employees: 0, weightedGapClosure: 0, criticalGapClosure: 0 };
      item.employees++; item.weightedGapClosure += closure; item.criticalGapClosure += critical;
      programs.set(candidate.activityId, item);
    }
  }
  const voluntary = statuses(), mandatory = statuses();
  const engagement = (['self', 'manager', 'hr'] as Assignment[]).map(assignedBy => ({ assignedBy, total: 0, statuses: statuses(), completionRate: null as number | null }));
  for (const row of input.history) {
    if (!knownIds.has(row.employeeId)) throw new Error('History references an unknown employee');
    const counts = row.mandatory ? mandatory : voluntary;
    counts[row.status]++;
    if (row.mandatory) continue;
    const item = engagement.find(e => e.assignedBy === row.assignedBy)!;
    item.total++; item.statuses[row.status]++;
  }
  for (const item of engagement) {
    // In-progress rows are not outcomes; keep the rate honest when all rows are active.
    const finished = item.total - item.statuses.in_progress;
    item.completionRate = finished ? item.statuses.completed / finished : null;
  }
  return {
    totalEmployees: input.employees.length, employeesWithTarget: withTarget,
    employeesWithoutTarget: input.employees.length - withTarget,
    coveredEmployees: covered, noStepEmployees: withTarget - covered,
    coverage: withTarget ? covered / withTarget : null, meanReadiness: withTarget ? readiness / withTarget : null,
    weightedCriticalGap, statuses: voluntary, mandatoryStatuses: mandatory, engagement,
    gaps: [...gaps.values()].sort((a, b) => b.weightedGap - a.weightedGap || compare(JSON.stringify(a), JSON.stringify(b))),
    catalogGaps: [...catalog.values()].sort((a, b) => b.noAvailableStep - a.noAvailableStep || compare(a.skillId, b.skillId)),
    programImpact: [...programs.values()].sort((a, b) => b.weightedGapClosure - a.weightedGapClosure || compare(a.activityId, b.activityId)),
  };
}
