import type { EmployeeAnalytics } from '../../domain/analytics/types';
import type { EvaluationCase } from './harness';

export interface CoreFixture<Dataset> {
  id: string; name: string; dataset: Dataset; employeeId: string;
  /** Labelled expectations, not computed by the engine under test. */
  expected: {
    eligibleActivityIds: readonly string[];
    effectiveSkills: Readonly<Record<string, number>>;
    topActivityId?: string;
    abstain: boolean;
    target?: { role: string; grade: string } | null;
  };
}
/** A supplies the actual engine+projection; C verifies independently labelled fixture expectations. */
export function createCoreEvaluationCases<Dataset>(
  fixtures: readonly CoreFixture<Dataset>[],
  observe: (dataset: Dataset, employeeId: string, signal: AbortSignal) => EmployeeAnalytics | Promise<EmployeeAnalytics>,
): EvaluationCase[] {
  return fixtures.map(fixture => ({ id: fixture.id, name: fixture.name, scope: 'core', run: async signal => {
    const started = performance.now();
    const employee = await observe(fixture.dataset, fixture.employeeId, signal);
    const recommendationLatencyMs = Math.max(0, performance.now() - started);
    const allowed = new Set(fixture.expected.eligibleActivityIds);
    const violations = employee.recommendations.filter(r => !allowed.has(r.activityId)).length;
    const replayEntries = Object.entries(fixture.expected.effectiveSkills);
    const matched = replayEntries.filter(([id, value]) => (employee.effectiveSkills[id] ?? 0) === value).length;
    const abstainCorrect = (employee.recommendations.length === 0) === fixture.expected.abstain;
    const targetCorrect = fixture.expected.target === undefined || (fixture.expected.target === null ? employee.target === null : employee.target?.role === fixture.expected.target.role && employee.target?.grade === fixture.expected.target.grade);
    const topCorrect = fixture.expected.topActivityId === undefined || employee.recommendations[0]?.activityId === fixture.expected.topActivityId;
    const critical = employee.recommendations.filter(r => employee.gaps.some(g => g.critical && g.current < g.required && (r.effectiveGains[g.skillId] ?? 0) > 0)).length;
    const passed = employee.employeeId === fixture.employeeId && violations === 0 && matched === replayEntries.length && abstainCorrect && targetCorrect && topCorrect;
    return { passed, detail: passed ? 'Рекомендации, target и заданные effective skills совпадают с размеченным эталоном.' : 'Обнаружено расхождение с размеченными ожиданиями: проверьте eligibility, replay, target и top-1.',
      eligibility: { violations, recommendations: employee.recommendations.length }, replay: { matched, checked: replayEntries.length },
      criticalTargeting: { critical, recommendations: employee.recommendations.length },
      abstain: { correct: fixture.expected.abstain ? Number(abstainCorrect) : 0, checked: Number(fixture.expected.abstain) }, recommendationLatencyMs };
  } }));
}
