"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { catalogName } from "@/lib/i18n/domain";
import {
  ChatApiError,
  chatApi,
  type Mentor,
  type MentorCatalog,
  type ThreadSummary,
} from "./api";
import { chatError } from "./copy";
import { RequestDialog } from "./RequestDialog";
import styles from "./chat.module.css";

function departmentName(
  value: string,
  t: (ru: string, kk: string, en: string) => string,
) {
  const names: Record<string, string> = {
    "Backend Development": t(
      "Серверная разработка",
      "Серверлік әзірлеу",
      "Backend Development",
    ),
    "Frontend Development": t(
      "Клиентская разработка",
      "Клиенттік әзірлеу",
      "Frontend Development",
    ),
    "Customer Support": t(
      "Поддержка клиентов",
      "Клиенттерді қолдау",
      "Customer Support",
    ),
    "Data & Analytics": t(
      "Данные и аналитика",
      "Деректер және аналитика",
      "Data & Analytics",
    ),
    Sales: t("Продажи", "Сату", "Sales"),
    "Human Resources": t(
      "Управление персоналом",
      "Персоналды басқару",
      "Human Resources",
    ),
    "Product Management": t(
      "Управление продуктом",
      "Өнімді басқару",
      "Product Management",
    ),
    "Quality Assurance": t(
      "Обеспечение качества",
      "Сапаны қамтамасыз ету",
      "Quality Assurance",
    ),
  };
  return names[value] ?? value;
}

export function MentorSearch({
  employeeId,
  catalog,
  initialSkill,
  initialMentor,
  onCreated,
  onExpired,
}: {
  employeeId: string;
  catalog: MentorCatalog;
  initialSkill?: string;
  initialMentor?: string;
  onCreated: (thread: ThreadSummary) => void;
  onExpired: () => void;
}) {
  const { t, locale, number } = useI18n();
  const [skill, setSkill] = useState(
    initialSkill ??
      catalog.criticalGaps[0]?.skillId ??
      catalog.skills[0]?.id ??
      "",
  );
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    skillId: string;
    requiredLevel: number;
    mentors: Mentor[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Mentor | null>(null);
  const [epoch, setEpoch] = useState(0);
  const expired = useRef(onExpired);
  expired.current = onExpired;
  const openedMentor = useRef<string | null>(null);
  useEffect(() => {
    if (
      !initialMentor ||
      !result ||
      result.skillId !== initialSkill ||
      openedMentor.current === `${initialSkill}:${initialMentor}`
    )
      return;
    openedMentor.current = `${initialSkill}:${initialMentor}`;
    const mentor = result.mentors.find(
      (item) => item.employeeId === initialMentor && item.available,
    );
    if (mentor) setChosen(mentor);
  }, [initialMentor, initialSkill, result]);
  useEffect(() => {
    if (initialSkill) setSkill(initialSkill);
  }, [initialSkill]);
  useEffect(() => {
    if (!skill) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setResult(null);
    setChosen(null);
    const params = new URLSearchParams({ skillId: skill });
    if (department) params.set("department", department);
    if (role) params.set("role", role);
    if (availableOnly) params.set("availableOnly", "true");
    void chatApi<{ skillId: string; requiredLevel: number; mentors: Mentor[] }>(
      `/api/mentorship/search?${params}`,
      { signal: controller.signal, employeeId },
    )
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        const code =
          caught instanceof ChatApiError ? caught.code : "SERVICE_UNAVAILABLE";
        setError(code);
        if (code === "AUTH_REQUIRED" || code === "SESSION_CHANGED")
          expired.current();
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [skill, department, role, availableOnly, epoch, employeeId]);
  const gapIds = new Set(catalog.criticalGaps.map((gap) => gap.skillId));
  return (
    <section
      className={styles.searchPanel}
      aria-labelledby="mentor-search-title"
    >
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="mentor-search-title">
            {t(
              "Найдите коллегу по навыку",
              "Дағды бойынша әріптесті табыңыз",
              "Find a colleague by skill",
            )}
          </h2>
          <p>
            {t(
              "Выберите навык и отправьте личный запрос о помощи.",
              "Дағдыны таңдап, жеке көмек сұрауын жіберіңіз.",
              "Choose a skill and send a personal mentoring request.",
            )}
          </p>
        </div>
      </div>
      <div className={styles.filters}>
        <label className={styles.field}>
          <span>{t("Навык", "Дағды", "Skill")}</span>
          <select
            value={skill}
            onChange={(event) => setSkill(event.target.value)}
          >
            {!!catalog.criticalGaps.length && (
              <optgroup
                label={t(
                  "Критичные для вашей цели",
                  "Мақсатыңыз үшін маңызды",
                  "Critical for your goal",
                )}
              >
                {catalog.skills
                  .filter((item) => gapIds.has(item.id))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {catalogName(item.name, locale)}
                    </option>
                  ))}
              </optgroup>
            )}
            <optgroup label={t("Все навыки", "Барлық дағдылар", "All skills")}>
              {catalog.skills
                .filter((item) => !gapIds.has(item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {catalogName(item.name, locale)}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        <label className={styles.field}>
          <span>{t("Отдел", "Бөлім", "Department")}</span>
          <select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="">
              {t("Все отделы", "Барлық бөлімдер", "All departments")}
            </option>
            {catalog.departments.map((item) => (
              <option key={item} value={item}>
                {departmentName(item, t)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>{t("Роль", "Рөл", "Role")}</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="">
              {t("Все роли", "Барлық рөлдер", "All roles")}
            </option>
            {catalog.roles.map((item) => (
              <option key={item} value={item}>
                {catalogName(item, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(event) => setAvailableOnly(event.target.checked)}
          />
          <span>
            {t("Только доступные", "Тек қолжетімділер", "Available only")}
          </span>
        </label>
      </div>
      <div className={styles.searchMeta}>
        <span aria-live="polite">
          {loading
            ? t("Ищем коллег…", "Әріптестерді іздеуде…", "Finding colleagues…")
            : result
              ? t(
                  "Найдено: {count} · нужный уровень: {level}",
                  "Табылды: {count} · қажетті деңгей: {level}",
                  "Found: {count} · required level: {level}",
                  {
                    count: number(result.mentors.length),
                    level: number(result.requiredLevel),
                  },
                )
              : ""}
        </span>
        <button
          className={styles.textButton}
          type="button"
          disabled={loading}
          onClick={() => setEpoch((value) => value + 1)}
        >
          {t("Обновить", "Жаңарту", "Refresh")}
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {chatError(error, t)}
        </p>
      )}
      {!loading && result?.mentors.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            ⌕
          </span>
          <h3>
            {t(
              "Пока нет подходящих коллег",
              "Әзірге лайықты әріптес жоқ",
              "No matching colleagues yet",
            )}
          </h3>
          <p>
            {t(
              "Попробуйте другой навык или уберите фильтры.",
              "Басқа дағдыны таңдаңыз немесе сүзгілерді алып тастаңыз.",
              "Try another skill or clear the filters.",
            )}
          </p>
          <button
            className={styles.secondary}
            type="button"
            onClick={() => {
              setDepartment("");
              setRole("");
              setAvailableOnly(false);
            }}
          >
            {t("Сбросить фильтры", "Сүзгілерді тазалау", "Clear filters")}
          </button>
        </div>
      )}
      <div className={styles.mentorGrid} aria-busy={loading}>
        {result?.mentors.map((mentor) => (
          <article className={styles.mentorCard} key={mentor.employeeId}>
            <div className={styles.mentorTop}>
              <div className={styles.avatar} aria-hidden="true">
                {mentor.fullName
                  .split(/\s+/)
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <span
                className={`${styles.availabilityBadge} ${mentor.available ? styles.available : styles.unavailable}`}
              >
                {mentor.available
                  ? t("Доступен", "Қолжетімді", "Available")
                  : t("Недоступен", "Қолжетімсіз", "Unavailable")}
              </span>
            </div>
            <h3>{mentor.fullName}</h3>
            <p>
              {catalogName(mentor.role, locale)} ·{" "}
              {catalogName(mentor.grade, locale)}
            </p>
            <div className={styles.skillLevel}>
              <span>{catalogName(skill, locale)}</span>
              <strong>
                {number(mentor.skillLevel)}
                <small> / {number(5)}</small>
              </strong>
            </div>
            <button
              type="button"
              className={styles.secondary}
              disabled={!mentor.available}
              onClick={() => setChosen(mentor)}
            >
              {t("Попросить о помощи", "Көмек сұрау", "Ask for help")}{" "}
              <span aria-hidden="true">↗</span>
            </button>
          </article>
        ))}
      </div>
      {chosen && (
        <RequestDialog
          mentor={chosen}
          skillId={skill}
          employeeId={employeeId}
          onClose={() => setChosen(null)}
          onExpired={onExpired}
          onCreated={(thread) => {
            setChosen(null);
            onCreated(thread);
          }}
        />
      )}
    </section>
  );
}
