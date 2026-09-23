export interface EvaluationObservation {
  passed: boolean; detail: string;
  eligibility?: { violations: number; recommendations: number };
  grounding?: { supported: number; claims: number };
  replay?: { matched: number; checked: number };
  criticalTargeting?: { critical: number; recommendations: number };
  abstain?: { correct: number; checked: number };
  recommendationLatencyMs?: number;
  fallback?: 'verified' | 'blocked' | 'timeout' | 'no_key';
}
export interface EvaluationCase { id: string; name: string; scope: 'core' | 'ai'; run(signal: AbortSignal): Promise<EvaluationObservation> | EvaluationObservation }
export interface EvaluationResult { id: string; name: string; scope: 'core' | 'ai'; status: 'passed' | 'failed'; detail: string }
export interface EvaluationReport {
  version: 'career-quest-trust/1.0.0'; scope: 'ai-only' | 'core-and-ai' | 'core-only' | 'empty';
  cases: EvaluationResult[]; passed: number; failed: number;
  metrics: {
    eligibility: Rate; grounding: Rate; replay: Rate; criticalTargeting: Rate; abstain: Rate;
    latency: { p50: number | null; p95: number | null; samples: number };
    fallback: Record<string, number>;
  };
}
export interface Rate { numerator: number; denominator: number; rate: number | null }
const rate = (): Rate => ({ numerator: 0, denominator: 0, rate: null });
export function percentile(values: readonly number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}
function add(target: Rate, numerator: number, denominator: number) {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || numerator < 0 || denominator < numerator) throw new Error('Invalid measurement counts');
  target.numerator += numerator; target.denominator += denominator;
  target.rate = target.denominator ? target.numerator / target.denominator : null;
}

/** Missing measurements stay null. No labels/ground truth => no claim of accuracy. */
export async function runEvaluation(cases: readonly EvaluationCase[], timeoutMs = 10000): Promise<EvaluationReport> {
  if (new Set(cases.map(c => c.id)).size !== cases.length) throw new Error('Duplicate evaluation case IDs');
  const report: EvaluationReport = { version: 'career-quest-trust/1.0.0',
    scope: cases.some(c => c.scope === 'core') ? (cases.some(c => c.scope === 'ai') ? 'core-and-ai' : 'core-only') : cases.length ? 'ai-only' : 'empty',
    cases: [], passed: 0, failed: 0, metrics: { eligibility: rate(), grounding: rate(), replay: rate(), criticalTargeting: rate(), abstain: rate(), latency: { p50: null, p95: null, samples: 0 }, fallback: {} } };
  const latencies: number[] = [];
  for (const item of cases) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const observation = await Promise.race([Promise.resolve().then(() => item.run(controller.signal)), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Evaluation timeout')); }, timeoutMs); })]);
      const m = report.metrics;
      // Validate all samples before mutating the aggregate, so bad cases cannot partially pollute it.
      const measurements: [Rate, number, number][] = [];
      if (observation.eligibility) measurements.push([m.eligibility, observation.eligibility.violations, observation.eligibility.recommendations]);
      if (observation.grounding) measurements.push([m.grounding, observation.grounding.supported, observation.grounding.claims]);
      if (observation.replay) measurements.push([m.replay, observation.replay.matched, observation.replay.checked]);
      if (observation.criticalTargeting) measurements.push([m.criticalTargeting, observation.criticalTargeting.critical, observation.criticalTargeting.recommendations]);
      if (observation.abstain) measurements.push([m.abstain, observation.abstain.correct, observation.abstain.checked]);
      for (const [, n, d] of measurements) add(rate(), n, d);
      const latency = observation.recommendationLatencyMs;
      if (latency !== undefined && (!Number.isFinite(latency) || latency < 0)) throw new Error('Invalid latency');
      for (const [target, n, d] of measurements) add(target, n, d);
      if (latency !== undefined) latencies.push(latency);
      if (observation.fallback) m.fallback[observation.fallback] = (m.fallback[observation.fallback] ?? 0) + 1;
      report.cases.push({ id: item.id, name: item.name, scope: item.scope, status: observation.passed ? 'passed' : 'failed', detail: observation.detail });
    } catch {
      report.cases.push({ id: item.id, name: item.name, scope: item.scope, status: 'failed', detail: 'Проверка завершилась ошибкой или превысила время ожидания.' });
    } finally { if (timer) clearTimeout(timer); controller.abort(); }
  }
  report.passed = report.cases.filter(c => c.status === 'passed').length;
  report.failed = report.cases.length - report.passed;
  report.metrics.latency = { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), samples: latencies.length };
  return report;
}
