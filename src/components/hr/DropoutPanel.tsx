'use client';
import { useMemo, useState } from 'react';
import type { AnalyticsInput } from '../../domain/analytics/types';
import { selectDevelopmentDropoutReport } from '../../domain/analytics/dropout';
import { useTrustIntegration } from '../trust/integration';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { catalogName } from '@/lib/i18n/domain';
import { dropoutTrendCopy, localizeDropoutRow } from './panel-localization';
import styles from './dashboard.module.css';

/** Display gate follows the host HR role; authentication remains the host's responsibility. */
export function DropoutPanel({ input }: { input: AnalyticsInput }) {
  const { locale, t, number, date } = useI18n();
  const integration = useTrustIntegration();
  const [months, setMonths] = useState<6 | 12>(6);
  const report = useMemo(() => {
    if (integration?.access !== 'hr') return null;
    try { return selectDevelopmentDropoutReport(input, { months }); }
    catch { return null; }
  }, [input, months, integration?.access]);
  if (integration?.access !== 'hr') return null;
  if (!report) return <section className={styles.notice} role="alert">{t('Не удалось сопоставить периоды участия. Проверьте даты и связи истории с сотрудниками.', 'Қатысу кезеңдерін салыстыру мүмкін болмады. Күндер мен тарихтың қызметкерлерге байланысын тексеріңіз.', 'Participation periods could not be compared. Check dates and employee references in the history.')}</section>;
  return <section className={styles.panel} aria-labelledby="development-support-title">
    <div className={styles.panelHead}>
      <div><h2 id="development-support-title">{t('Кто выпадает из развития', 'Даму бағдарламаларынан кім шығып қалады', 'Who is dropping out of development')}</h2><span className={styles.badge}>{t('Только для HR · повод для разговора', 'Тек HR үшін · әңгімелесуге негіз', 'HR only · a reason for a conversation')}</span></div>
      <label>{t('Период анализа', 'Талдау кезеңі', 'Analysis period')}<br /><select aria-label={t('Период анализа участия', 'Қатысуды талдау кезеңі', 'Participation analysis period')} value={months} onChange={event => setMonths(Number(event.target.value) as 6 | 12)}>
        <option value={6}>{t('6 месяцев', '6 ай', '6 months')}</option><option value={12}>{t('12 месяцев', '12 ай', '12 months')}</option>
      </select></label>
    </div>
    <p className={styles.muted}>{t('Текущий период: {start} — {end} включительно. Предыдущий: с {previous} до {start}, не включая последнюю дату. День снимка включён для подтверждённых прохождений в приложении.', 'Ағымдағы кезең: {start} — {end}, екі күн де кіреді. Алдыңғысы: {previous} күнінен {start} күніне дейін, соңғы күн кірмейді. Қолданбада расталған аяқтаулар үшін деректер күні есепке алынады.', 'Current period: {start} — {end}, inclusive. Previous period: from {previous} to {start}, excluding the latter date. The snapshot day includes completions confirmed in the app.', { start: date(report.currentStart), end: date(report.snapshotDate), previous: date(report.previousStart) })}</p>
    <p>{t('Сотрудников для обсуждения:', 'Әңгімелесуге арналған қызметкерлер:', 'Employees to discuss:')} <strong>{number(report.rows.length)}</strong>. {t('Неявок, прерываний и отказов:', 'Келмеу, тоқтату және бас тарту:', 'No-shows, dropped and declined:')} <strong>{number(report.current.negative)}</strong> {t('сейчас,', 'қазір,', 'now,')} <strong>{number(report.previous.negative)}</strong> {t('за предыдущий период.', 'алдыңғы кезеңде.', 'in the previous period.')}</p>
    <p className={styles.muted}>{t('Сравнивается число исходов. Количество и состав активностей могли измениться; наблюдение не устанавливает причину. Отсутствие истории и обязательные активности не включают сотрудника в список. Порядок — по ID.', 'Нәтижелер саны салыстырылады. Іс-шаралар саны мен құрамы өзгеруі мүмкін; бақылау себебін анықтамайды. Тарихтың болмауы мен міндетті іс-шаралар қызметкерді тізімге енгізбейді. Реті — ID бойынша.', 'Outcome counts are compared. The number and mix of activities may have changed; this observation does not establish a cause. Missing history and mandatory activities do not put an employee on the list. Sorted by ID.')}</p>
    {(report.excluded.missingDate > 0 || report.excluded.invalidDate > 0 || report.excluded.futureDate > 0) && <p className={styles.notice} role="status">{t('Не учтены в периодах: без даты — {missing}; с некорректной датой — {invalid}; позже снимка — {future}.', 'Кезеңдерге енгізілмеді: күні жоқ — {missing}; күні қате — {invalid}; деректер күнінен кейін — {future}.', 'Excluded from periods: missing date — {missing}; invalid date — {invalid}; after the snapshot — {future}.', { missing: number(report.excluded.missingDate), invalid: number(report.excluded.invalidDate), future: number(report.excluded.futureDate) })}</p>}
    {!report.rows.length && <p>{t('За выбранный период нет сотрудников с неявками, прерываниями или отказами в необязательных активностях.', 'Таңдалған кезеңде міндетті емес іс-шараларға келмеген, тоқтатқан немесе бас тартқан қызметкерлер жоқ.', 'No employees have no-shows, dropped or declined outcomes in non-mandatory activities during this period.')}</p>}
    {report.rows.length > 0 && <div className={styles.dropoutList} role="region" aria-label={t('Сотрудники для обсуждения развития', 'Дамуды талқылауға арналған қызметкерлер', 'Employees for a development conversation')} tabIndex={0}>
    {report.rows.map(row => { const copy = localizeDropoutRow(row, locale); return <article key={row.employeeId} className={styles.dropoutRow} aria-label={t('Поддержка развития {id}', '{id} дамуын қолдау', 'Development support for {id}', { id: row.employeeId })}>
      <details>
      <summary className={styles.dropoutSummary}><span className={styles.dropoutSummaryTitle}>{row.employeeId} · {catalogName(row.role, locale)} / {catalogName(row.grade, locale)}</span><span className={styles.badge}>{t(...dropoutTrendCopy[row.trend])}</span></summary>
      <p>{copy.reason}</p>
      <p className={styles.muted}>{t('Негативные исходы: {current} сейчас / {previous} ранее. По своей инициативе: {self} / {selfBefore}; назначения руководителя: {manager} / {managerBefore}; назначения HR: {hr} / {hrBefore}.', 'Теріс нәтижелер: қазір {current} / бұрын {previous}. Өз бастамасымен: {self} / {selfBefore}; басшы тағайындаған: {manager} / {managerBefore}; HR тағайындаған: {hr} / {hrBefore}.', 'Negative outcomes: {current} now / {previous} previously. Self-selected: {self} / {selfBefore}; manager-assigned: {manager} / {managerBefore}; HR-assigned: {hr} / {hrBefore}.', { current: number(row.current.negative), previous: number(row.previous.negative), self: number(row.current.self.negative), selfBefore: number(row.previous.self.negative), manager: number(row.current.manager.negative), managerBefore: number(row.previous.manager.negative), hr: number(row.current.hr.negative), hrBefore: number(row.previous.hr.negative) })}</p>
      <p><strong>{t('Действие HR:', 'HR әрекеті:', 'HR action:')}</strong> {copy.suggestedAction}</p>
      {row.current.overdue > 0 && <p className={styles.muted}>{t('Отдельный контекст просрочки: обязательных — {mandatory}; всего — {total}. Эти записи не входят в негативные исходы развития.', 'Мерзімі өткендер бөлек: міндетті — {mandatory}; барлығы — {total}. Бұл жазбалар дамудың теріс нәтижелеріне кірмейді.', 'Overdue context, separately: mandatory — {mandatory}; total — {total}. These records do not count as negative development outcomes.', { mandatory: number(row.current.mandatory.statuses.overdue), total: number(row.current.overdue) })}</p>}
      </details>
    </article>; })}
    </div>}
    <details className={styles.action}><summary>{t('Обязательные активности и просрочки отдельно', 'Міндетті іс-шаралар мен мерзімі өткендер бөлек', 'Mandatory activities and overdue records separately')}</summary>
      <p>{t('Обязательных записей за период: {total}, ранее: {previous}. Завершено: {completed}; в процессе: {active}; неявок: {noShow}; прерываний: {dropped}; отказов: {declined}; просрочено: {overdue}.', 'Кезеңдегі міндетті жазбалар: {total}, бұрын: {previous}. Аяқталғаны: {completed}; орындалуда: {active}; келмегені: {noShow}; тоқтатқаны: {dropped}; бас тартқаны: {declined}; мерзімі өткені: {overdue}.', 'Mandatory records in this period: {total}, previously: {previous}. Completed: {completed}; in progress: {active}; no-shows: {noShow}; dropped: {dropped}; declined: {declined}; overdue: {overdue}.', { total: number(report.current.mandatory.total), previous: number(report.previous.mandatory.total), completed: number(report.current.mandatory.statuses.completed), active: number(report.current.mandatory.statuses.in_progress), noShow: number(report.current.mandatory.statuses.no_show), dropped: number(report.current.mandatory.statuses.dropped), declined: number(report.current.mandatory.statuses.declined), overdue: number(report.current.mandatory.statuses.overdue) })}</p>
      <p className={styles.muted}>{t('Все записи с просрочкой: {current}, ранее: {previous}. Просрочки учитываются отдельно независимо от источника назначения.', 'Мерзімі өткен барлық жазбалар: {current}, бұрын: {previous}. Тағайындау көзіне қарамастан, олар бөлек есептеледі.', 'All overdue records: {current}, previously: {previous}. Overdue records are counted separately regardless of assignment source.', { current: number(report.current.overdue), previous: number(report.previous.overdue) })}</p>
    </details>
  </section>;
}
