"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEmployeeStore } from "@/state/EmployeeStoreProvider";
import styles from "./app-shell.module.css";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { isLocale, LOCALES, localeNames } from "@/lib/i18n/core";

function Icon({ name, size = 20 }: { name: "path" | "chart" | "shield" | "upload" | "book"; size?: number }) {
  const paths = {
    path: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><path d="M17.5 14v7m-3.5-3.5h7" /></>,
    chart: <><path d="M4 4v16h16M8 15v-4m5 4V7m5 8V3" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8.5 11.5 2.5 2.5 4.5-5" /></>,
    upload: <><path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5" /></>,
    book: <><path d="M12 5v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2z" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const sections = [
  { href: "/employee", label: "Моя траектория", kk: "Менің даму жолым", en: "My career path", icon: "path" as const },
  { href: "/hr", label: "HR-аналитика", kk: "HR талдауы", en: "HR analytics", icon: "chart" as const },
  { href: "/trust", label: "Проверка решений", kk: "Шешімдерді тексеру", en: "Decision assurance", icon: "shield" as const },
];
export function AppShell({ children, access, onAccessChange }: {
  children: ReactNode;
  access: "employee" | "hr";
  onAccessChange: (access: "employee" | "hr") => void;
}) {
  const path = usePathname();
  const router = useRouter();
  const { locale, setLocale, t, number } = useI18n();
  const dataset = useEmployeeStore((s) => s.dataset);
  const selectedId = useEmployeeStore((s) => s.selectedEmployeeId);
  const count = useEmployeeStore((s) => s.ledger.length);
  const employee = dataset?.employees.find((e) => e.id === selectedId);
  const current = sections.find((s) => s.href === path);
  const initials = employee?.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("") ?? "CQ";
  const changeMode = (next: "employee" | "hr") => {
    if (next !== access) onAccessChange(next);
    if (next === "employee" && (path === "/hr" || path === "/trust")) router.push("/employee");
    if (next === "hr" && path === "/employee") router.push("/hr");
  };
  return <div className={styles.shell}>
    <a href="#page-content" className={styles.skip}>{t("К содержимому", "Мазмұнға өту", "Skip to content")}</a>
    <aside className={styles.sidebar}>
      <Link href="/employee" className={styles.brand} aria-label={t("Career Quest — главная", "Career Quest — басты бет", "Career Quest — home")}>
        <span className={styles.mark}><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M8 23V12m8 11V7m8 16V3" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path d="m6 8 9-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></span>
        <span>Career<span className={styles.light}>Quest</span></span>
      </Link>
      <nav aria-label={t("Разделы приложения", "Қолданба бөлімдері", "App navigation")} className={styles.navigation}>
        {sections.map((section) => <Link key={section.href} href={section.href} aria-current={path === section.href ? "page" : undefined} className={path === section.href ? styles.active : undefined}>
          <Icon name={section.icon} /><span>{t(section.label, section.kk, section.en)}</span><span className={styles.navDot} />
        </Link>)}
      </nav>
      {path === "/employee" && <div className={styles.personalLinks}>
        <p className={styles.caption}>{t("МОЁ РАЗВИТИЕ", "МЕНІҢ ДАМУЫМ", "MY DEVELOPMENT")}</p>
        <nav className={styles.anchors} aria-label={t("Разделы профиля", "Профиль бөлімдері", "Profile sections")}>
          <a href="#recommendations"><span className={styles.anchorDot} />{t("Рекомендации", "Ұсыныстар", "Recommendations")}</a>
          <a href="#career-path"><span className={styles.anchorDot} />{t("Карьерный план", "Мансап жоспары", "Career plan")}</a>
          <a href="#progress-log"><span className={styles.anchorDot} />{t("История прогресса", "Ілгерілеу тарихы", "Progress history")}{count > 0 && <span className={styles.count}>{number(count)}</span>}</a>
        </nav>
      </div>}
      <div className={styles.bottom}>
        <Link href="/employee#data-upload" className={styles.uploadLink}><Icon name="upload" size={18} />{dataset ? t("Данные пространства", "Жұмыс кеңістігінің деректері", "Workspace data") : t("Загрузить данные", "Деректерді жүктеу", "Upload data")}</Link>
        <details className={styles.help}>
          <summary><Icon name="book" size={18} />{t("Как это работает", "Бұл қалай жұмыс істейді", "How it works")}</summary>
          <ol><li>{t("Выберите профиль.", "Профильді таңдаңыз.", "Choose a profile.")}</li><li>{t("Примерьте рекомендованный шаг.", "Ұсынылған қадамның нәтижесін алдын ала көріңіз.", "Preview a recommended step.")}</li><li>{t("Подтвердите завершение — прогресс обновится во всех разделах.", "Орындалғанын растаңыз — ілгерілеу барлық бөлімде жаңарады.", "Confirm completion to update progress across all sections.")}</li></ol>
        </details>
        <div className={styles.partner}><span className={styles.partnerDot} />CAREER QUEST<span>HackAlem AI</span></div>
      </div>
    </aside>
    <div className={styles.body}>
      <header className={styles.header}>
        <div className={styles.breadcrumb}><Icon name={current?.icon ?? "path"} size={17} /><strong>{current ? t(current.label, current.kk, current.en) : t("Карьерное развитие", "Мансаптық даму", "Career development")}</strong></div>
        <div className={styles.headerActions}>
          <span className={styles.session} aria-live="polite"><i />{dataset ? t("Данные загружены", "Деректер жүктелді", "Data loaded") : t("Демо", "Демо", "Demo")}</span>
          <label className={styles.mode}><span>{t("Язык", "Тіл", "Language")}</span><select id="interface-locale" data-testid="locale-select" aria-label={t("Язык интерфейса", "Интерфейс тілі", "Interface language")} value={locale} onChange={(e) => { if (isLocale(e.target.value)) setLocale(e.target.value); }}>{LOCALES.map((language) => <option key={language} value={language} lang={language}>{localeNames[language]}</option>)}</select></label>
          <div className={styles.mode}>
            <span>{t("Режим демо", "Демо режимі", "Demo mode")}</span>
            <div className={styles.modeSwitch} role="group" aria-label={t("Режим демо", "Демо режимі", "Demo mode")}>
              <button type="button" data-testid="mode-employee" aria-pressed={access === "employee"} onClick={() => changeMode("employee")}>{t("Сотрудник", "Қызметкер", "Employee")}</button>
              <button type="button" data-testid="mode-hr" aria-pressed={access === "hr"} onClick={() => changeMode("hr")}>HR</button>
            </div>
          </div>
          <Link href="/employee#career-main" className={styles.userAvatar} aria-label={employee ? t("Профиль: {name}", "Профиль: {name}", "Profile: {name}", { name: employee.name }) : t("Кабинет сотрудника", "Қызметкер кабинеті", "Employee workspace")} title={employee?.name ?? t("Кабинет сотрудника", "Қызметкер кабинеті", "Employee workspace")}>{initials}</Link>
        </div>
      </header>
      <div id="page-content" tabIndex={-1} className={styles.content}>{children}</div>
    </div>
  </div>;
}
