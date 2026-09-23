'use client';
import { useEffect, useRef, useState } from 'react';
import { useTrustIntegration } from '../trust/integration';
import { agentRoles, createAgentTools } from '../../lib/evaluation/agent-tools';
import { runHRAgent, type AgentRunResult } from '../../lib/evaluation/agent-client';
import type { AgentHistoryEntry } from '../../lib/evaluation/agent-contracts';
import styles from './dashboard.module.css';

const statuses: Record<AgentRunResult['status'], string> = {
  verified: 'Числа и ссылки проверены', no_key: 'Агент отключён: ключ не настроен',
  blocked: 'Ответ заблокирован · показаны только полученные факты', timeout: 'Время истекло · частичный результат',
  step_limit: 'Достигнут лимит шагов · частичный результат', cancelled: 'Запрос остановлен',
};
const toolLabels = { getGaps: 'Проверил разрывы навыков', getRecommendations: 'Получил рекомендации движка', findEmployees: 'Нашёл сотрудников по фильтру', getSkillCoverage: 'Проверил покрытие навыка', getCatalogGaps: 'Проверил пробелы каталога', simulate: 'Посчитал эффект активности' };

export function HRAgentPanel() {
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
  const language = integration?.reviewRequest?.language ?? 'ru';

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
  const skillId = integration.challenge?.employee.gaps.find(gap => gap.critical && gap.required > gap.current)?.skillId;
  const suggestions = [
    'Покажи навыки, для которых каталог не даёт следующего шага.',
    ...(employeeId ? [`Покажи критические разрывы ${employeeId} и его рекомендации. Используй оба инструмента.`] : []),
    ...(skillId ? [`Проверь покрытие ${skillId} и найди сотрудников с уровнем не ниже 4.`] : []),
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
    <div className={styles.panelHead}><div><div className={styles.eyebrow}>AI · grounded</div><h2 id="hr-agent-title">Спросить HR-агента</h2>
      <p className={styles.muted}>Вопрос по всей загруженной базе. Агент получает проверенные факты через инструменты, до 5 шагов за 30 секунд.</p></div>
      <span className={styles.badge}>{availability === 'available' ? 'AI настроен' : availability === 'checking' ? 'Проверяем настройки' : availability === 'no_key' ? 'Без ключа · отключён' : 'Временно недоступен'}</span></div>
    {availability === 'no_key' && <p className={styles.notice}>Ключ LLM_API_KEY не настроен. Аналитика и рекомендации доступны полностью.</p>}
    {availability === 'unavailable' && <p className={styles.notice}>Сервис агента недоступен. Пользуйтесь аналитикой ниже и повторите после обновления страницы.</p>}
    <form onSubmit={event => { event.preventDefault(); void start(); }}>
      <label htmlFor="hr-agent-question">Ваш вопрос</label>
      <textarea id="hr-agent-question" className={styles.agentQuestion} maxLength={1200} rows={3} value={question} onChange={event => setQuestion(event.target.value)}
        placeholder={employeeId ? `Например: какие разрывы у ${employeeId} и что рекомендует движок?` : 'Например: какие навыки не покрывает каталог?'} disabled={busy || availability !== 'available'} />
      <div className={styles.agentControls}><button className={styles.button} disabled={busy || availability !== 'available' || !question.trim()} type="submit">{busy ? 'Агент собирает факты…' : 'Получить ответ'}</button>
        {busy && <button className={`${styles.button} ${styles.secondary}`} type="button" onClick={() => active.current?.abort()}>Остановить</button>}
        <span className={styles.muted}>{question.length}/1200</span></div>
    </form>
    <div className={styles.agentSuggestions}>{suggestions.map(text => <button key={text} className={`${styles.button} ${styles.secondary}`} disabled={busy || availability !== 'available'} onClick={() => void start(text)}>{text}</button>)}</div>
    <details className={styles.action}><summary>Коды ролей для фильтра поиска</summary><p className={styles.muted}>Для вопроса о конкретной роли используйте её код. Названия из датасета остаются в интерфейсе.</p>{roles.map(role => <p key={role.id}><code>{role.id}</code> — {role.label}</p>)}</details>
    {stale && <p className={styles.notice} role="status">Данные или выбранный сотрудник изменились. Запустите вопрос заново для актуального ответа.</p>}
    {result && <div className={styles.agentAnswer} role="status"><h3>{statuses[result.status]}</h3><p className={styles.muted}>{result.history.length} шагов · {result.latencyMs} мс{result.reason ? ` · ${result.reason}` : ''}</p><p className={styles.agentText}>{result.text}</p>{result.status === 'verified' && <p className={styles.muted}>Проверка сверяет числа и ссылки с результатами инструментов. Смысл выводов оценивает HR; исходные факты доступны в шагах ниже.</p>}</div>}
    {(busy || history.length > 0) && <div className={styles.action}><h3>Как агент это посчитал</h3>{history.map((entry, index) => <details key={entry.result.evidenceId} className={styles.agentStep}>
      <summary>Шаг {index + 1}. {toolLabels[entry.call.name]} · {entry.result.facts.length} фактов</summary>
      <p><code>{entry.result.evidenceId}</code></p><pre>{JSON.stringify({ arguments: entry.call.arguments, facts: entry.result.facts }, null, 2)}</pre>
    </details>)}{busy && <p aria-live="polite">Ожидаем следующий шаг…</p>}</div>}
  </section>;
}
