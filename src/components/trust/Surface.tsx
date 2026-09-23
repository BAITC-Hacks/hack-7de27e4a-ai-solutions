"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useDemoMode } from "@/components/app/DemoModeContext";
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
function DataRequired({ notConnected = false }: { notConnected?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={styles.empty}>
      <StateIcon />
      <h1>
        {notConnected
          ? t(
              "Данные ещё не подключены",
              "Деректер әлі қосылмады",
              "Data is not connected yet",
            )
          : t(
              "Данные ещё не загружены",
              "Деректер әлі жүктелмеді",
              "No data loaded yet",
            )}
      </h1>
      <p>
        {notConnected
          ? t(
              "Подключите данные в кабинете сотрудника.",
              "Қызметкер кабинетінде деректерді қосыңыз.",
              "Connect data in the employee workspace.",
            )
          : t(
              "Загрузите файлы или откройте демо в кабинете сотрудника.",
              "Қызметкер кабинетінде файлдарды жүктеңіз немесе демоны ашыңыз.",
              "Upload files or open the demo in the employee workspace.",
            )}
      </p>
      <Link
        className={styles.button}
        href={notConnected ? "/employee" : "/employee#data-upload"}
      >
        {notConnected
          ? t(
              "К экрану сотрудника",
              "Қызметкер экранына",
              "Go to employee workspace",
            )
          : t("Перейти к загрузке", "Жүктеуге өту", "Go to upload")}
      </Link>
    </div>
  );
}
export function IntegrationGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const demoMode = useDemoMode();
  const integration = useTrustIntegration();
  if (!integration) return <DataRequired notConnected />;
  if (integration.access !== "hr")
    return (
      <div className={styles.empty}>
        <StateIcon locked />
        <h1>{t("Раздел для HR", "HR бөлімі", "HR section")}</h1>
        <p>
          {t(
            "Переключитесь на HR. Ваш профиль и прогресс сохранятся.",
            "HR режиміне ауысыңыз. Профиліңіз бен ілгерілеуіңіз сақталады.",
            "Switch to HR. Your profile and progress will be kept.",
          )}
        </p>
        <div className={styles.gateActions}>
          <button
            type="button"
            className={styles.button}
            disabled={!demoMode}
            onClick={() => demoMode?.setAccess("hr")}
          >
            {t("Перейти в режим HR", "HR режиміне өту", "Switch to HR mode")}
          </button>
          <Link
            className={`${styles.button} ${styles.secondary}`}
            href="/employee"
          >
            {t(
              "Вернуться к сотруднику",
              "Қызметкерге оралу",
              "Back to employee",
            )}
          </Link>
        </div>
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
  if (!integration.analytics) return <DataRequired />;
  return <>{children}</>;
}
