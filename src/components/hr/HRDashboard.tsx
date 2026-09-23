'use client';
import { useMemo, useState } from 'react';
import { selectHRAnalytics } from '../../domain/analytics/selectors';
import type { AnalyticsInput } from '../../domain/analytics/types';
import styles from './dashboard.module.css';

const statusLabels = { completed: 'Завершено', in_progress: 'В процессе', dropped: 'Прервано', no_show: 'Неявка', declined: 'Отклонено', overdue: 'Просрочено' };
const assignmentLabels = { self: 'По своей инициативе', manager: 'Назначил руководитель', hr: 'Назначил HR' };
const pct = (n: number | null) => n === null ? 'Нет данных' : `${Math.round(n * 100)}%`;
export interface ActionBrief { title: string; rationale: string; nextStep: string }

export function HRDashboard({ input }: { input: AnalyticsInput }) {
  const [role, setRole] = useState('');
  const [brief, setBrief] = useState<ActionBrief | null>(null);
  const roles = [...new Set(input.employees.map(e => e.target?.role ?? e.role))].sort();
  const effectiveRole = roles.includes(role) ? role : '';
  const filtered = useMemo(() => {
    if (!effectiveRole) return input;
    const employees = input.employees.filter(e => (e.target?.role ?? e.role) === effectiveRole);
    const ids = new Set(employees.map(e => e.employeeId));
    return { employees, history: input.history.filter(row => ids.has(row.employeeId)) };
  }, [input, effectiveRole]);
  const analytics = useMemo(() => {
    try { return { result: selectHRAnalytics(filtered), error: false }; }
    catch { return { result: null, error: true }; }
  }, [filtered]);
  if (!analytics.result) return <div className={styles.notice} role="alert">Не удалось посчитать аналитику. Проверьте связи профилей и истории в загруженных данных.</div>;
  const data = analytics.result;
  if (!input.employees.length) return <div className={styles.empty}><h2>Данные ещё не загружены</h2><p>Загрузите профили, навыки, активности и историю на экране сотрудника.</p><a href="/employee">Перейти к загрузке</a></div>;
  const voluntaryTotal = Object.values(data.statuses).reduce((sum, n) => sum + n, 0);
  const download = () => {
    const blob = new Blob([JSON.stringify({ ...brief, scope: effectiveRole || 'Все роли', note: 'Проект решения для HR; событие не создано и сообщения не отправлены.' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'career-quest-hr-action.json'; anchor.click(); URL.revokeObjectURL(url);
  };
  return <>
    <div className={styles.hero}><div><div className={styles.eyebrow}>HR Command Center</div><h1>Развитие, которое<br />двигает команду вперёд.</h1><p className={styles.muted}>Дефицит навыков, доступность программ и решения для HR.</p></div>
      <label>Целевая роль<br /><select aria-label="Целевая роль" value={effectiveRole} onChange={event => setRole(event.target.value)}><option value="">Все роли</option>{roles.map(item => <option key={item}>{item}</option>)}</select></label></div>
    <div className={styles.stats}>
      <div className={styles.stat}><span>Охват рекомендациями</span><strong>{pct(data.coverage)}</strong><span className={styles.muted}>{data.coveredEmployees} из {data.employeesWithTarget} с карьерной целью</span></div>
      <div className={styles.stat}><span>Без следующего шага</span><strong>{data.noStepEmployees}</strong><span className={styles.muted}>Нужна доступная программа</span></div>
      <div className={styles.stat}><span>Средняя готовность</span><strong>{pct(data.meanReadiness)}</strong><span className={styles.muted}>Для профилей с целью</span></div>
      <div className={styles.stat}><span>Критичный дефицит</span><strong>{data.weightedCriticalGap}</strong><span className={styles.muted}>Сумма разрывов с весом ×2</span></div>
    </div>
    {data.employeesWithoutTarget > 0 && <p className={styles.muted}>{data.employeesWithoutTarget} профилей без карьерной цели исключены из знаменателя охвата.</p>}
    <div className={styles.grid}><div>
      <section className={styles.panel}><div className={styles.panelHead}><div><h2>Где рост команды замедляется</h2><p className={styles.muted}>Разрывы по целевой роли и грейду. Критичные навыки имеют вес ×2.</p></div><span className={styles.badge}>Навыки × роли</span></div>
        <div className={styles.scroll}><table><caption className={styles.muted}>Агрегаты без рейтинга сотрудников</caption><thead><tr><th>Навык</th><th>Роль / грейд</th><th>Сотрудников</th><th>Вес разрыва</th></tr></thead><tbody>{data.gaps.map(g => <tr key={`${g.role}:${g.grade}:${g.skillId}`}><td>{g.skillId}</td><td>{g.role} / {g.grade}</td><td>{g.affectedEmployees}</td><td><span className={`${styles.heat} ${g.criticalEmployees ? styles.hot : ''}`}>{g.weightedGap}</span></td></tr>)}</tbody></table></div>
        {!data.gaps.length && <p>Дефицита навыков по текущим целям нет.</p>}
        <div className={styles.action}><button className={`${styles.button} ${styles.secondary}`} onClick={() => setBrief({ title: 'План развития по критичным навыкам', rationale: `Взвешенный критичный дефицит: ${data.weightedCriticalGap}.`, nextStep: 'Выберите программу из блока ожидаемого эффекта и согласуйте её с владельцем целевой роли.' })}>Подготовить план развития</button></div>
      </section>
      <section className={styles.panel}><h2>Ожидаемый эффект программ</h2><p className={styles.muted}>Вклад одного прохождения среди подходящих сотрудников. Это прогноз по gain, не измеренный результат обучения.</p>
        <div className={styles.scroll}><table><thead><tr><th>Активность</th><th>Охват</th><th>Закрытие разрыва</th><th>Действие</th></tr></thead><tbody>{data.programImpact.map(p => <tr key={p.activityId}><td>{p.activityId}</td><td>{p.employees}</td><td>{p.weightedGapClosure}</td><td><button className={`${styles.button} ${styles.secondary}`} onClick={() => setBrief({ title: `Запланировать ${p.activityId}`, rationale: `Подходит ${p.employees} сотрудникам; прогноз закрытия критичных разрывов: ${p.criticalGapClosure}.`, nextStep: 'Проверьте вместимость и согласуйте дополнительную сессию с владельцем программы.' })}>План сессии</button></td></tr>)}</tbody></table></div>
        {!data.programImpact.length && <p>Сейчас нет подходящих программ с положительным вкладом.</p>}
      </section>
    </div><div>
      <section className={styles.panel}><h2>Участие в развитии</h2><p className={styles.muted}>Добровольные активности · {voluntaryTotal} записей</p>{Object.entries(data.statuses).map(([status, count]) => <div key={status}><div className={styles.row}><span>{statusLabels[status as keyof typeof statusLabels]}</span><b>{count}</b></div><div className={styles.bar}><span style={{ width: voluntaryTotal ? `${count / voluntaryTotal * 100}%` : '0%' }} /></div></div>)}
        {!voluntaryTotal && <p>История добровольного участия отсутствует.</p>}
        <details className={styles.action}><summary>Обязательные активности отдельно</summary>{Object.entries(data.mandatoryStatuses).map(([status, count]) => <p key={status}>{statusLabels[status as keyof typeof statusLabels]}: {count}</p>)}</details>
        <button className={`${styles.button} ${styles.secondary}`} onClick={() => setBrief({ title: 'Проверить формат участия', rationale: `Неявки: ${data.statuses.no_show}; прерывания: ${data.statuses.dropped}.`, nextStep: 'Сопоставьте расписание и длительность программ с рабочей нагрузкой. Обсудите с руководителями причину, прежде чем менять назначения.' })}>Подготовить разбор</button>
      </section>
      <section className={styles.panel}><h2>Инициатива и назначения</h2>{data.engagement.map(e => <div className={styles.action} key={e.assignedBy}><b>{assignmentLabels[e.assignedBy]}</b><span>{pct(e.completionRate)} завершений · {e.total} записей</span></div>)}<p className={styles.muted}>Завершённые / все конечные статусы. Записи в процессе и обязательные активности исключены.</p>
        <button className={`${styles.button} ${styles.secondary}`} onClick={() => setBrief({ title: 'Обсудить поддержку руководителей', rationale: 'Сравнение инициативного и назначенного участия основано на отдельных группах.', nextStep: 'Проведите обсуждение доступности программ без публичного сравнения сотрудников.' })}>План обсуждения</button>
      </section>
    </div></div>
    <section className={styles.panel}><h2>Где каталогу нужна поддержка</h2><p className={styles.muted}>«Нет шага» означает отсутствие доступного прироста сейчас; «несколько шагов» — ни одна текущая активность не закрывает весь разрыв. Это не доказательство отсутствия многошагового пути.</p>
      {data.catalogGaps.map(g => <div key={g.skillId} className={styles.action}><div className={styles.row}><div><b>{g.skillId}</b><span className={styles.muted}>Нет шага: {g.noAvailableStep} · Нужны несколько шагов: {g.needsMultipleSteps}</span></div><button className={`${styles.button} ${styles.secondary}`} onClick={() => setBrief({ title: `Расширить каталог: ${g.skillId}`, rationale: `Нет доступного прироста для ${g.noAvailableStep}; одного шага недостаточно для ${g.needsMultipleSteps}.`, nextStep: 'Проверьте prerequisites и доступность сессий. Если подходящих программ действительно нет, подготовьте новую программу с нужным уровнем навыка.' })}>Проект программы</button></div></div>)}
      {!data.catalogGaps.length && <p>Текущие разрывы покрываются доступными активностями.</p>}
    </section>
    {brief && <section aria-label="Проект действия HR" role="status" className={`${styles.panel} ${styles.brief}`}><div className={styles.panelHead}><h2>{brief.title}</h2><button className={`${styles.button} ${styles.secondary}`} onClick={() => setBrief(null)}>Закрыть</button></div><p>{brief.rationale}</p><p>{brief.nextStep}</p><p className={styles.muted}>Проект для согласования. Назначения и сообщения не отправляются автоматически.</p><button className={styles.button} onClick={download}>Скачать проект действия</button></section>}
  </>;
}
