'use client';
import { useMemo, useState } from 'react';
import type { AnalyticsInput } from '../../domain/analytics/types';
import { selectDevelopmentDropoutReport } from '../../domain/analytics/dropout';
import { useTrustIntegration } from '../trust/integration';
import styles from './dashboard.module.css';

const trendLabel = { fewer: 'Меньше негативных исходов', more: 'Больше негативных исходов', unchanged: 'Количество не изменилось', no_previous_history: 'Нет истории для сравнения' };

/** Display gate follows the host HR role; authentication remains the host's responsibility. */
export function DropoutPanel({ input }: { input: AnalyticsInput }) {
  const integration = useTrustIntegration();
  const [months, setMonths] = useState<6 | 12>(6);
  const report = useMemo(() => {
    if (integration?.access !== 'hr') return null;
    try { return selectDevelopmentDropoutReport(input, { months }); }
    catch { return null; }
  }, [input, months, integration?.access]);
  if (integration?.access !== 'hr') return null;
  if (!report) return <section className={styles.notice} role="alert">Не удалось сопоставить периоды участия. Проверьте даты и связи истории с сотрудниками.</section>;
  return <section className={styles.panel} aria-labelledby="development-support-title">
    <div className={styles.panelHead}>
      <div><h2 id="development-support-title">Кто выпадает из развития</h2><span className={styles.badge}>Только для HR · повод для разговора</span></div>
      <label>Период анализа<br /><select aria-label="Период анализа участия" value={months} onChange={event => setMonths(Number(event.target.value) as 6 | 12)}>
        <option value={6}>6 месяцев</option><option value={12}>12 месяцев</option>
      </select></label>
    </div>
    <p className={styles.muted}>Текущий период: {report.currentStart} — {report.snapshotDate} включительно. Предыдущий: с {report.previousStart} до {report.currentStart}, не включая последнюю дату. День снимка включён для подтверждённых прохождений в приложении.</p>
    <p>Сотрудников для обсуждения: <strong>{report.rows.length}</strong>. Неявок, прерываний и отказов: <strong>{report.current.negative}</strong> сейчас, <strong>{report.previous.negative}</strong> за предыдущий период.</p>
    <p className={styles.muted}>Сравнивается число исходов. Количество и состав активностей могли измениться; наблюдение не устанавливает причину. Отсутствие истории и обязательные активности не включают сотрудника в список. Порядок — по ID.</p>
    {(report.excluded.missingDate > 0 || report.excluded.invalidDate > 0 || report.excluded.futureDate > 0) && <p className={styles.notice} role="status">Не учтены в периодах: без даты — {report.excluded.missingDate}; с некорректной датой — {report.excluded.invalidDate}; позже снимка — {report.excluded.futureDate}.</p>}
    {!report.rows.length && <p>За выбранный период нет сотрудников с неявками, прерываниями или отказами в необязательных активностях.</p>}
    {report.rows.length > 0 && <div className={styles.dropoutList} role="region" aria-label="Сотрудники для обсуждения развития" tabIndex={0}>
    {report.rows.map(row => <article key={row.employeeId} className={styles.dropoutRow} aria-label={`Поддержка развития ${row.employeeId}`}>
      <details>
      <summary className={styles.dropoutSummary}><span className={styles.dropoutSummaryTitle}>{row.employeeId} · {row.role} / {row.grade}</span><span className={styles.badge}>{trendLabel[row.trend]}</span></summary>
      <p>{row.reason}</p>
      <p className={styles.muted}>Негативные исходы: {row.current.negative} сейчас / {row.previous.negative} ранее. По своей инициативе: {row.current.self.negative} / {row.previous.self.negative}; назначения руководителя: {row.current.manager.negative} / {row.previous.manager.negative}; назначения HR: {row.current.hr.negative} / {row.previous.hr.negative}.</p>
      <p><strong>Действие HR:</strong> {row.suggestedAction}</p>
      {row.current.overdue > 0 && <p className={styles.muted}>Отдельный контекст просрочки: обязательных — {row.current.mandatory.statuses.overdue}; всего — {row.current.overdue}. Эти записи не входят в негативные исходы развития.</p>}
      </details>
    </article>)}
    </div>}
    <details className={styles.action}><summary>Обязательные активности и просрочки отдельно</summary>
      <p>Обязательных записей за период: {report.current.mandatory.total}, ранее: {report.previous.mandatory.total}. Завершено: {report.current.mandatory.statuses.completed}; в процессе: {report.current.mandatory.statuses.in_progress}; неявок: {report.current.mandatory.statuses.no_show}; прерываний: {report.current.mandatory.statuses.dropped}; отказов: {report.current.mandatory.statuses.declined}; просрочено: {report.current.mandatory.statuses.overdue}.</p>
      <p className={styles.muted}>Все записи overdue: {report.current.overdue}, ранее: {report.previous.overdue}. Просрочки учитываются отдельно независимо от источника назначения.</p>
    </details>
  </section>;
}
