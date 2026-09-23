'use client';
import { useEffect, useRef, useState } from 'react';
import { useTrustIntegration } from '../trust/integration';
import { agentRoles, createAgentTools } from '../../lib/evaluation/agent-tools';
import { partialAgentSummary, runHRAgent, type AgentRunResult } from '../../lib/evaluation/agent-client';
import type { AgentHistoryEntry } from '../../lib/evaluation/agent-contracts';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { catalogName } from '@/lib/i18n/domain';
import { agentStatusCopy, agentToolCopy, localizeAgentReason } from './panel-localization';
import styles from './dashboard.module.css';

export function HRAgentPanel({ concealEmployeeIds = false }: { concealEmployeeIds?: boolean } = {}) {
  const { locale, t, number } = useI18n();
  const integration = useTrustIntegration();
  const snapshot = integration?.agentSnapshot;
  const [availability, setAvailability] = useState<'checking' | 'available' | 'no_key' | 'unavailable'>('checking');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<AgentHistoryEntry[]>([]);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [stale, setStale] = useState(false);
  const active = useRef<AbortController | null>(null);
  const lastSnapshot = useRef(snapshot);
  const employeeId = snapshot?.selectedEmployeeId;
  const language = locale;

  useEffect(() => {
    if (integration?.access !== 'hr') return;
    const controller = new AbortController();
    let mounted = true;
    const timer = setTimeout(() => controller.abort(), 5000);
    fetch('/api/ai/agent', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Unavailable');
      const info: unknown = await response.json();
      if (controller.signal.aborted) return;
      setAvailability(info && typeof info === 'object' && 'status' in info && info.status === 'available' ? 'available'
        : info && typeof info === 'object' && 'status' in info && info.status === 'no_key' ? 'no_key' : 'unavailable');
    }).catch(() => { if (mounted) setAvailability('unavailable'); }).finally(() => clearTimeout(timer));
    return () => { mounted = false; clearTimeout(timer); controller.abort(); };
  }, [integration?.access]);
  useEffect(() => {
    if (lastSnapshot.current !== snapshot) {
      lastSnapshot.current = snapshot;
      if (active.current || result) setStale(true);
      active.current?.abort();
    }
  }, [snapshot, result]);
  useEffect(() => () => active.current?.abort(), []);

  if (integration?.access !== 'hr' || !snapshot?.normalizedDataset) return null;
  const source = snapshot.normalizedDataset;
  const roles = agentRoles(source);
  const employeeIds = Object.keys(source.employeesById).sort((left, right) => right.length - left.length);
  const concealedEmployeeLabel = t('профиль сотрудника', 'қызметкер профилі', 'employee profile');
  const conceal = (value: string) => concealEmployeeIds
    ? employeeIds.reduce((result, id) => result.replaceAll(id, concealedEmployeeLabel), value)
    : value;
  const visibleEmployeeId = concealEmployeeIds ? undefined : employeeId;
  const skillId = integration.challenge?.employee.gaps.find(gap => gap.critical && gap.required > gap.current)?.skillId;
  const suggestions = [
    t('Покажи навыки, для которых каталог не даёт следующего шага.', 'Каталог келесі қадамды ұсынбайтын дағдыларды көрсет.', 'Show skills for which the catalog provides no next step.'),
    ...(visibleEmployeeId ? [t('Покажи критические разрывы {id} и его рекомендации. Используй оба инструмента.', '{id} қызметкерінің сыни алшақтықтары мен ұсыныстарын көрсет. Екі құралды да қолдан.', 'Show the critical gaps and recommendations for {id}. Use both tools.', { id: visibleEmployeeId })] : []),
    ...(skillId ? [t('Проверь покрытие {id} и найди сотрудников с уровнем не ниже 4.', '{id} қамтылуын тексеріп, деңгейі 4-тен төмен емес қызметкерлерді тап.', 'Check coverage of {id} and find employees at level 4 or above.', { id: skillId })] : []),
  ];
  const start = async (text = question) => {
    if (busy || availability !== 'available' || !text.trim()) return;
    const controller = new AbortController();
    active.current = controller;
    setQuestion(text); setBusy(true); setResult(null); setHistory([]); setStale(false);
    const answer = await runHRAgent({ question: text, language, signal: controller.signal,
      execute: createAgentTools(snapshot), onStep: steps => setHistory(steps) });
    if (active.current === controller) {
      setResult(answer); setHistory(answer.history); setBusy(false); active.current = null;
    }
  };
  return <section className={`${styles.panel} ${styles.agentPanel}`} aria-labelledby="hr-agent-title">
    <div className={styles.panelHead}><div><div className={styles.eyebrow}>{t('AI · ответы по данным', 'AI · деректерге негізделген жауаптар', 'AI · answers grounded in data')}</div><h2 id="hr-agent-title">{t('Спросить HR-агента', 'HR агентіне сұрақ қою', 'Ask the HR agent')}</h2>
      <p className={styles.muted}>{t('Вопрос по всей загруженной базе. Агент получает проверенные факты через инструменты, до 5 шагов за 30 секунд.', 'Жүктелген барлық деректер бойынша сұрақ қойыңыз. Агент құралдар арқылы расталған деректерді алады: 30 секундта 5 қадамға дейін.', 'Ask about the entire loaded dataset. The agent retrieves verified facts through tools, up to 5 steps in 30 seconds.')}</p></div>
      <span className={styles.badge}>{availability === 'available' ? t('AI настроен', 'AI бапталған', 'AI configured') : availability === 'checking' ? t('Проверяем настройки', 'Баптаулар тексерілуде', 'Checking configuration') : availability === 'no_key' ? t('Без ключа · отключён', 'Кілт жоқ · өшірулі', 'No API key · disabled') : t('Временно недоступен', 'Уақытша қолжетімсіз', 'Temporarily unavailable')}</span></div>
    {availability === 'no_key' && <p className={styles.notice}>{t('Ключ LLM_API_KEY не настроен. Аналитика и рекомендации доступны полностью.', 'LLM_API_KEY кілті бапталмаған. Талдау мен ұсыныстар толық қолжетімді.', 'LLM_API_KEY is not configured. Analytics and recommendations remain fully available.')}</p>}
    {availability === 'unavailable' && <p className={styles.notice}>{t('Сервис агента недоступен. Пользуйтесь аналитикой ниже и повторите после обновления страницы.', 'Агент қызметі қолжетімсіз. Төмендегі талдауды пайдаланып, бетті жаңартқаннан кейін қайталаңыз.', 'The agent service is unavailable. Use the analytics below and try again after refreshing the page.')}</p>}
    <form onSubmit={event => { event.preventDefault(); void start(); }}>
      <label htmlFor="hr-agent-question">{t('Ваш вопрос', 'Сұрағыңыз', 'Your question')}</label>
      <textarea id="hr-agent-question" className={styles.agentQuestion} maxLength={1200} rows={3} value={question} onChange={event => setQuestion(event.target.value)}
        placeholder={visibleEmployeeId ? t('Например: какие разрывы у {id} и что рекомендует движок?', 'Мысалы: {id} қызметкерінде қандай алшақтықтар бар және қозғалтқыш не ұсынады?', 'For example: what gaps does {id} have and what does the engine recommend?', { id: visibleEmployeeId }) : t('Например: какие навыки не покрывает каталог?', 'Мысалы: каталог қандай дағдыларды қамтымайды?', 'For example: which skills are not covered by the catalog?')} disabled={busy || availability !== 'available'} />
      <div className={styles.agentControls}><button className={styles.button} disabled={busy || availability !== 'available' || !question.trim()} type="submit">{busy ? t('Агент собирает факты…', 'Агент деректерді жинауда…', 'The agent is gathering facts…') : t('Получить ответ', 'Жауап алу', 'Get answer')}</button>
        {busy && <button className={`${styles.button} ${styles.secondary}`} type="button" onClick={() => active.current?.abort()}>{t('Остановить', 'Тоқтату', 'Stop')}</button>}
        <span className={styles.muted}>{number(question.length)}/{number(1200)}</span></div>
    </form>
    <div className={styles.agentSuggestions}>{suggestions.map(text => <button key={text} className={`${styles.button} ${styles.secondary}`} disabled={busy || availability !== 'available'} onClick={() => void start(text)}>{text}</button>)}</div>
    <details className={styles.action}><summary>{t('Коды ролей для фильтра поиска', 'Іздеу сүзгісіне арналған рөл кодтары', 'Role codes for the search filter')}</summary><p className={styles.muted}>{t('Для вопроса о конкретной роли используйте её код. Названия из датасета остаются в интерфейсе.', 'Нақты рөл туралы сұрақта оның кодын қолданыңыз. Деректердегі атаулар интерфейсте көрсетіледі.', 'Use the role code when asking about a specific role. Dataset names are displayed in the interface.')}</p>{roles.map(role => <p key={role.id}><code>{role.id}</code> — {catalogName(role.label, locale)}</p>)}</details>
    {stale && <p className={styles.notice} role="status">{t('Данные или выбранный сотрудник изменились. Запустите вопрос заново для актуального ответа.', 'Деректер немесе таңдалған қызметкер өзгерді. Өзекті жауап алу үшін сұрақты қайта жіберіңіз.', 'The data or selected employee changed. Run the question again for an up-to-date answer.')}</p>}
    {result && <div className={styles.agentAnswer} role="status"><h3>{t(...agentStatusCopy[result.status])}</h3><p className={styles.muted}>{t('Шагов: {steps} · {latency} мс', 'Қадамдар: {steps} · {latency} мс', 'Steps: {steps} · {latency} ms', { steps: number(result.history.length), latency: number(result.latencyMs) })}{result.reason ? ` · ${localizeAgentReason(result.reason, locale)}` : ''}</p><p className={styles.agentText}>{conceal(result.status === 'verified' ? result.text : partialAgentSummary(result.history, locale))}</p>{result.status === 'verified' && <p className={styles.muted}>{t('Проверка сверяет числа и ссылки с результатами инструментов. Смысл выводов оценивает HR; исходные факты доступны в шагах ниже.', 'Тексеру сандар мен сілтемелерді құрал нәтижелерімен салыстырады. Қорытындылардың мағынасын HR бағалайды; бастапқы деректер төмендегі қадамдарда бар.', 'Verification checks numbers and references against tool results. HR evaluates the conclusions; the original facts are available in the steps below.')}</p>}</div>}
    {(busy || history.length > 0) && <div className={styles.action}><h3>{t('Как агент это посчитал', 'Агент мұны қалай есептеді', 'How the agent worked this out')}</h3>{history.map((entry, index) => <details key={entry.result.evidenceId} className={styles.agentStep}>
      <summary>{t('Шаг {step}. {tool} · фактов: {facts}', '{step}-қадам. {tool} · деректер: {facts}', 'Step {step}. {tool} · facts: {facts}', { step: number(index + 1), tool: t(...agentToolCopy[entry.call.name]), facts: number(entry.result.facts.length) })}</summary>
      <p><code>{entry.result.evidenceId}</code></p><pre>{conceal(JSON.stringify({ arguments: entry.call.arguments, facts: entry.result.facts }, null, 2))}</pre>
    </details>)}{busy && <p aria-live="polite">{t('Ожидаем следующий шаг…', 'Келесі қадамды күтудеміз…', 'Waiting for the next step…')}</p>}</div>}
  </section>;
}
