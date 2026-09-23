import type { EmployeeAnalytics } from '../../domain/analytics/types';

/** Fair single-factor comparator: shares A's hard filters and replay, ignores target weights. */
export function weakestSkillBaseline(employee: EmployeeAnalytics) {
  const trainable = new Set(employee.eligibleCandidates.flatMap(c => Object.keys(c.effectiveGains).filter(skill => c.effectiveGains[skill] > 0)));
  const skills = [...trainable].sort((a, b) => (employee.effectiveSkills[a] ?? 0) - (employee.effectiveSkills[b] ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
  const weakest = skills[0];
  if (!weakest) return null;
  const candidate = [...employee.eligibleCandidates].filter(c => (c.effectiveGains[weakest] ?? 0) > 0).sort((a, b) => a.activityId < b.activityId ? -1 : a.activityId > b.activityId ? 1 : 0)[0];
  return { skillId: weakest, level: employee.effectiveSkills[weakest] ?? 0, activityId: candidate.activityId, projectedReadiness: candidate.projectedReadiness };
}

export function compareWithBaseline(employee: EmployeeAnalytics) {
  const baseline = weakestSkillBaseline(employee);
  const criticalClosure = (activityId: string | undefined) => {
    const candidate = employee.eligibleCandidates.find(c => c.activityId === activityId);
    return employee.gaps.filter(g => g.critical).reduce((sum, g) => sum + Math.min(Math.max(0, g.required - g.current), Math.max(0, candidate?.effectiveGains[g.skillId] ?? 0)), 0);
  };
  const top = employee.recommendations[0];
  return { baseline, engine: top ? { activityId: top.activityId, projectedReadiness: top.projectedReadiness } : null,
    baselineCriticalClosure: criticalClosure(baseline?.activityId), engineCriticalClosure: criticalClosure(top?.activityId) };
}
