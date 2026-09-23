"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import {
  previewHrEventImpact,
  safeValidateHrEventDraft,
  nextHrEventId,
  type HrEventDraft,
  type HrEventImpactPreview,
  type HrCreatedEvent,
} from "@/domain/catalog";
import {
  buildActivityCalendar,
  calendarFileName,
} from "@/domain/calendar";
import type { EventFormat, Grade } from "@/lib/contracts";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { catalogName, localizeMessage } from "@/lib/i18n/domain";
import {
  selectDatasetGeneration,
  type EmployeeStore,
} from "@/state/employeeStore";

import styles from "./event-builder.module.css";

type EffectRow = { skillId: string; gain: number; maxLevel: number };
type PrerequisiteRow = { skillId: string; level: number };

export type EventBuilderRequest = Readonly<{
  skillId: string;
  role?: string;
  version: number;
}>;

function downloadCalendar(content: string, name: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

type HrEventBuilderProps = {
  store: EmployeeStore;
  request?: EventBuilderRequest | null;
};

/** Remount form-local state for every successful import, even when metadata is unchanged. */
export function HrEventBuilder(props: HrEventBuilderProps) {
  const datasetGeneration = useStore(props.store, selectDatasetGeneration);
  return <HrEventBuilderSession key={datasetGeneration} {...props} />;
}

function HrEventBuilderSession({
  store,
  request,
}: HrEventBuilderProps) {
  const { locale, t, date: dateLabel, number } = useI18n();
  const dataset = useStore(store, (state) => state.normalizedDataset);
  const hrCreatedEvents = useStore(store, (state) => state.hrCreatedEvents);
  const views = useStore(store, (state) => state.views);
  const addHrEvent = useStore(store, (state) => state.addHrEvent);

  const builderRef = useRef<HTMLDetailsElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("");
  const [format, setFormat] = useState<EventFormat>("self_paced");
  const [duration, setDuration] = useState("2");
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [targetGrades, setTargetGrades] = useState<Grade[]>([]);
  const [effects, setEffects] = useState<EffectRow[]>([
    { skillId: "", gain: 1, maxLevel: 5 },
  ]);
  const [prerequisites, setPrerequisites] = useState<PrerequisiteRow[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [deadline, setDeadline] = useState("");
  const [validationIssues, setValidationIssues] = useState<
    readonly { path: string; message: string }[]
  >([]);
  const [preview, setPreview] = useState<{
    fingerprint: string;
    created: HrCreatedEvent;
    impact: HrEventImpactPreview;
  } | null>(null);
  const [saved, setSaved] = useState<{
    eventId: string;
    expectedAffected: number;
  } | null>(null);

  const eventTypes = useMemo(
    () =>
      dataset
        ? [...new Set(Object.values(dataset.eventsById).map((event) => event.type))].sort()
        : [],
    [dataset],
  );
  const roles = useMemo(
    () =>
      dataset
        ? [...new Set(Object.values(dataset.roleProfilesByKey).map((profile) => profile.role))].sort()
        : [],
    [dataset],
  );
  const grades = useMemo(
    () =>
      dataset
        ? ([...new Set(Object.values(dataset.roleProfilesByKey).map((profile) => profile.grade))] as Grade[])
        : [],
    [dataset],
  );
  const skills = useMemo(
    () => (dataset ? Object.values(dataset.skillsById).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [dataset],
  );
  const datasetKey = dataset
    ? `${dataset.meta.dataset}:${dataset.meta.version}:${dataset.meta.asOfDate}`
    : "";

  useEffect(() => {
    if (!dataset) return;
    setEventType(eventTypes[0] ?? "");
    setTargetRoles(roles);
    setTargetGrades(grades);
    setEffects([{ skillId: skills[0]?.id ?? "", gain: 1, maxLevel: 5 }]);
    setSessions([]);
    setPreview(null);
    setSaved(null);
    setValidationIssues([]);
  }, [datasetKey]); // Reset only when the imported dataset changes, not after a session event is added.

  useEffect(() => {
    if (!dataset || !request || !dataset.skillsById[request.skillId]) return;
    setEffects((current) => [
      { ...(current[0] ?? { gain: 1, maxLevel: 5 }), skillId: request.skillId },
      ...current.slice(1),
    ]);
    if (request.role && roles.includes(request.role)) setTargetRoles([request.role]);
    setPreview(null);
    setSaved(null);
    setValidationIssues([]);
    if (builderRef.current) {
      builderRef.current.open = true;
      builderRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [request?.version]);

  useEffect(() => {
    if (format === "self_paced") setSessions([]);
    else if (!sessions.length && dataset) setSessions([dataset.meta.asOfDate]);
  }, [format, datasetKey]);

  const draft = useMemo<HrEventDraft>(
    () => ({
      title,
      description,
      type: eventType,
      format,
      duration_hours: Number(duration),
      mandatory: false,
      target_roles: targetRoles,
      target_grades: targetGrades,
      develops_skills: effects.map((effect) => ({
        skill_id: effect.skillId,
        gain: effect.gain,
        max_level: effect.maxLevel,
      })),
      prerequisites: Object.fromEntries(
        prerequisites
          .filter((item) => item.skillId)
          .map((item) => [item.skillId, item.level]),
      ),
      upcoming_sessions: format === "self_paced" ? [] : sessions,
      enrollment_deadline: deadline || undefined,
    }),
    [
      title,
      description,
      eventType,
      format,
      duration,
      targetRoles,
      targetGrades,
      effects,
      prerequisites,
      sessions,
      deadline,
    ],
  );
  const fingerprint = JSON.stringify(draft);
  const previewIsCurrent = preview?.fingerprint === fingerprint;
  const generatedId = dataset ? nextHrEventId(dataset) : "EV_HR_—";

  if (!dataset) return null;

  const toggleRole = (role: string) =>
    setTargetRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    );
  const toggleGrade = (grade: Grade) =>
    setTargetGrades((current) =>
      current.includes(grade)
        ? current.filter((item) => item !== grade)
        : [...current, grade],
    );

  const runPreview = () => {
    const result = safeValidateHrEventDraft(dataset, draft);
    if (!result.success) {
      setValidationIssues(result.error.issues);
      setPreview(null);
      return;
    }
    setValidationIssues([]);
    setSaved(null);
    setPreview({
      fingerprint,
      created: result.data,
      impact: previewHrEventImpact(dataset, result.data.event),
    });
  };

  const save = () => {
    if (!previewIsCurrent || !preview) return;
    const created = addHrEvent(draft);
    if (!created) return;
    setSaved({
      eventId: created.event.id,
      expectedAffected: preview.impact.eligibleEmployeeCount,
    });
    setPreview(null);
    setValidationIssues([]);
  };

  const actualAffected = saved
    ? Object.values(views).filter((view) =>
        view.candidates.some((candidate) => candidate.activityId === saved.eventId),
      ).length
    : null;

  const exportEvent = (created: HrCreatedEvent) => {
    const content = buildActivityCalendar({
      activity: created.event,
      snapshotDate: dataset.meta.asOfDate,
      enrollmentDeadline: created.metadata.enrollmentDeadline,
      calendarName: created.event.title,
    });
    downloadCalendar(content, calendarFileName(created.event.title));
  };

  return (
    <details ref={builderRef} className={styles.builder} open>
      <summary>
        <span>
          {t(
            "Конструктор активности",
            "Іс-шара конструкторы",
            "Activity builder",
          )}
        </span>
        <span className={styles.summaryMeta}>
          {t("Создаёт HR · текущая сессия", "HR жасайды · ағымдағы сессия", "Created by HR · this session")}
        </span>
      </summary>
      <div className={styles.body}>
        <div className={styles.intro}>
          <div>
            <h3>
              {t(
                "Закройте пробел реальной внутренней активностью",
                "Олқылықты нақты ішкі іс-шарамен жабыңыз",
                "Close a catalog gap with a real internal activity",
              )}
            </h3>
            <p>
              {t(
                "После сохранения движок сразу пересчитает доступность и рекомендации для всех профилей.",
                "Сақталғаннан кейін жүйе барлық профиль үшін қолжетімділік пен ұсынымдарды бірден қайта есептейді.",
                "After saving, the engine immediately recalculates eligibility and recommendations for every profile.",
              )}
            </p>
          </div>
          <span className={styles.idBadge}>{generatedId}</span>
        </div>

        <div className={styles.formGrid}>
          <label className={styles.wide}>
            {t("Название", "Атауы", "Title")}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("Например, System Design Lab", "Мысалы, System Design Lab", "For example, System Design Lab")}
            />
          </label>
          <label className={styles.wide}>
            {t("Описание", "Сипаттамасы", "Description")}
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("Что участник сделает и чему научится", "Қатысушы не істейді және нені үйренеді", "What the participant will do and learn")}
            />
          </label>
          <label>
            {t("Тип", "Түрі", "Type")}
            <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
              {eventTypes.map((type) => (
                <option key={type} value={type}>{catalogName(type, locale)}</option>
              ))}
            </select>
          </label>
          <label>
            {t("Формат", "Формат", "Format")}
            <select value={format} onChange={(event) => setFormat(event.target.value as EventFormat)}>
              <option value="self_paced">{t("В своём темпе", "Өз қарқынымен", "Self-paced")}</option>
              <option value="online">{t("Онлайн", "Онлайн", "Online")}</option>
              <option value="offline">{t("Очно", "Офлайн", "In person")}</option>
            </select>
          </label>
          <label>
            {t("Длительность, часов", "Ұзақтығы, сағат", "Duration, hours")}
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          </label>
          <label className={styles.lockedField}>
            {t("Обязательность", "Міндеттілігі", "Mandatory")}
            <span>
              <input type="checkbox" checked={false} disabled readOnly />
              {t("Только добровольная", "Тек ерікті", "Voluntary only")}
            </span>
          </label>
        </div>

        <div className={styles.targetGrid}>
          <fieldset>
            <legend>{t("Целевые роли", "Мақсатты рөлдер", "Target roles")}</legend>
            <div className={styles.checkGrid}>
              {roles.map((role) => (
                <label key={role}>
                  <input
                    type="checkbox"
                    checked={targetRoles.includes(role)}
                    onChange={() => toggleRole(role)}
                  />
                  {catalogName(role, locale)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>{t("Целевые грейды", "Мақсатты деңгейлер", "Target grades")}</legend>
            <div className={styles.checkGrid}>
              {grades.map((grade) => (
                <label key={grade}>
                  <input
                    type="checkbox"
                    checked={targetGrades.includes(grade)}
                    onChange={() => toggleGrade(grade)}
                  />
                  {catalogName(grade, locale)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <section className={styles.subsection}>
          <div className={styles.subsectionHead}>
            <div>
              <h4>{t("Развиваемые навыки", "Дамытылатын дағдылар", "Skills developed")}</h4>
              <p>{t("Прирост ограничен 1–2, максимальный уровень — 5.", "Өсім 1–2 аралығында, ең жоғары деңгей — 5.", "Gain is limited to 1–2 and the maximum level is 5.")}</p>
            </div>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setEffects((current) => [...current, { skillId: skills[0]?.id ?? "", gain: 1, maxLevel: 5 }])}
            >
              {t("+ Навык", "+ Дағды", "+ Skill")}
            </button>
          </div>
          <div className={styles.rows}>
            {effects.map((effect, index) => (
              <div className={styles.effectRow} key={`${index}:${effect.skillId}`}>
                <label>
                  {t("Навык", "Дағды", "Skill")}
                  <select
                    value={effect.skillId}
                    onChange={(event) => setEffects((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, skillId: event.target.value } : item))}
                  >
                    {skills.map((skill) => (
                      <option key={skill.id} value={skill.id}>{catalogName(skill.name, locale)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Прирост", "Өсім", "Gain")}
                  <select
                    value={effect.gain}
                    onChange={(event) => setEffects((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, gain: Number(event.target.value) } : item))}
                  >
                    <option value={1}>+1</option>
                    <option value={2}>+2</option>
                  </select>
                </label>
                <label>
                  {t("Максимальный уровень", "Ең жоғары деңгей", "Max level")}
                  <select
                    value={effect.maxLevel}
                    onChange={(event) => setEffects((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, maxLevel: Number(event.target.value) } : item))}
                  >
                    {[0, 1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}</option>)}
                  </select>
                </label>
                {effects.length > 1 && (
                  <button
                    type="button"
                    className={styles.removeButton}
                    aria-label={t(
                      "Удалить развиваемый навык {skill}, строка {row}",
                      "Дамытылатын {skill} дағдысын жою, {row}-жол",
                      "Remove developed skill {skill}, row {row}",
                      {
                        skill: catalogName(
                          dataset.skillsById[effect.skillId]?.name ?? effect.skillId,
                          locale,
                        ),
                        row: number(index + 1),
                      },
                    )}
                    onClick={() => setEffects((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    {t("Удалить", "Жою", "Remove")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.subsection}>
          <div className={styles.subsectionHead}>
            <div>
              <h4>{t("Предварительные требования", "Алдын ала талаптар", "Prerequisites")}</h4>
              <p>{t("Необязательно. Проверяются тем же механизмом допуска.", "Міндетті емес. Сол қатысу талаптарын тексеру механизмімен тексеріледі.", "Optional. Checked by the same eligibility engine.")}</p>
            </div>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setPrerequisites((current) => [...current, { skillId: skills[0]?.id ?? "", level: 1 }])}
            >
              {t("+ Требование", "+ Талап", "+ Prerequisite")}
            </button>
          </div>
          {!!prerequisites.length && (
            <div className={styles.rows}>
              {prerequisites.map((item, index) => (
                <div className={styles.prerequisiteRow} key={`${index}:${item.skillId}`}>
                  <label>
                    {t("Навык", "Дағды", "Skill")}
                    <select value={item.skillId} onChange={(event) => setPrerequisites((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, skillId: event.target.value } : row))}>
                      {skills.map((skill) => <option key={skill.id} value={skill.id}>{catalogName(skill.name, locale)}</option>)}
                    </select>
                  </label>
                  <label>
                    {t("Уровень", "Деңгей", "Level")}
                    <select value={item.level} onChange={(event) => setPrerequisites((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, level: Number(event.target.value) } : row))}>
                      {[0, 1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={styles.removeButton}
                    aria-label={t(
                      "Удалить требование {skill}, строка {row}",
                      "{skill} талабын жою, {row}-жол",
                      "Remove prerequisite {skill}, row {row}",
                      {
                        skill: catalogName(
                          dataset.skillsById[item.skillId]?.name ?? item.skillId,
                          locale,
                        ),
                        row: number(index + 1),
                      },
                    )}
                    onClick={() => setPrerequisites((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                  >
                    {t("Удалить", "Жою", "Remove")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {format !== "self_paced" && (
          <section className={styles.subsection}>
            <div className={styles.subsectionHead}>
              <div>
                <h4>{t("Будущие сессии", "Алдағы сессиялар", "Upcoming sessions")}</h4>
                <p>{t("Дата среза: {date}", "Деректер күні: {date}", "Dataset snapshot: {date}", { date: dateLabel(dataset.meta.asOfDate) })}</p>
              </div>
              <button type="button" className={styles.secondaryButton} onClick={() => setSessions((current) => [...current, dataset.meta.asOfDate])}>
                {t("+ Сессия", "+ Сессия", "+ Session")}
              </button>
            </div>
            <div className={styles.dateRows}>
              {sessions.map((session, index) => (
                <div key={index}>
                  <input
                    aria-label={t("Дата сессии", "Сессия күні", "Session date")}
                    type="date"
                    min={dataset.meta.asOfDate}
                    value={session}
                    onChange={(event) => setSessions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                  />
                  {sessions.length > 1 && (
                    <button
                      type="button"
                      className={styles.removeButton}
                      aria-label={t(
                        "Удалить сессию {date}, строка {row}",
                        "{date} сессиясын жою, {row}-жол",
                        "Remove session {date}, row {row}",
                        {
                          date: dateLabel(session),
                          row: number(index + 1),
                        },
                      )}
                      onClick={() => setSessions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      {t("Удалить", "Жою", "Remove")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <label className={styles.deadline}>
          {t("Дедлайн записи (не влияет на порядок рекомендаций)", "Тіркелу мерзімі (ұсынымдар ретіне әсер етпейді)", "Enrollment deadline (does not affect ranking)")}
          <input
            type="date"
            min={dataset.meta.asOfDate}
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </label>

        {!!validationIssues.length && (
          <div className={styles.errors} role="alert">
            <strong>{t("Исправьте поля", "Өрістерді түзетіңіз", "Fix these fields")}</strong>
            <ul>
              {validationIssues.map((issue, index) => (
                <li key={`${issue.path}:${index}`}><code>{issue.path}</code> — {localizeMessage(issue.message, locale)}</li>
              ))}
            </ul>
          </div>
        )}

        {previewIsCurrent && preview && (
          <section className={styles.preview} role="status" aria-live="polite" aria-atomic="true">
            <div className={styles.previewHead}>
              <div>
                <span>{t("Предпросмотр до сохранения", "Сақтау алдындағы алдын ала қарау", "Preview before save")}</span>
                <h4>{preview.created.event.title}</h4>
              </div>
              <span>{preview.created.event.id}</span>
            </div>
            <div className={styles.metrics}>
              <div><span>{t("Подходит сотрудникам", "Қызметкерлерге сай", "Eligible employees")}</span><strong>{number(preview.impact.eligibleEmployeeCount)}</strong></div>
              <div><span>{t("Критичные разрывы закрыты", "Маңызды алшақтықтары жабылады", "Critical gaps closed")}</span><strong>{number(preview.impact.criticalAffectedEmployeeCount)}</strong></div>
              <div><span>{t("Без покрытия: до → после", "Қамтусыз: дейін → кейін", "Uncovered: before → after")}</span><strong>{number(preview.impact.criticalUncoveredEmployeesBefore)} → {number(preview.impact.criticalUncoveredEmployeesAfter)}</strong></div>
            </div>
            <p>
              <b>{t("Навыки, которые перестанут быть пробелом:", "Олқылық болудан қалатын дағдылар:", "Skills no longer uncovered:")}</b>{" "}
              {preview.impact.newlyCoveredSkillIds.length
                ? preview.impact.newlyCoveredSkillIds.map((id) => catalogName(dataset.skillsById[id]?.name ?? id, locale)).join(", ")
                : t("нет полного закрытия", "толық жабылмайды", "none fully covered")}
            </p>
          </section>
        )}

        {saved && (
          <div className={styles.success} role="status">
            <strong>{t("Активность создана", "Іс-шара жасалды", "Activity created")}: {saved.eventId}</strong>
            <span>
              {t(
                "Предпросмотр и фактический пересчёт: {expected} = {actual}",
                "Алдын ала және нақты есеп: {expected} = {actual}",
                "Preview and actual recomputation: {expected} = {actual}",
                { expected: number(saved.expectedAffected), actual: number(actualAffected ?? 0) },
              )}
            </span>
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={runPreview}>
            {t("Рассчитать влияние", "Әсерін есептеу", "Calculate impact")}
          </button>
          <button type="button" className={styles.primaryButton} disabled={!previewIsCurrent} onClick={save}>
            {t("Сохранить и пересчитать", "Сақтау және қайта есептеу", "Save and recalculate")}
          </button>
        </div>

        {!!hrCreatedEvents.length && (
          <section className={styles.sessionCatalog}>
            <div>
              <h4>{t("Создано HR в этой сессии", "Осы сессияда HR жасаған", "Created by HR this session")}</h4>
              <p>{t("Повторный импорт набора очистит этот список.", "Деректерді қайта импорттау бұл тізімді тазартады.", "Importing the dataset again clears this list.")}</p>
            </div>
            <div className={styles.createdList}>
              {hrCreatedEvents.map((created) => (
                <article key={created.event.id}>
                  <div>
                    <span>{created.event.id} · {t("Создано HR", "HR жасаған", "Created by HR")}</span>
                    <strong>{created.event.title}</strong>
                    <small>
                      {created.metadata.enrollmentDeadline
                        ? t("Запись до {date}", "Тіркелу {date} дейін", "Enroll by {date}", { date: dateLabel(created.metadata.enrollmentDeadline) })
                        : t("Без дедлайна записи", "Тіркелу мерзімі жоқ", "No enrollment deadline")}
                    </small>
                  </div>
                  <button type="button" className={styles.secondaryButton} onClick={() => exportEvent(created)}>
                    {t("В календарь .ics", "Күнтізбеге .ics", "Add to calendar .ics")}
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </details>
  );
}
