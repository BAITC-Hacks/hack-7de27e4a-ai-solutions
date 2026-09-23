import { describe, expect, it } from 'vitest';
import { selectHRAnalytics } from '../../src/domain/analytics/selectors';
import { projectAnalytics } from '../../src/domain/analytics/types';
import { compareWithBaseline, weakestSkillBaseline } from '../../src/lib/evaluation/baseline';
import { dataset, employee } from './fixtures';

describe('HR analytics', () => {
  it('counts coverage against employees with targets, separates no-target from no-step', () => {
    const result = selectHRAnalytics(dataset());
    expect(result).toMatchObject({ totalEmployees: 3, employeesWithTarget: 2, employeesWithoutTarget: 1, coveredEmployees: 1, noStepEmployees: 1, coverage: 0.5, weightedCriticalGap: 4 });
    expect(result.gaps).toEqual([{ role: 'Backend Engineer', grade: 'Senior', skillId: 'SK_SYSTEM_DESIGN', affectedEmployees: 2, criticalEmployees: 2, weightedGap: 4 }]);
  });
  it('separates mandatory and self/manager/hr engagement; active rows are not failed outcomes', () => {
    const result = selectHRAnalytics(dataset());
    expect(result.statuses).toMatchObject({ completed: 1, no_show: 1, in_progress: 1, overdue: 0 });
    expect(result.mandatoryStatuses.overdue).toBe(1);
    expect(result.engagement.find(e => e.assignedBy === 'self')).toMatchObject({ total: 2, completionRate: 1 });
    expect(result.engagement.find(e => e.assignedBy === 'hr')!.completionRate).toBeNull();
  });
  it('reports current catalog gaps and caps programme impact at the remaining target gap', () => {
    const input = dataset();
    input.employees[0].eligibleCandidates = [{ activityId: 'BIG_GAIN', effectiveGains: { SK_SYSTEM_DESIGN: 5 }, projectedReadiness: 1 }];
    const result = selectHRAnalytics(input);
    expect(result.programImpact[0]).toMatchObject({ employees: 1, weightedGapClosure: 2, criticalGapClosure: 1 });
    expect(result.catalogGaps).toEqual([{ skillId: 'SK_SYSTEM_DESIGN', affectedEmployees: 1, noAvailableStep: 1, needsMultipleSteps: 0 }]);
  });
  it('does not leak employee identifiers into aggregate output', () => {
    const output = JSON.stringify(selectHRAnalytics(dataset()));
    expect(output).not.toContain('E0028'); expect(output).not.toContain('NO_STEP');
  });
  it('handles empty data and missing history without inventing a rate', () => {
    expect(selectHRAnalytics({ employees: [], history: [] })).toMatchObject({ coverage: null, meanReadiness: null, noStepEmployees: 0 });
    expect(selectHRAnalytics({ employees: [employee()], history: [] }).engagement.every(e => e.completionRate === null)).toBe(true);
  });
  it('rejects broken references and duplicate employees', () => {
    expect(() => selectHRAnalytics({ employees: [employee(), employee()], history: [] })).toThrow('Duplicate');
    expect(() => selectHRAnalytics({ employees: [], history: dataset().history })).toThrow('unknown employee');
  });
  it('reads the host snapshot via a bridge and recomputes after completion without mutating it', () => {
    const before = dataset(); const original = JSON.stringify(before);
    const bridge = { employeeIds: (d: typeof before) => d.employees.map(e => e.employeeId), employee: (d: typeof before, id: string) => d.employees.find(e => e.employeeId === id)!, history: (d: typeof before) => d.history };
    expect(selectHRAnalytics(projectAnalytics(before, bridge)).weightedCriticalGap).toBe(4);
    const after = { ...before, employees: before.employees.map(e => e.employeeId === 'E0028' ? { ...e, gaps: e.gaps.map(g => ({ ...g, current: g.required })) } : e) };
    expect(selectHRAnalytics(projectAnalytics(after, bridge)).weightedCriticalGap).toBe(2);
    expect(JSON.stringify(before)).toBe(original);
  });
});

describe('fair weakest-skill baseline', () => {
  it('shows the documented E0028 trap using a synthetic projection with replay already applied', () => {
    const comparison = compareWithBaseline(employee());
    expect(comparison.baseline).toMatchObject({ skillId: 'SK_DATA_VIZ', level: 1, activityId: 'EV_DATA' });
    expect(comparison.engine?.activityId).toBe('EV_MENTORING');
    expect(comparison.baselineCriticalClosure).toBe(0); expect(comparison.engineCriticalClosure).toBe(1);
    expect(comparison.engine?.activityId).not.toBe('EV_006');
  });
  it('uses only eligible candidates, has stable ID ties, and abstains without gain', () => {
    const input = employee();
    input.eligibleCandidates = [...input.eligibleCandidates, { activityId: 'EV_A', effectiveGains: { SK_DATA_VIZ: 1 }, projectedReadiness: 0.6 }].reverse();
    expect(weakestSkillBaseline(input)?.activityId).toBe('EV_A');
    input.eligibleCandidates = []; expect(weakestSkillBaseline(input)).toBeNull();
  });
});
