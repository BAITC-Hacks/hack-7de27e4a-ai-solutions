import type { NormalizedDataset } from '@/lib/contracts';
import { evaluateEligibility, recommendForEmployee } from '@/domain/recommendation';
import type { EvaluationCase } from './harness';

/** Read-only checks for ANY imported dataset. No hardcoded challenge or event IDs. */
export function createDatasetAuditCases(dataset: NormalizedDataset): EvaluationCase[] {
  return [
    { id: 'dataset-constraints', name: 'Hard filters и критичные разрывы · исходный импорт', scope: 'core', run: () => {
      let violations = 0, recommendations = 0, critical = 0, abstainExpected = 0, abstainCorrect = 0;
      const started = performance.now();
      for (const employeeId of Object.keys(dataset.employeesById)) {
        const result = recommendForEmployee(dataset, employeeId);
        const available = Object.values(dataset.eventsById).filter(event => evaluateEligibility(dataset, result.effectiveProfile, result.gapAnalysis, event).eligible);
        if (!available.length) { abstainExpected++; if (!result.recommendations.length) abstainCorrect++; }
        for (const rec of result.recommendations) {
          recommendations++;
          if (!available.some(e => e.id === rec.activityId)) violations++;
          if (result.gapAnalysis.gaps.some(g => g.critical && g.gap > 0 && (rec.effectiveGains[g.skillId] ?? 0) > 0)) critical++;
        }
      }
      const elapsed = performance.now() - started;
      return { passed: violations === 0 && abstainExpected === abstainCorrect,
        detail: `${recommendations} рекомендаций; ${violations} нарушений. Hard filters проверены публичной eligibility-функцией A. Весь пакет: ${Math.round(elapsed)} мс; это не latency одного профиля.`,
        eligibility: { violations, recommendations }, criticalTargeting: { critical, recommendations }, abstain: { correct: abstainCorrect, checked: abstainExpected } };
    } },
    { id: 'dataset-replay', name: 'History replay против независимого пересчёта', scope: 'core', run: () => {
      let matched = 0, checked = 0;
      for (const employee of Object.values(dataset.employeesById)) {
        const expected: Record<string, number> = { ...employee.skills };
        const history = dataset.history.filter(h => h.employeeId === employee.id && h.status === 'completed' && h.date > employee.lastReviewDate).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
        for (const row of history) for (const effect of dataset.eventsById[row.eventId]?.developsSkills ?? []) {
          const before = expected[effect.skillId] ?? 0;
          expected[effect.skillId] = Math.max(before, Math.min(before + effect.gain, effect.maxLevel, 5));
        }
        const actual = recommendForEmployee(dataset, employee.id).effectiveProfile.effectiveSkills;
        const ids = new Set([...Object.keys(actual), ...Object.keys(expected)]);
        for (const id of ids) { checked++; if ((actual[id] ?? 0) === (expected[id] ?? 0)) matched++; }
      }
      return { passed: matched === checked, detail: `Совпало ${matched} из ${checked} уровней навыков. Эталон использует history, review date и cap, не функцию replay ядра.`, replay: { matched, checked } };
    } },
    { id: 'dataset-projection', name: 'Прогноз активности не снижает готовность', scope: 'core', run: () => {
      const failures: string[] = [];
      for (const id of Object.keys(dataset.employeesById)) {
        const result = recommendForEmployee(dataset, id);
        for (const rec of result.recommendations) if (rec.projectedReadiness + 0.0001 < result.gapAnalysis.readiness) failures.push(`${id}/${rec.activityId}`);
      }
      return { passed: failures.length === 0, detail: failures.length ? `Снижение readiness в ${failures.length} рекомендациях: ${failures.slice(0, 5).join(', ')}. Проверьте cap в projectedSkills ядра A.` : 'Все прогнозы сохраняют или повышают readiness с учётом округления.' };
    } },
    ...Object.keys(dataset.employeesById).sort().slice(0, 20).map(employeeId => ({
      id: `latency:${employeeId}`, name: `Время рекомендации · ${employeeId}`, scope: 'core' as const,
      run: () => { const start = performance.now(); recommendForEmployee(dataset, employeeId); const elapsed = Math.max(0, performance.now() - start); return { passed: elapsed <= 10000, detail: 'Один локальный вызов recommendation engine; без сети и LLM.', recommendationLatencyMs: elapsed }; },
    })),
  ];
}
