"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useTrustIntegration } from "./integration";
import styles from "../hr/dashboard.module.css";

export function Surface({
  children,
}: {
  active: "hr" | "trust";
  children: ReactNode;
}) {
  return <main className={styles.page}>{children}</main>;
}
export function IntegrationGate({ children }: { children: ReactNode }) {
  const integration = useTrustIntegration();
  if (!integration)
    return (
      <div className={styles.empty}>
        <h1>Данные ещё не подключены</h1>
        <p>
          Раздел станет доступен после подключения общего состояния приложения.
        </p>
        <Link href="/employee">К экрану сотрудника</Link>
      </div>
    );
  if (integration.access !== "hr")
    return (
      <div className={styles.empty}>
        <h1>Раздел для HR</h1>
        <p>
          Для просмотра аналитики переключите «Режим демо» на HR в верхней
          панели.
        </p>
        <Link href="/employee">Открыть кабинет</Link>
      </div>
    );
  if (integration.state === "loading")
    return (
      <p role="status" className={styles.empty}>
        Готовим данные…
      </p>
    );
  if (integration.state === "invalid")
    return (
      <div role="alert" className={styles.notice}>
        Файлы не прошли проверку. Исправьте ошибки импорта на экране сотрудника.
      </div>
    );
  return <>{children}</>;
}
