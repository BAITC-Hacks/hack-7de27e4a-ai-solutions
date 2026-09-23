"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEmployeeStore } from "@/state/EmployeeStoreProvider";
import styles from "./app-shell.module.css";

const sections = [
  { href: "/employee", label: "Моя траектория", symbol: "◈" },
  { href: "/hr", label: "HR-аналитика", symbol: "◫" },
  { href: "/trust", label: "AI Trust Center", symbol: "◎" },
];
export function AppShell({
  children,
  access,
  onAccessChange,
}: {
  children: ReactNode;
  access: "employee" | "hr";
  onAccessChange: (access: "employee" | "hr") => void;
}) {
  const path = usePathname();
  const dataset = useEmployeeStore((s) => s.dataset);
  const count = useEmployeeStore((s) => s.ledger.length);
  const current = sections.find((s) => s.href === path);
  return (
    <div className={styles.shell}>
      <a href="#page-content" className={styles.skip}>
        К содержимому
      </a>
      <aside className={styles.sidebar}>
        <Link href="/employee" className={styles.brand}>
          <span className={styles.mark}>cq↗</span>
          <span>
            career<span className={styles.light}>quest</span>
          </span>
        </Link>
        <p className={styles.caption}>ПРОСТРАНСТВО РАЗВИТИЯ</p>
        <nav aria-label="Разделы приложения" className={styles.navigation}>
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              aria-current={path === s.href ? "page" : undefined}
              className={path === s.href ? styles.active : undefined}
            >
              <span aria-hidden="true">{s.symbol}</span>
              {s.label}
            </Link>
          ))}
        </nav>
        {path === "/employee" && (
          <nav className={styles.anchors} aria-label="Разделы профиля">
            <a href="#recommendations">Следующий шаг</a>
            <a href="#career-path">Карьерный план</a>
            <a href="#progress-log">История прогресса</a>
          </nav>
        )}
        <div className={styles.bottom}>
          <span>● Одна сессия во всех разделах</span>
          <p>
            Рекомендации, прогресс и аналитика используют ваши загруженные
            данные.
          </p>
        </div>
      </aside>
      <div className={styles.body}>
        <header className={styles.header}>
          <div>
            <span className={styles.breadcrumb}>Career Quest / </span>
            <strong>{current?.label ?? "Карьерное развитие"}</strong>
            <p className={styles.session} aria-live="polite">
              {dataset
                ? `${dataset.employees.length} сотрудников · Завершений в сессии: ${count}`
                : "Начните с загрузки данных в кабинете сотрудника"}
            </p>
          </div>
          <label className={styles.mode}>
            Режим демо
            <select
              aria-label="Режим демо"
              value={access}
              onChange={(e) =>
                onAccessChange(e.target.value === "hr" ? "hr" : "employee")
              }
            >
              <option value="employee">Сотрудник</option>
              <option value="hr">HR</option>
            </select>
          </label>
        </header>
        <div id="page-content" tabIndex={-1} className={styles.content}>
          {children}
        </div>
      </div>
    </div>
  );
}
