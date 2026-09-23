"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import {
  catalogName,
  localizeMessage,
  localizedExplanation,
  localizedBaseline,
  localizeEvidence,
} from "@/lib/i18n/domain";
import { useEmployeeStore } from "../../state/EmployeeStoreProvider";
import type { Recommendation } from "../../state/intelligenceAdapter";
import type { PathStrategy } from "../../domain/simulation/planner";
import { nearestSession } from "../../domain/simulation/simulator";
import { DatasetUpload } from "./DatasetUpload";
import { Modal } from "./Modal";
import { useEmployeeExplanation } from "./useEmployeeExplanation";
import {
  explanationStatusLabel,
  recommendationExplanation,
} from "./ai-explanation";
import styles from "./employee.module.css";

export function EmployeeWorkspace() {
  const { locale, t, date: dateLabel, number } = useI18n();
  const percent = (value: number | null | undefined) =>
    value == null ? "—" : `${number(Math.round(value * 100))}%`;
  const languageNames = {
    ru: t("Русский", "Орыс тілі", "Russian"),
    kk: t("Казахский", "Қазақ тілі", "Kazakh"),
    en: t("Английский", "Ағылшын тілі", "English"),
  };
  const factorNames: Record<string, string> = {
    targetGapImpact: t(
      "Развитие нужных навыков",
      "Қажетті дағдыларды дамыту",
      "Relevant skill growth",
    ),
    engagementFit: t(
      "История участия",
      "Қатысу тарихы",
      "Participation history",
    ),
    feasibility: t(
      "Доступность активности",
      "Іс-шараның қолжетімділігі",
      "Activity feasibility",
    ),
    goalAlignment: t(
      "Связь с карьерной целью",
      "Мансаптық мақсатқа сәйкестік",
      "Career goal alignment",
    ),
    pathDiversity: t(
      "Разнообразие пути",
      "Даму жолының әртүрлілігі",
      "Path diversity",
    ),
  };
  const strategyNames: Record<PathStrategy, string> = {
    fastest: t("Быстрее к цели", "Мақсатқа жылдам жету", "Fastest"),
    balanced: t("Баланс", "Теңгерімді", "Balanced"),
    stretch: t("Больше роста", "Көбірек даму", "Stretch"),
  };

  const state = useEmployeeStore((s) => s);
  const { dataset, selectedEmployeeId, simulation } = state;
  const employee = dataset?.employees.find((e) => e.id === selectedEmployeeId);
  const view = selectedEmployeeId ? state.views[selectedEmployeeId] : null;
  const explanation = useEmployeeExplanation(
    view,
    locale,
    `${state.revision}:${selectedEmployeeId ?? ""}`,
    state.status === "ready",
  );
  const explanationText = (recommendation: Recommendation) =>
    recommendationExplanation(
      recommendation,
      explanation.result,
      view && dataset
        ? localizedExplanation(recommendation, view, dataset, locale)
        : "",
      locale,
    );
  const [evidence, setEvidence] = useState<{
    primary: Recommendation;
    alternative?: Recommendation;
  } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);
  const noticeKey = `${state.revision}:${state.notice ?? ""}`;
  useEffect(() => {
    setEvidence(null);
    setShowExcluded(false);
  }, [selectedEmployeeId, state.revision]);
  useEffect(() => {
    const reveal = (hash = window.location.hash) => {
      let id: string;
      try {
        id = decodeURIComponent(hash.slice(1));
      } catch {
        return;
      }
      const target = document.getElementById(id);
      if (!target) return;
      const inner = target.querySelector<HTMLDetailsElement>(
        "details[data-disclosure]",
      );
      if (inner) inner.open = true;
      let parent: HTMLElement | null = target;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      target.scrollIntoView({ block: "start" });
      const summary = inner?.querySelector<HTMLElement>("summary");
      // Let native hash navigation and Next's scroll restoration finish first.
      if (summary)
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => {
            if (summary.isConnected) summary.focus({ preventScroll: true });
          }),
        );
    };
    const onHash = () => reveal();
    const onAnchor = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || event.ctrlKey || event.metaKey) return;
      const url = new URL(link.href, window.location.href);
      if (
        url.origin === window.location.origin &&
        url.pathname === window.location.pathname &&
        url.hash
      )
        window.requestAnimationFrame(() => reveal(url.hash));
    };
    reveal();
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onAnchor);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onAnchor);
    };
  }, [!!dataset]);
  const activity = (id: string) => {
    const found = dataset?.activities.find((a) => a.id === id);
    return found
      ? { ...found, title: catalogName(found.title, locale) }
      : undefined;
  };
  const skillName = (id: string) =>
    catalogName(dataset?.skills.find((s) => s.id === id)?.name ?? id, locale);
  const top = view?.recommendations[0];
  const busy = state.status === "loading";
  const plan = (strategy: PathStrategy) => {
    setPlanning(true);
    window.setTimeout(() => {
      try {
        state.plan(strategy);
      } finally {
        setPlanning(false);
      }
    }, 0);
  };
  const renderEvidence = (recommendation: Recommendation) => (
    <div className={styles.evidenceBlock}>
      <h3>
        {activity(recommendation.activityId)?.title ??
          recommendation.activityId}
      </h3>
      <p>{explanationText(recommendation)}</p>
      <div className={styles.factorList}>
        {Object.entries(recommendation.factorScores).map(([name, value]) => (
          <div key={name}>
            <span>{factorNames[name] ?? name}</span>
            <meter
              min={0}
              max={1}
              value={value}
              aria-label={factorNames[name] ?? name}
            />
            <strong>{percent(value)}</strong>
          </div>
        ))}
      </div>
      <dl className={styles.evidenceList}>
        {recommendation.evidence.map((item) => (
          <div key={item.id}>
            <dt>
              {dataset
                ? localizeEvidence(item, dataset, locale).label
                : item.label}
            </dt>
            <dd>
              {dataset
                ? localizeEvidence(item, dataset, locale).value
                : item.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className={styles.muted}>
        {t(" Итоговый балл: ", " Қорытынды ұпай: ", " Total score: ")}
        {number(Number(recommendation.totalScore.toFixed(3)))}
        {t(
          " · Прогноз готовности: ",
          " · Болжамды дайындық: ",
          " · Projected readiness: ",
        )}
        {percent(recommendation.projectedReadiness)}
      </p>
    </div>
  );
  return (
    <div className={styles.workspace}>
      <div className={styles.mainWrap}>
        <main id="career-main" className={styles.main}>
          <div className={styles.titleRow}>
            <div>
              <h1>
                {t("Моя траектория", "Менің даму жолым", "My career path")}
              </h1>
            </div>
          </div>
          {state.error && (
            <div role="alert" className={styles.error}>
              <span>{localizeMessage(state.error, locale)}</span>
              <button className={styles.textButton} onClick={state.clearError}>
                {t(" Закрыть ", " Жабу ", " Close ")}
              </button>
            </div>
          )}
          {state.notice && dismissedNotice !== noticeKey && (
            <div role="status" className={styles.notice}>
              <span>{localizeMessage(state.notice, locale)}</span>
              <button
                className={styles.noticeClose}
                aria-label={t(
                  "Закрыть уведомление",
                  "Хабарламаны жабу",
                  "Dismiss notification",
                )}
                onClick={() => setDismissedNotice(noticeKey)}
              >
                ×
              </button>
            </div>
          )}
          {!state.adapterReady && (
            <div className={styles.empty}>
              <h2>
                {t(
                  "Подключение Intelligence",
                  "Есептеу жүйесін қосу",
                  "Connecting the engine",
                )}
              </h2>
              <p>
                {t(
                  " Интерфейс готов принять общий адаптер команды. После его подключения здесь появятся профиль, доказательства и карьерный план. ",
                  " Есептеу жүйесі қосылғаннан кейін профиль, дәлелдер мен мансаптық жоспар көрсетіледі. ",
                  " Your profile, evidence and career plan will appear when the engine is connected. ",
                )}
              </p>
            </div>
          )}
          <div className={styles.contentGrid}>
            <div className={styles.primaryColumn}>
              {employee && view ? (
                <>
                  <section
                    className={styles.profile}
                    aria-label={t(
                      "Профиль сотрудника",
                      "Қызметкер профилі",
                      "Employee profile",
                    )}
                  >
                    <div className={styles.compactHero}>
                      <div className={styles.heroIdentity}>
                        <div className={styles.person}>
                          <span className={styles.avatar}>
                            {employee.name
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((n) => n[0])
                              .join("")}
                          </span>
                          <div>
                            <label
                              htmlFor="employee-select"
                              className={styles.visuallyHidden}
                            >
                              {t(
                                " Ваш профиль ",
                                " Сіздің профиліңіз ",
                                " Your profile ",
                              )}
                            </label>
                            <select
                              id="employee-select"
                              aria-label={t("ПРОФИЛЬ", "ПРОФИЛЬ", "PROFILE")}
                              value={employee.id}
                              disabled={busy}
                              onChange={(e) =>
                                state.selectEmployee(e.target.value)
                              }
                            >
                              {dataset!.employees.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name} · {e.id}
                                </option>
                              ))}
                            </select>
                            <p>
                              {catalogName(employee.role, locale)}{" "}
                              <span>
                                · {catalogName(employee.grade, locale)}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className={styles.profileGoal}>
                          <span>{t("Цель", "Мақсат", "Goal")}</span>
                          <h2>
                            {view.target
                              ? `${catalogName(view.target.grade, locale)} ${catalogName(view.target.role, locale)}`
                              : t(
                                  "Цель пока не задана",
                                  "Мақсат әлі белгіленбеген",
                                  "No goal set yet",
                                )}
                          </h2>
                        </div>
                      </div>
                      <div
                        className={styles.readinessRing}
                        style={{
                          background: `conic-gradient(#b8f4d6 ${Math.max(0, Math.min(1, view.readiness ?? 0)) * 360}deg, #ffffff26 0deg)`,
                        }}
                      >
                        <div>
                          <strong>{percent(view.readiness)}</strong>
                          <span>
                            {t(
                              "готовность к цели",
                              "мақсатқа дайындық",
                              "goal readiness",
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <details className={styles.profileDetails}>
                      <summary>
                        {t(
                          " О профиле ",
                          " Профиль туралы ",
                          " About this profile ",
                        )}
                        <span aria-hidden="true">⌄</span>
                      </summary>
                      <div className={styles.pills}>
                        <span>{languageNames[employee.preferredLanguage]}</span>
                        <span>{catalogName(employee.workFormat, locale)}</span>
                        <span>
                          {t(" Оценка: ", " Бағалау: ", " Review: ")}
                          {dateLabel(employee.lastReviewDate)}
                        </span>
                        {!!view.replayedActivityIds.length && (
                          <span className={styles.replayBadge}>
                            {t(
                              " ✓ Учтено после оценки:",
                              " ✓ Бағалаудан кейін ескерілді:",
                              " ✓ Included since review:",
                            )}{" "}
                            {number(view.replayedActivityIds.length)}
                          </span>
                        )}
                        <span>
                          {t(
                            " Срез данных: ",
                            " Деректер күні: ",
                            " Snapshot: ",
                          )}
                          {dateLabel(dataset!.snapshotDate)}
                        </span>
                      </div>
                      <p className={styles.muted}>
                        {view.target
                          ? t(
                              "Готовность отражает покрытие требований к навыкам, а не гарантию повышения.",
                              "Дайындық дағды талаптарының орындалуын көрсетеді, бірақ қызметте өсуді кепілдендірмейді.",
                              "Readiness measures skill coverage; it does not guarantee a promotion.",
                            )
                          : t(
                              "Добавьте карьерную цель в профиль, чтобы построить следующие шаги.",
                              "Келесі қадамдарды құру үшін профильге мансаптық мақсат қосыңыз.",
                              "Add a career goal to the profile to plan your next steps.",
                            )}
                      </p>
                    </details>
                  </section>
                  <section
                    id="recommendations"
                    aria-labelledby="recommendation-title"
                  >
                    <div className={styles.sectionHeading}>
                      <div>
                        <h2 id="recommendation-title">
                          {t(
                            "Начните с этого",
                            "Осыдан бастаңыз",
                            "Start here",
                          )}
                        </h2>
                      </div>
                      <span className={styles.tag} role="status">
                        {explanation.status === "verified"
                          ? t(
                              "AI · проверено",
                              "AI · тексерілді",
                              "AI · verified",
                            )
                          : t(
                              "Расчёт движка",
                              "Есептеу нәтижесі",
                              "Engine calculation",
                            )}
                      </span>
                    </div>
                    {!view.recommendations.length && (
                      <div className={styles.empty}>
                        <h3>
                          {view.target
                            ? t(
                                "Сейчас нет доступного следующего шага",
                                "Қазір қолжетімді келесі қадам жоқ",
                                "No next step is available right now",
                              )
                            : t(
                                "Нужна карьерная цель",
                                "Мансаптық мақсат қажет",
                                "A career goal is needed",
                              )}
                        </h3>
                        <p>
                          {t(
                            " Система не предлагает неподходящие активности. HR может уточнить цель или дополнить каталог. ",
                            " Сәйкес келмейтін іс-шаралар ұсынылмайды. HR мақсатты нақтылай немесе каталогты толықтыра алады. ",
                            " Unsuitable activities are excluded. HR can clarify the goal or expand the catalog. ",
                          )}
                        </p>
                      </div>
                    )}
                    <div className={styles.recommendationList}>
                      {view.recommendations.slice(0, 3).map((rec, index) => {
                        const event = activity(rec.activityId);
                        const session =
                          event && nearestSession(event, dataset!.snapshotDate);
                        return (
                          <article
                            key={rec.activityId}
                            className={`${styles.quest} ${index === 0 ? styles.topQuest : ""}`}
                          >
                            <div className={styles.questNumber}>
                              {String(index + 1).padStart(2, "0")}
                            </div>
                            <div className={styles.questBody}>
                              <div className={styles.questMeta}>
                                <span>
                                  {index === 0
                                    ? t(
                                        "Рекомендуем",
                                        "Ұсынамыз",
                                        "Recommended",
                                      )
                                    : t(
                                        "Альтернатива",
                                        "Баламасы",
                                        "Alternative",
                                      )}
                                </span>
                                <span>
                                  {event ? number(event.durationHours) : "—"}
                                  {t(" ч ·", " сағ ·", " h ·")}{" "}
                                  {event?.format === "self_paced"
                                    ? t(
                                        "В своём темпе",
                                        "Өз қарқынымен",
                                        "Self-paced",
                                      )
                                    : event?.format === "online"
                                      ? t("Онлайн", "Онлайн", "Online")
                                      : t("Очно", "Офлайн", "In person")}
                                  {session ? ` · ${dateLabel(session)}` : ""}
                                </span>
                              </div>
                              <h3>{event?.title ?? rec.activityId}</h3>
                              <div className={styles.pills}>
                                {Object.entries(rec.expectedGains).map(
                                  ([id, gain]) => (
                                    <span key={id}>
                                      +{number(gain)} {skillName(id)}
                                    </span>
                                  ),
                                )}
                                <span>
                                  {t(
                                    " Готовность → ",
                                    " Дайындық → ",
                                    " Readiness → ",
                                  )}
                                  {percent(rec.projectedReadiness)}
                                </span>
                              </div>
                              <div className={styles.questActions}>
                                <button
                                  className={
                                    index === 0
                                      ? styles.primaryButton
                                      : styles.secondaryButton
                                  }
                                  disabled={busy}
                                  onClick={() =>
                                    state.previewActivity(rec.activityId)
                                  }
                                >
                                  {t(
                                    " Что изменится?",
                                    " Не өзгереді?",
                                    " What will change?",
                                  )}{" "}
                                  <span aria-hidden="true">↗</span>
                                </button>
                                <button
                                  className={styles.textButton}
                                  onClick={() => setEvidence({ primary: rec })}
                                >
                                  {t(
                                    " Почему это? ",
                                    " Неге осы? ",
                                    " Why this? ",
                                  )}
                                </button>
                                {index > 0 && top && (
                                  <details className={styles.inlineDetails}>
                                    <summary>
                                      {t("Сравнить", "Салыстыру", "Compare")}
                                    </summary>
                                    <button
                                      className={styles.textButton}
                                      onClick={() =>
                                        setEvidence({
                                          primary: top,
                                          alternative: rec,
                                        })
                                      }
                                    >
                                      {t(
                                        " Почему не альтернатива? ",
                                        " Неге баламасы емес? ",
                                        " Why not the alternative? ",
                                      )}
                                    </button>
                                  </details>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                  {!!view.excluded?.length && (
                    <button
                      className={styles.excludedButton}
                      onClick={() => setShowExcluded(true)}
                    >
                      {t(
                        " Почему не другие активности?",
                        " Неге басқа іс-шаралар емес?",
                        " Why not other activities?",
                      )}{" "}
                      <span>
                        {number(view.excluded.length)}
                        {t(
                          " исключено движком ↗",
                          " есептеу арқылы алынып тасталды ↗",
                          " excluded by the engine ↗",
                        )}
                      </span>
                    </button>
                  )}
                  <section
                    className={styles.panel}
                    aria-labelledby="decision-title"
                  >
                    <details data-disclosure className={styles.disclosure}>
                      <summary>
                        <h2 id="decision-title">
                          {t(
                            "Почему именно этот шаг?",
                            "Неге дәл осы қадам?",
                            "Why this particular step?",
                          )}
                        </h2>
                        <span className={styles.disclosureMeta}>
                          {t("Сравнение", "Салыстыру", "Comparison")}
                        </span>
                        <span
                          className={styles.disclosureChevron}
                          aria-hidden="true"
                        >
                          ⌄
                        </span>
                      </summary>
                      <div className={styles.disclosureContent}>
                        <div className={styles.comparison}>
                          <div className={styles.baseline}>
                            <span className={styles.eyebrow}>
                              {t(
                                " Только самый слабый навык ",
                                " Тек ең әлсіз дағды ",
                                " Weakest skill only ",
                              )}
                            </span>
                            <h3>
                              {view.baseline
                                ? (activity(view.baseline.activityId)?.title ??
                                  view.baseline.activityId)
                                : t(
                                    "Базовый вариант не рассчитан",
                                    "Бастапқы салыстыру есептелмеген",
                                    "Baseline not calculated",
                                  )}
                            </h3>
                            <p>
                              {localizedBaseline(view, dataset!, locale) ||
                                t(
                                  "Сравнение появится после расчёта базового варианта.",
                                  "Есептеу жүйесі бастапқы нәтижені бергенде салыстыру пайда болады.",
                                  "The comparison will appear when the engine provides a baseline.",
                                )}
                            </p>
                            <span className={styles.muted}>
                              {t(
                                " Однофакторный ориентир ",
                                " Бір факторлы бағдар ",
                                " Single-factor reference ",
                              )}
                            </span>
                          </div>
                          <div className={styles.engineChoice}>
                            <span className={styles.eyebrow}>
                              {t(
                                " Выбор Career Quest ",
                                " Career Quest таңдауы ",
                                " Career Quest choice ",
                              )}
                            </span>
                            <h3>
                              {top
                                ? activity(top.activityId)?.title
                                : t(
                                    "Нет подходящего шага",
                                    "Сәйкес қадам жоқ",
                                    "No suitable step",
                                  )}
                            </h3>
                            <p>
                              {top
                                ? explanationText(top)
                                : t(
                                    "Подходящие активности появятся после обновления цели или каталога.",
                                    "Мақсат немесе каталог жаңартылғаннан кейін сәйкес іс-шаралар пайда болады.",
                                    "Suitable activities will appear after the goal or catalog is updated.",
                                  )}
                            </p>
                            {top && (
                              <button
                                className={styles.textButton}
                                onClick={() => setEvidence({ primary: top })}
                              >
                                {t(
                                  " Посмотреть доказательства ↗ ",
                                  " Дәлелдерді көру ↗ ",
                                  " View evidence ↗ ",
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </details>
                  </section>
                  <section
                    className={styles.panel}
                    aria-labelledby="skills-title"
                    id="skills"
                  >
                    <details data-disclosure className={styles.disclosure}>
                      <summary>
                        <h2 id="skills-title">
                          {t("Карта навыков", "Дағдылар картасы", "Skill map")}
                        </h2>
                        <span className={styles.disclosureMeta}>
                          {number(view.gaps.length)}
                          {t(
                            " навыков · 0–5 ",
                            " дағды · 0–5 ",
                            " skills · 0–5 ",
                          )}
                        </span>
                        <span
                          className={styles.disclosureChevron}
                          aria-hidden="true"
                        >
                          ⌄
                        </span>
                      </summary>
                      <div className={styles.disclosureContent}>
                        {!view.gaps.length ? (
                          <p className={styles.muted}>
                            {view.target
                              ? t(
                                  "Разрывы по навыкам отсутствуют.",
                                  "Дағдылар бойынша алшақтық жоқ.",
                                  "There are no skill gaps.",
                                )
                              : t(
                                  "Требования появятся после выбора цели.",
                                  "Талаптар мақсат таңдалғаннан кейін пайда болады.",
                                  "Requirements appear after a goal is selected.",
                                )}
                          </p>
                        ) : (
                          <div className={styles.skillTable}>
                            <div className={styles.skillHead}>
                              <span>
                                {t("Компетенция", "Құзырет", "Competency")}
                              </span>
                              <span>
                                {t(
                                  "Сейчас / цель",
                                  "Қазір / мақсат",
                                  "Current / target",
                                )}
                              </span>
                              <span>{t("Развитие", "Даму", "Growth")}</span>
                            </div>
                            {view.gaps.map((gap) => (
                              <div
                                className={styles.skillRow}
                                key={gap.skillId}
                              >
                                <div>
                                  <strong>{skillName(gap.skillId)}</strong>
                                  {gap.critical && (
                                    <span className={styles.critical}>
                                      {t(
                                        " Критично для цели ",
                                        " Мақсат үшін маңызды ",
                                        " Critical for the goal ",
                                      )}
                                    </span>
                                  )}
                                </div>
                                <span>
                                  {number(gap.current)}{" "}
                                  <span className={styles.muted}>
                                    / {number(gap.required)}
                                  </span>
                                </span>
                                <div
                                  className={styles.skillTrack}
                                  role="meter"
                                  aria-label={skillName(gap.skillId)}
                                  aria-valuenow={gap.current}
                                  aria-valuemin={0}
                                  aria-valuemax={5}
                                >
                                  <span
                                    style={{ width: `${gap.current * 20}%` }}
                                  />
                                  <i
                                    style={{ left: `${gap.required * 20}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <details className={styles.allSkills}>
                          <summary>
                            {t(
                              " Все эффективные навыки ( ",
                              " Барлық өзекті дағдылар ( ",
                              " All effective skills ( ",
                            )}
                            {number(Object.keys(view.effectiveSkills).length)})
                          </summary>
                          <dl>
                            {Object.entries(view.effectiveSkills).map(
                              ([id, level]) => (
                                <div key={id}>
                                  <dt>{skillName(id)}</dt>
                                  <dd>{number(level)}/5</dd>
                                </div>
                              ),
                            )}
                          </dl>
                        </details>
                      </div>
                    </details>
                  </section>
                  <section
                    id="career-path"
                    className={styles.panel}
                    aria-labelledby="path-title"
                    aria-busy={planning}
                  >
                    <details data-disclosure className={styles.disclosure}>
                      <summary>
                        <h2 id="path-title">
                          {t(
                            "Ваша карьерная траектория",
                            "Сіздің мансаптық жолыңыз",
                            "Your career path",
                          )}
                        </h2>
                        <span className={styles.disclosureMeta}>
                          {state.path
                            ? t(
                                "Шагов: {count}",
                                "Қадам саны: {count}",
                                "Steps: {count}",
                                { count: number(state.path.steps.length) },
                              )
                            : t(
                                "До 4 шагов",
                                "4 қадамға дейін",
                                "Up to 4 steps",
                              )}
                        </span>
                        <span
                          className={styles.disclosureChevron}
                          aria-hidden="true"
                        >
                          ⌄
                        </span>
                      </summary>
                      <div className={styles.disclosureContent}>
                        <div
                          className={styles.strategyTabs}
                          role="group"
                          aria-label={t(
                            "Стратегия плана",
                            "Жоспар стратегиясы",
                            "Planning strategy",
                          )}
                        >
                          {(Object.keys(strategyNames) as PathStrategy[]).map(
                            (strategy) => (
                              <button
                                key={strategy}
                                disabled={busy || planning || !view.target}
                                aria-pressed={state.strategy === strategy}
                                onClick={() => plan(strategy)}
                              >
                                {strategyNames[strategy]}
                              </button>
                            ),
                          )}
                        </div>
                        {!state.path && (
                          <p className={styles.muted}>
                            {t(
                              " Выберите стратегию, чтобы увидеть возможную последовательность развития. ",
                              " Ықтимал даму ретін көру үшін стратегияны таңдаңыз. ",
                              " Choose a strategy to see a possible development path. ",
                            )}
                          </p>
                        )}
                        {planning && (
                          <p role="status">
                            {t(
                              "Рассчитываем варианты…",
                              "Нұсқалар есептелуде…",
                              "Calculating options…",
                            )}
                          </p>
                        )}
                        {state.path && (
                          <>
                            <div className={styles.pathSummary}>
                              <strong>
                                {percent(state.path.startReadiness)}{" "}
                                <span aria-hidden="true">→</span>{" "}
                                {percent(state.path.projectedReadiness)}
                              </strong>
                              <span>
                                {state.path.reachedTarget
                                  ? t(
                                      "Требования к навыкам покрыты",
                                      "Дағды талаптары орындалды",
                                      "Skill requirements covered",
                                    )
                                  : state.path.reason === "no-target"
                                    ? t(
                                        "Нет карьерной цели",
                                        "Мансаптық мақсат жоқ",
                                        "No career goal",
                                      )
                                    : state.path.reason === "no-candidates"
                                      ? t(
                                          "Нет подходящих активностей",
                                          "Сәйкес іс-шаралар жоқ",
                                          "No suitable activities",
                                        )
                                      : t(
                                          "Прогноз после плана",
                                          "Жоспардан кейінгі болжам",
                                          "Projection after the plan",
                                        )}
                              </span>
                            </div>
                            <ol className={styles.pathList}>
                              {state.path.steps.map((step, index) => (
                                <li key={`${step.activityId}-${index}`}>
                                  <span className={styles.pathDot}>
                                    {index + 1}
                                  </span>
                                  <div>
                                    <strong>
                                      {activity(step.activityId)?.title}
                                    </strong>
                                    <p>
                                      {Object.entries(step.delta)
                                        .map(
                                          ([id, delta]) =>
                                            `+${number(delta)} ${skillName(id)}`,
                                        )
                                        .join(" · ")}
                                    </p>
                                  </div>
                                  <span>
                                    {percent(step.afterView.readiness)}
                                  </span>
                                  {index === 0 && (
                                    <button
                                      className={styles.textButton}
                                      disabled={busy}
                                      onClick={() =>
                                        state.previewActivity(step.activityId)
                                      }
                                    >
                                      {t(
                                        " Примерить ",
                                        " Нәтижесін көру ",
                                        " Preview ",
                                      )}
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ol>
                            {!!state.path.steps.length && (
                              <p className={styles.muted}>
                                {t(
                                  " План — симуляция навыков. Расписание и возможность участия нужно подтвердить отдельно. Завершайте активности последовательно. ",
                                  " Жоспар дағдылардың өзгерісін модельдейді. Кесте мен қатысу мүмкіндігін бөлек растау қажет. Іс-шараларды ретімен аяқтаңыз. ",
                                  " The plan simulates skill growth. Confirm scheduling and availability separately. Complete activities in order. ",
                                )}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </details>
                  </section>
                  <section id="progress-log" className={styles.panel}>
                    <details data-disclosure className={styles.disclosure}>
                      <summary>
                        <h2>
                          {t(
                            "История прогресса",
                            "Даму тарихы",
                            "Progress history",
                          )}
                        </h2>
                        <span className={styles.disclosureMeta}>
                          {
                            state.ledger.filter(
                              (e) => e.employeeId === employee.id,
                            ).length
                          }{" "}
                          {t(" завершено ", " аяқталды ", " completed ")}
                        </span>
                        <span
                          className={styles.disclosureChevron}
                          aria-hidden="true"
                        >
                          ⌄
                        </span>
                      </summary>
                      <div className={styles.disclosureContent}>
                        {!state.ledger.some(
                          (e) => e.employeeId === employee.id,
                        ) ? (
                          <p className={styles.muted}>
                            {t(
                              " Подтверждённые активности появятся здесь. Исходные файлы сохраняют прежние значения. ",
                              " Расталған іс-шаралар осында көрсетіледі. Бастапқы файлдардағы мәндер өзгермейді. ",
                              " Confirmed activities appear here. Original files keep their existing values. ",
                            )}
                          </p>
                        ) : (
                          <ol className={styles.ledgerList}>
                            {state.ledger
                              .filter((e) => e.employeeId === employee.id)
                              .map((entry) => (
                                <li key={entry.id}>
                                  <strong>
                                    ✓ {activity(entry.activityId)?.title}
                                  </strong>
                                  <p>
                                    {Object.keys(entry.delta)
                                      .map(
                                        (id) =>
                                          `${skillName(id)}: ${number(entry.before[id] ?? 0)} → ${number(entry.after[id])}`,
                                      )
                                      .join(" · ")}
                                  </p>
                                  <span className={styles.muted}>
                                    {dateLabel(entry.completedAt)}
                                  </span>
                                </li>
                              ))}
                          </ol>
                        )}
                      </div>
                    </details>
                  </section>
                </>
              ) : (
                <div className={styles.welcome}>
                  <div className={styles.welcomeArt} aria-hidden="true">
                    <svg
                      width="340"
                      height="175"
                      viewBox="0 0 340 175"
                      fill="none"
                    >
                      <path
                        d="M24 138h70c28 0 25-52 57-52h26c35 0 29-51 60-51h81"
                        stroke="#bddfcc"
                        strokeWidth="2"
                        strokeDasharray="6 7"
                      />
                      <rect
                        x="17"
                        y="109"
                        width="91"
                        height="49"
                        rx="14"
                        fill="#fff"
                        stroke="#dfece5"
                      />
                      <circle cx="41" cy="134" r="11" fill="#eef8f3" />
                      <path
                        d="m37 134 3 3 5-6"
                        stroke="#00875a"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M61 129h31m-31 10h20"
                        stroke="#b6c9bf"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      <rect
                        x="128"
                        y="62"
                        width="91"
                        height="49"
                        rx="14"
                        fill="#fff"
                        stroke="#c1e3d0"
                      />
                      <circle cx="152" cy="86" r="11" fill="#00875a" />
                      <path
                        d="M149 89l6-6m-6 0h6v6"
                        stroke="#fff"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <path
                        d="M173 81h30m-30 10h20"
                        stroke="#9ec7b0"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      <circle cx="278" cy="35" r="27" fill="#00875a" />
                      <path
                        d="m271 39 12-12m-12 0h12v12"
                        stroke="white"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <circle
                        cx="278"
                        cy="35"
                        r="34"
                        stroke="#00875a"
                        strokeOpacity=".14"
                        strokeWidth="7"
                      />
                    </svg>
                  </div>
                  <h2>
                    {dataset
                      ? t(
                          "В наборе нет сотрудников",
                          "Жиында қызметкерлер жоқ",
                          "There are no employees in this dataset",
                        )
                      : t(
                          "Выберите следующий шаг",
                          "Келесі қадамды таңдаңыз",
                          "Choose your next step",
                        )}
                  </h2>
                  <p>
                    {dataset
                      ? t(
                          "Загрузите набор с хотя бы одним профилем сотрудника.",
                          "Кемінде бір қызметкер профилі бар жиынды жүктеңіз.",
                          "Upload a dataset containing at least one employee profile.",
                        )
                      : t(
                          "Загрузите профиль или откройте демо, чтобы увидеть рекомендации и прогноз роста.",
                          "Ұсыныстар мен даму болжамын көру үшін профильді жүктеңіз немесе демоны ашыңыз.",
                          "Upload a profile or open the demo to see recommendations and projected growth.",
                        )}
                  </p>
                  <a className={styles.secondaryButton} href="#upload-title">
                    {t(
                      " Начать с демо или своих данных",
                      " Демодан немесе өз деректеріңізден бастау",
                      " Start with demo or your data",
                    )}{" "}
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>
              )}
            </div>
            <aside
              className={styles.contextColumn}
              aria-label={t(
                "Данные и текущие активности",
                "Деректер және ағымдағы іс-шаралар",
                "Data and current activities",
              )}
            >
              <DatasetUpload />
              {employee && view && (
                <>
                  <section className={styles.panel}>
                    <details
                      className={styles.disclosure}
                      open={view.activeActivityIds.length > 0}
                    >
                      <summary>
                        <h2>
                          {t(
                            "Активный путь",
                            "Ағымдағы даму жолы",
                            "Active journey",
                          )}
                        </h2>
                        <span className={styles.disclosureMeta}>
                          {number(view.activeActivityIds.length)}
                          {t(" в работе ", " орындалуда ", " in progress ")}
                        </span>
                        <span
                          className={styles.disclosureChevron}
                          aria-hidden="true"
                        >
                          ⌄
                        </span>
                      </summary>
                      <div className={styles.disclosureContent}>
                        {!view.activeActivityIds.length ? (
                          <p className={styles.muted}>
                            {t(
                              " Нет активностей в процессе. ",
                              " Орындалып жатқан іс-шаралар жоқ. ",
                              " No activities are in progress. ",
                            )}
                          </p>
                        ) : (
                          view.activeActivityIds.map((id) => {
                            const record = dataset?.history.find(
                              (h) =>
                                h.employeeId === employee.id &&
                                h.activityId === id &&
                                h.status === "in_progress",
                            );
                            return (
                              <div key={id} className={styles.activeJourney}>
                                <strong>{activity(id)?.title ?? id}</strong>
                                {record?.completionPct != null && (
                                  <>
                                    <progress
                                      max={100}
                                      value={record.completionPct}
                                      aria-label={t(
                                        "Прогресс: {activity}",
                                        "Ілгерілеу: {activity}",
                                        "Progress: {activity}",
                                        { activity: activity(id)?.title ?? id },
                                      )}
                                    />
                                    <span>
                                      {number(record.completionPct)}
                                      {t(
                                        "% выполнено ",
                                        "% орындалды ",
                                        "% complete ",
                                      )}
                                    </span>
                                  </>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </details>
                  </section>
                  <details className={styles.methodDetails}>
                    <summary>
                      {t(
                        "Как устроены рекомендации",
                        "Ұсыныстар қалай жасалады",
                        "How recommendations work",
                      )}
                    </summary>
                    <p className={styles.muted}>
                      {t(
                        " Учитываются цель, навыки, история участия, доступность активности и разнообразие пути. ",
                        " Мақсат, дағдылар, қатысу тарихы, іс-шараның қолжетімділігі және даму жолының әртүрлілігі ескеріледі. ",
                        " Recommendations consider your goal, skills, participation history, activity feasibility and path diversity. ",
                      )}
                    </p>
                    <p className={styles.muted}>
                      {t("Движок: ", "Есептеу жүйесі: ", "Engine: ")}
                      {view.engineVersion}
                    </p>
                    {!dataset?.history.some(
                      (h) => h.employeeId === employee.id,
                    ) && (
                      <p className={styles.muted}>
                        {t(
                          " История участия отсутствует. Это не должно снижать оценку сотрудника. ",
                          " Қатысу тарихы жоқ. Бұл қызметкердің бағасын төмендетпеуі тиіс. ",
                          " No participation history is available. This must not lower the employee's assessment. ",
                        )}
                      </p>
                    )}
                  </details>
                </>
              )}
            </aside>
          </div>
          <footer className={styles.footer}>
            <span>Career Quest · Halyk / HackAlem AI</span>
          </footer>
        </main>
      </div>
      {showExcluded && (
        <Modal
          drawer
          title={t(
            "Почему не другие активности",
            "Неге басқа іс-шаралар емес",
            "Why not other activities",
          )}
          onClose={() => setShowExcluded(false)}
        >
          <p className={styles.muted}>
            {t(
              " Причины исключения предоставлены движком Intelligence. ",
              " Алып тастау себептерін есептеу жүйесі анықтайды. ",
              " Exclusion reasons are provided by the recommendation engine. ",
            )}
          </p>
          {view?.excluded?.map((item) => (
            <div key={item.activityId} className={styles.evidenceBlock}>
              <h3>{catalogName(item.title, locale)}</h3>
              <ul>
                {item.reasons.map((reason, i) => (
                  <li key={i}>{localizeMessage(reason, locale)}</li>
                ))}
              </ul>
            </div>
          ))}
        </Modal>
      )}
      {evidence && (
        <Modal
          drawer
          title={
            evidence.alternative
              ? t(
                  "Сравнение доказательств",
                  "Дәлелдерді салыстыру",
                  "Evidence comparison",
                )
              : t(
                  "Почему эта рекомендация",
                  "Неге осы ұсыныс",
                  "Why this recommendation",
                )
          }
          onClose={() => setEvidence(null)}
        >
          <span className={styles.tag} role="status">
            {explanationStatusLabel(explanation.status, locale)}
          </span>
          {renderEvidence(evidence.primary)}
          {evidence.alternative && (
            <>
              {renderEvidence(evidence.alternative)}
              <p className={styles.muted}>
                {t(
                  " Сравните факторы и подтверждённые факты обеих рекомендаций. Порядок задан движком Intelligence. ",
                  " Екі ұсыныстың факторлары мен расталған деректерін салыстырыңыз. Ретті есептеу жүйесі белгілейді. ",
                  " Compare the factors and verified facts for both recommendations. Their order is set by the engine. ",
                )}
              </p>
            </>
          )}
          <details className={styles.methodDetails}>
            <summary>
              {t(
                "Методика и версия",
                "Әдістеме және нұсқа",
                "Method and version",
              )}
            </summary>
            <p className={styles.muted}>
              {t(
                " Порядок рекомендаций определён движком. AI проверяет объяснения по подтверждённым фактам. Версия: ",
                " Ұсыныстардың ретін есептеу жүйесі анықтайды. AI түсіндірмелерді расталған деректер бойынша тексереді. Нұсқа: ",
                " The engine determines recommendation order. AI checks explanations against verified facts. Version: ",
              )}
              {view?.engineVersion}.
            </p>
          </details>
        </Modal>
      )}
      {simulation && (
        <Modal
          title={t(
            "Что изменится после завершения",
            "Аяқтағаннан кейін не өзгереді",
            "What changes after completion",
          )}
          onClose={state.cancelPreview}
        >
          <h3>{activity(simulation.step.activityId)?.title}</h3>
          <p className={styles.muted}>
            {t(
              " Проверьте ожидаемый результат. Подтверждайте только действительно завершённую активность. ",
              " Күтілетін нәтижені тексеріңіз. Тек шынымен аяқталған іс-шараны растаңыз. ",
              " Review the expected result. Confirm only an activity you have actually completed. ",
            )}
          </p>
          <div className={styles.simulationReadiness}>
            <span>
              {t("Готовность к цели", "Мақсатқа дайындық", "Goal readiness")}
            </span>
            <strong>
              {percent(simulation.step.beforeView.readiness)} →{" "}
              {percent(simulation.step.afterView.readiness)}
            </strong>
          </div>
          <dl className={styles.evidenceList}>
            {Object.entries(simulation.step.delta).map(([id, gain]) => (
              <div key={id}>
                <dt>{skillName(id)}</dt>
                <dd>
                  {number(simulation.step.before[id] ?? 0)} →{" "}
                  {number(simulation.step.after[id])}{" "}
                  <span className={styles.positive}>+{gain}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p>
            <strong>
              {t(
                "Следующий рекомендуемый шаг:",
                "Келесі ұсынылатын қадам:",
                "Next recommended step:",
              )}
            </strong>{" "}
            {simulation.step.afterView.recommendations[0]
              ? activity(
                  simulation.step.afterView.recommendations[0].activityId,
                )?.title
              : t(
                  "Доступные шаги закончились",
                  "Қолжетімді қадамдар қалмады",
                  "No available steps remain",
                )}
          </p>
          {state.error && (
            <p role="alert" className={styles.error}>
              {localizeMessage(state.error, locale)}
            </p>
          )}
          <div className={styles.modalActions}>
            <button
              className={styles.secondaryButton}
              onClick={state.cancelPreview}
            >
              {t(" Отмена ", " Бас тарту ", " Cancel ")}
            </button>
            <button
              className={styles.primaryButton}
              disabled={busy}
              onClick={() => state.confirmCompletion(simulation.requestId)}
            >
              {t(
                " Подтвердить завершение ",
                " Аяқталғанын растау ",
                " Confirm completion ",
              )}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
