'use client';
import type { ReactNode } from 'react';
import { useTrustIntegration } from './integration';
import styles from '../hr/dashboard.module.css';

export function Surface({ active, children }: { active: 'hr' | 'trust'; children: ReactNode }) {
  return <main className={styles.page}><nav className={styles.nav} aria-label="Разделы приложения"><span className={styles.brand}>Career Quest<span aria-hidden="true"> ↗</span></span><a href="/employee">Сотрудник</a><a href="/hr" aria-current={active === 'hr' ? 'page' : undefined}>HR Command Center</a><a href="/trust" aria-current={active === 'trust' ? 'page' : undefined}>AI Trust Center</a></nav>{children}</main>;
}
export function IntegrationGate({ children }: { children: ReactNode }) {
  const integration = useTrustIntegration();
  if (!integration) return <div className={styles.empty}><h1>Данные ещё не подключены</h1><p>Раздел станет доступен после подключения общего состояния приложения.</p><a href="/employee">К экрану сотрудника</a></div>;
  if (integration.access !== 'hr') return <div className={styles.empty}><h1>Раздел для HR</h1><p>Используйте свой кабинет для просмотра личного плана развития.</p><a href="/employee">Открыть кабинет</a></div>;
  if (integration.state === 'loading') return <p role="status" className={styles.empty}>Готовим данные…</p>;
  if (integration.state === 'invalid') return <div role="alert" className={styles.notice}>Файлы не прошли проверку. Исправьте ошибки импорта на экране сотрудника.</div>;
  return <>{children}</>;
}
