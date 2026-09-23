import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { importCareerQuestDataset } from '@/domain/data';
import { recommendForEmployee } from '@/domain/recommendation';
import type { NormalizedDataset } from '@/lib/contracts';
import { projectCoreAnalytics, projectCoreEmployee } from '../../src/domain/analytics/core-adapter';
import { projectEmployeeStore, type EmployeeStoreSnapshot } from '../../src/domain/analytics/store-adapter';
import { selectHRAnalytics } from '../../src/domain/analytics/selectors';
import { buildCoreReviewRequest } from '../../src/lib/evaluation/core-evidence';
import { compareWithBaseline } from '../../src/lib/evaluation/baseline';
import { deterministicReasons } from '../../src/lib/evaluation/explanations';
import { verifyAIReview } from '../../src/lib/evaluation/verifier';
import { createDatasetAuditCases } from '../../src/lib/evaluation/dataset-audit';
import { runEvaluation } from '../../src/lib/evaluation/harness';
import { createAIContractCases } from '../../src/lib/evaluation/ai-suite';

describe('integration with the published A engine and organizer dataset', () => {
  let data: NormalizedDataset;
  beforeAll(() => {
    const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../data/source/${name}`, import.meta.url)), 'utf8');
    data = importCareerQuestDataset({ employees: read('employees.json'), skills: read('skills.json'), events: read('events.json'), activityHistoryCsv: read('activity_history.csv') });
  });
  it('counts all 200 profiles and 2743 history rows against source data', () => {
    const projection = projectCoreAnalytics(data); const aggregate = selectHRAnalytics(projection);
    expect(aggregate.totalEmployees).toBe(200);
    expect(Object.values(aggregate.statuses).reduce((a, b) => a + b, 0) + Object.values(aggregate.mandatoryStatuses).reduce((a, b) => a + b, 0)).toBe(2743);
    expect(aggregate.coveredEmployees).toBe(projection.employees.filter(e => e.target && e.recommendations.length > 0).length);
    const original = JSON.stringify(data); projectCoreAnalytics(data); expect(JSON.stringify(data)).toBe(original);
  });
  it('runs dataset-wide audit and reports upstream projection regressions without masking them', async () => {
    const report = await runEvaluation([...createDatasetAuditCases(data), ...createAIContractCases()]);
    expect(report.metrics.eligibility.rate).toBe(0); expect(report.metrics.replay.rate).toBe(1);
    const projection = report.cases.find(c => c.id === 'dataset-projection')!;
    console.log('DATASET_AUDIT', JSON.stringify({ passed: report.passed, failed: report.failed, projection, metrics: report.metrics }));
    if (process.env.TRUST_REPORT_PATH) writeFileSync(process.env.TRUST_REPORT_PATH, JSON.stringify(report, null, 2));
  });
  it('uses real E0028 replay and same-filter baseline without prescribing a fabricated winner', () => {
    const profile = projectCoreEmployee(data, 'E0028');
    expect(profile.effectiveSkills.SK_SYSTEM_DESIGN).toBe(3);
    expect(profile.recommendations.every(r => r.activityId !== 'EV_006')).toBe(true);
    const comparison = compareWithBaseline(profile);
    expect(comparison.engine?.activityId).toBe(recommendForEmployee(data, 'E0028').recommendations[0]?.activityId);
    console.log('REAL_E0028_COMPARISON', JSON.stringify(comparison));
  });
  it('generates valid minimal evidence for every recommendation in the real dataset', () => {
    for (const id of Object.keys(data.employeesById)) {
      const result = recommendForEmployee(data, id);
      const request = buildCoreReviewRequest(data, result);
      if (request.candidates.length) expect(verifyAIReview({ selectedCandidateIds: request.candidates.slice(0, 3).map(c => c.id), reasons: deterministicReasons(request) }, request).valid).toBe(true);
      expect(JSON.stringify(request)).not.toContain(data.employeesById[id].fullName);
      expect(JSON.stringify(request)).not.toContain('lastReviewDate');
    }
  });
  it('reads current B views and ledger instead of recomputing original skills after completion', () => {
    const projected = projectCoreAnalytics(data);
    const state: EmployeeStoreSnapshot = { dataset: { source: data }, selectedEmployeeId: 'E0028', status: 'ready', ledger: [], views: Object.fromEntries(projected.employees.map(e => [e.employeeId, {
      employeeId: e.employeeId, target: e.target, effectiveSkills: e.effectiveSkills, readiness: e.readiness, gaps: e.gaps, engineVersion: 'test',
      recommendations: e.recommendations.map(r => ({ ...r, expectedGains: r.effectiveGains, factorScores: {} })),
      candidates: e.eligibleCandidates.map(r => ({ ...r, expectedGains: r.effectiveGains, factorScores: {} })),
    }])) };
    const before = projectEmployeeStore(state)!;
    const view = state.views.E0028;
    const activityId = projected.employees.find(e => e.employeeId === 'E0028')!.recommendations[0].activityId;
    const after = projectEmployeeStore({ ...state, ledger: [{ id: 'session-one', employeeId: 'E0028', activityId }], views: { ...state.views, E0028: { ...view, effectiveSkills: { ...view.effectiveSkills, SK_SYSTEM_DESIGN: 4 }, gaps: view.gaps.map(g => g.skillId === 'SK_SYSTEM_DESIGN' ? { ...g, current: 4 } : g) } } })!;
    expect(after.employees.find(e => e.employeeId === 'E0028')!.effectiveSkills.SK_SYSTEM_DESIGN).toBe(4);
    expect(selectHRAnalytics(after).weightedCriticalGap).toBe(selectHRAnalytics(before).weightedCriticalGap - 2);
    expect(after.history.length).toBe(before.history.length + 1);
    expect(data.employeesById.E0028.skills.SK_SYSTEM_DESIGN).toBe(2);
  });
});
