"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/I18nProvider";
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
function StateIcon({ locked = false }: { locked?: boolean }) {
  return (
    <span className={styles.emptyIcon} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {locked ? (
          <>
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
          </>
        ) : (
          <>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M7 2v6M17 2v6M3 11h18M8 15h2M14 15h2" />
          </>
        )}
      </svg>
    </span>
  );
}
export function IntegrationGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const integration = useTrustIntegration();
  if (!integration)
    return (
      <div className={styles.empty}>
        <StateIcon />
        <h1>
          {t(
            "Данные ещё не подключены",
            "Деректер әлі қосылмады",
            "Data is not connected yet",
          )}
        </h1>
        <p>
          {t(
            "Подключите данные в кабинете сотрудника.",
            "Қызметкер кабинетінде деректерді қосыңыз.",
            "Connect data in the employee workspace.",
          )}
        </p>
        <Link className={styles.button} href="/employee">
          {t(
            "К экрану сотрудника",
            "Қызметкер экранына",
            "Go to employee workspace",
          )}
        </Link>
      </div>
    );
  if (integration.access !== "hr")
    return (
      <div className={styles.empty}>
        <StateIcon locked />
        <h1>{t("Раздел для HR", "HR бөлімі", "HR section")}</h1>
        <p>
          {t(
            "Выберите HR в переключателе «Режим демо».",
            "«Демо режим» ауыстырғышында HR таңдаңыз.",
            "Select HR in the “Demo mode” selector.",
          )}
        </p>
        <Link className={styles.button} href="/employee">
          {t("Открыть кабинет", "Кабинетті ашу", "Open workspace")}
        </Link>
      </div>
    );
  if (integration.state === "loading")
    return (
      <div role="status" className={styles.empty}>
        <StateIcon />
        <h2>
          {t("Готовим данные…", "Деректер дайындалуда…", "Preparing data…")}
        </h2>
      </div>
    );
  if (integration.state === "invalid")
    return (
      <div role="alert" className={styles.notice}>
        {t(
          "Файлы не прошли проверку. Исправьте ошибки импорта на экране сотрудника.",
          "Файлдар тексеруден өтпеді. Қызметкер экранында импорт қателерін түзетіңіз.",
          "File validation failed. Fix import errors on the employee screen.",
        )}
      </div>
    );
  return <>{children}</>;
}
