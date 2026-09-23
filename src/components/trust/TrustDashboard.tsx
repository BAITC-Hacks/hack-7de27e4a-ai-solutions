'use client';
import { useRef, useState } from 'react';
import { compareWithBaseline } from '../../lib/evaluation/baseline';
import { createAIContractCases } from '../../lib/evaluation/ai-suite';
import { runEvaluation, type EvaluationReport, type Rate } from '../../lib/evaluation/harness';
import { requestAIExplanation } from '../../lib/evaluation/client';
import type { AIExplanationResult } from '../../lib/evaluation/ai-contracts';
import type { TrustIntegration } from './integration';
import styles from '../hr/dashboard.module.css';

const percent = (n: number) => `${Math.round(n * 100)}%`;
const measured = (m?: Rate) => m?.rate === null || m === undefined ? 'Не измерено' : percent(m.rate);
const statuses = { verified: 'Ответ проверен', blocked: 'Ответ отклонён · fallback', timeout: 'Таймаут · fallback', no_key: 'Без ключа · fallback' };

export function TrustDashboard({ integration }: { integration: TrustIntegration }) {
  const [stored, setStored] = useState<{ report: EvaluationReport; source: TrustIntegration } | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ result: AIExplanationResult; source: TrustIntegration } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState(false);
  const running = useRef(false);
  const report = stored?.report;
  const stale = stored !== null && stored.source !== integration;
  const comparison = integration.challenge ? compareWithBaseline(integration.challenge.employee) : null;
  const evaluate = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(false);
    try { const next = await runEvaluation([...createAIContractCases(), ...(integration.coreEvaluationCases ?? [])]); setStored({ report: next, source: integration }); }
    catch { setError(true); }
    finally { running.current = false; setBusy(false); }
  };
  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...report, versions: integration.versions, stale }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'career-quest-evaluation.json'; anchor.click(); URL.revokeObjectURL(url);
  };
  const reviewNow = async () => {
    if (!integration.reviewRequest) return;
    setReviewing(true);
    try { setReview({ result: await requestAIExplanation(integration.reviewRequest), source: integration }); }
    finally { setReviewing(false); }
  };
  return <>
    <div className={styles.hero}><div><div className={styles.eyebrow}>AI Trust Center</div><h1>Решения с доказательствами.</h1><p className={styles.muted}>Проверяем ограничения, факты и поведение при отказе модели.</p></div><button className={styles.button} disabled={busy} onClick={evaluate}>{busy ? 'Проверяем…' : 'Запустить проверки'}</button></div>
    {!integration.coreEvaluationCases?.length && <div className={styles.notice}>Доступны проверки контракта AI на синтетических примерах. Проверки движка подключаются отдельно; eligibility, replay и скорость рекомендаций пока не измерены.</div>}
    {stale && <div className={styles.notice}>Состояние приложения изменилось после прогона. Запустите проверки заново для текущих данных.</div>}
    {error && <div role="alert" className={styles.notice}>Не удалось запустить набор проверок. Проверьте подключение тестовых сценариев.</div>}
    <div className={styles.stats}>
      <div className={styles.stat}><span>Нарушения eligibility</span><strong>{measured(report?.metrics.eligibility)}</strong><span className={styles.muted}>{report?.metrics.eligibility.denominator ?? 0} рекомендаций проверено</span></div>
      <div className={styles.stat}><span>Подтверждённые числа</span><strong>{measured(report?.metrics.grounding)}</strong><span className={styles.muted}>{report?.metrics.grounding.denominator ?? 0} утверждений в тестах</span></div>
      <div className={styles.stat}><span>Корректность replay</span><strong>{measured(report?.metrics.replay)}</strong><span className={styles.muted}>{report?.metrics.replay.denominator ?? 0} эталонных проверок</span></div>
      <div className={styles.stat}><span>Latency p95</span><strong>{report?.metrics.latency.p95 === null || !report ? 'Не измерено' : `${Math.round(report.metrics.latency.p95)} мс`}</strong><span className={styles.muted}>p50: {report?.metrics.latency.p50 === null || !report ? '—' : `${Math.round(report.metrics.latency.p50)} мс`} · {report?.metrics.latency.samples ?? 0} замеров</span></div>
    </div>
    <section className={styles.panel}><div className={styles.panelHead}><div><h2>Почему рекомендация отличается</h2><p className={styles.muted}>Baseline выбирает самый слабый из доступных для развития навыков. Оба метода используют одинаковые hard filters и effective skills.</p></div><span className={styles.badge}>Decision Lab</span></div>
      {comparison ? <><p>{integration.challenge!.label}</p><div className={styles.compare}><div><div className={styles.eyebrow}>Weakest skill</div><h2>{comparison.baseline?.activityId ?? 'Нет кандидата'}</h2><p>{comparison.baseline ? `${comparison.baseline.skillId}: уровень ${comparison.baseline.level}` : 'Нет доступного прироста.'}</p><p>Закрытие критичных разрывов: <b>{comparison.baselineCriticalClosure}</b></p><p>Готовность после: {comparison.baseline ? percent(comparison.baseline.projectedReadiness) : '—'}</p></div><div><div className={styles.eyebrow}>Career Quest</div><h2>{comparison.engine?.activityId ?? 'Нет рекомендации'}</h2><p>Учитывает вклад в цель, историю, выполнимость и траекторию.</p><p>Закрытие критичных разрывов: <b>{comparison.engineCriticalClosure}</b></p><p>Готовность после: {comparison.engine ? percent(comparison.engine.projectedReadiness) : '—'}</p></div></div></> : <p>Выберите демонстрационный профиль в кабинете сотрудника, чтобы увидеть фактическое сравнение.</p>}
    </section>
    <div className={styles.grid}><section className={styles.panel}><div className={styles.panelHead}><div><h2>Проверки ограничений</h2><p className={styles.muted}>Результат конкретных сценариев; эти метрики не оценивают точность карьерного прогноза.</p></div>{report && <button className={`${styles.button} ${styles.secondary}`} onClick={download}>Скачать JSON</button>}</div>
      {!report ? <p>Нажмите «Запустить проверки». Результаты появятся после выполнения.</p> : <><p role="status"><b>{report.passed}</b> пройдено · <b>{report.failed}</b> ошибок · {report.scope}</p>{report.cases.map(item => <div className={styles.action} key={item.id}><div className={styles.row}><b>{item.name}</b><span className={item.status === 'passed' ? styles.pass : styles.fail}>{item.status === 'passed' ? 'Пройдено' : 'Ошибка'}</span></div><p className={styles.muted}>{item.detail}</p></div>)}</>}
    </section><div><section className={styles.panel}><h2>Проверить текущее объяснение</h2><p className={styles.muted}>Отправляются только разрешённые evidence-факты выбранных кандидатов. Профиль и история остаются в браузере.</p>
      <button className={styles.button} disabled={!integration.reviewRequest || reviewing} onClick={reviewNow}>{reviewing ? 'Проверяем ответ…' : 'Проверить через AI route'}</button>
      {!integration.reviewRequest && <p className={styles.muted}>Сначала подключите evidence выбранного профиля.</p>}
      {review && <><p role="status" className={styles.badge}>{statuses[review.result.status]}</p>{review.source !== integration && <p className={styles.muted}>Ответ относится к предыдущему состоянию.</p>}<p>{review.result.text}</p></>}
    </section><section className={styles.panel}><h2>Версии и воспроизводимость</h2><p>Trust: <span className={styles.code}>career-quest-trust/1.0.0</span></p>{integration.versions ? Object.entries(integration.versions).map(([name, version]) => <p key={name}>{name}: <span className={styles.code}>{version}</span></p>) : <p className={styles.muted}>Версии ядра будут доступны после его подключения.</p>}<p className={styles.muted}>Нулевой знаменатель отображается как «Не измерено». Скорость проверок verifier не подменяет скорость рекомендаций.</p></section></div></div>
  </>;
}
