import { describe, expect, it } from 'vitest';
import { createAIContractCases } from '../../src/lib/evaluation/ai-suite';
import { runEvaluation } from '../../src/lib/evaluation/harness';
import { createCoreEvaluationCases } from '../../src/lib/evaluation/core-cases';
import { employee } from './fixtures';
describe('live evaluation', () => {
  it('checks core output against independent labelled replay, eligibility and target expectations', async () => {
    const fixture = { id: 'synthetic-e0028', name: 'Synthetic replayed E0028 projection', dataset: {}, employeeId: 'E0028', expected: { eligibleActivityIds: ['EV_MENTORING', 'EV_DATA'], effectiveSkills: { SK_SYSTEM_DESIGN: 3 }, topActivityId: 'EV_MENTORING', abstain: false, target: { role: 'Backend Engineer', grade: 'Senior' } } };
    const report = await runEvaluation(createCoreEvaluationCases([fixture], () => employee()));
    expect(report.passed).toBe(1); expect(report.metrics.replay.rate).toBe(1); expect(report.metrics.eligibility.rate).toBe(0);
    const broken = employee(); broken.recommendations = [{ activityId: 'EV_006', effectiveGains: {}, projectedReadiness: 0.6 }];
    const failure = await runEvaluation(createCoreEvaluationCases([fixture], () => broken));
    expect(failure.failed).toBe(1); expect(failure.metrics.eligibility.rate).toBe(1);
  });
  it('runs the exact built-in cases used by Trust UI; does not fabricate core metrics', async () => {
    const report = await runEvaluation(createAIContractCases());
    expect(report.failed).toBe(0); expect(report.passed).toBe(10); expect(report.scope).toBe('ai-only');
    expect(report.metrics.eligibility.rate).toBeNull(); expect(report.metrics.replay.rate).toBeNull(); expect(report.metrics.latency.p95).toBeNull();
    expect(report.metrics.grounding).toEqual({ numerator: 5, denominator: 5, rate: 1 });
  });
  it('aggregates measured denominators and nearest-rank percentiles', async () => {
    const report = await runEvaluation([10, 20, 30, 100].map((latency, index) => ({ id: String(index), name: 'measurement', scope: 'core' as const, run: () => ({ passed: index !== 0, detail: 'Measured', eligibility: { violations: index === 0 ? 1 : 0, recommendations: 2 }, recommendationLatencyMs: latency }) })));
    expect(report.metrics.eligibility).toEqual({ numerator: 1, denominator: 8, rate: 0.125 });
    expect(report.metrics.latency).toEqual({ p50: 20, p95: 100, samples: 4 }); expect(report.failed).toBe(1);
  });
  it('bounds hung evaluations and isolates invalid metrics without leaking exception text', async () => {
    const report = await runEvaluation([
      { id: 'hang', name: 'hang', scope: 'core', run: () => new Promise(() => undefined) },
      { id: 'invalid', name: 'invalid', scope: 'core', run: () => ({ passed: true, detail: 'bad', eligibility: { violations: 0, recommendations: 1 }, replay: { matched: 9, checked: 1 } }) },
    ], 5);
    expect(report.failed).toBe(2); expect(report.metrics.eligibility.denominator).toBe(0);
  });
});
