"use client";
import { useEffect, useState } from "react";
import { useEmployeeStore } from "../../state/EmployeeStoreProvider";
import type { Recommendation } from "../../state/intelligenceAdapter";
import type { PathStrategy } from "../../domain/simulation/planner";
import { nearestSession } from "../../domain/simulation/simulator";
import { DatasetUpload } from "./DatasetUpload";
import { Modal } from "./Modal";
import styles from "./employee.module.css";

const percent = (value: number | null | undefined) =>
  value == null ? "—" : `${Math.round(value * 100)}%`;
const dateLabel = (value: string) =>
  Number.isNaN(Date.parse(value))
    ? value
    : new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value));
const languageNames = { ru: "Русский", kk: "Қазақша", en: "English" };
const strategyNames: Record<PathStrategy, string> = {
  fastest: "Быстрее к цели",
  balanced: "Баланс",
  stretch: "Больше роста",
};

export function EmployeeWorkspace({ demo = false }: { demo?: boolean }) {
  const state = useEmployeeStore((s) => s);
  const { dataset, selectedEmployeeId, simulation } = state;
  const employee = dataset?.employees.find((e) => e.id === selectedEmployeeId);
  const view = selectedEmployeeId ? state.views[selectedEmployeeId] : null;
  const [evidence, setEvidence] = useState<{
    primary: Recommendation;
    alternative?: Recommendation;
  } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  useEffect(() => {
    setEvidence(null);
    setShowExcluded(false);
  }, [selectedEmployeeId, state.revision]);
  const activity = (id: string) => dataset?.activities.find((a) => a.id === id);
  const skillName = (id: string) =>
    dataset?.skills.find((s) => s.id === id)?.name ?? id;
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
      <p>{recommendation.deterministicExplanation}</p>
      <div className={styles.factorList}>
        {Object.entries(recommendation.factorScores).map(([name, value]) => (
          <div key={name}>
            <span>{name}</span>
            <meter min={0} max={1} value={value} aria-label={name} />
            <strong>{percent(value)}</strong>
          </div>
        ))}
      </div>
      <dl className={styles.evidenceList}>
        {recommendation.evidence.map((item) => (
          <div key={item.id}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.muted}>
        Итоговый балл: {recommendation.totalScore.toFixed(3)} · Прогноз
        готовности: {percent(recommendation.projectedReadiness)}
      </p>
    </div>
  );
  return (
    <div className={styles.workspace}>
      <a className={styles.skipLink} href="#career-main">
        К содержимому
      </a>
      <aside className={styles.sidebar}>
        <a href="#career-main" className={styles.brand}>
          <span className={styles.brandMark}>
            cq<span>↗</span>
          </span>
          <span>
            career<span className={styles.brandLight}>quest</span>
          </span>
        </a>
        <div className={styles.sideLabel}>ПРОСТРАНСТВО РАЗВИТИЯ</div>
        <nav aria-label="Разделы профиля">
          <a href="#career-main" className={styles.navActive}>
            <span aria-hidden="true">◈</span> Моя траектория{" "}
            <span aria-hidden="true">↗</span>
          </a>
          <a href="#recommendations">
            <span aria-hidden="true">◎</span> Следующий шаг
          </a>
          <a href="#career-path">
            <span aria-hidden="true">⌁</span> Карьерный план
          </a>
          <a href="#progress-log">
            <span aria-hidden="true">◷</span> История прогресса
          </a>
        </nav>
        <div className={styles.sidebarBottom}>
          <span className={styles.smallDot} />
          Осознанный рост, шаг за шагом<p>Навыки → возможности → ваша цель</p>
        </div>
      </aside>
      <div className={styles.mainWrap}>
        <header className={styles.topbar}>
          <span>
            Личный кабинет <span aria-hidden="true">/</span>{" "}
            <strong>Моя траектория</strong>
          </span>
          <span className={styles.privacy}>◉ Личная сессия</span>
        </header>
        <main id="career-main" className={styles.main}>
          {demo && (
            <div className={styles.demoNotice}>
              Демонстрационный стенд · синтетический E0028 · ответы тестового
              адаптера. Реальный движок A и исходный датасет ещё не подключены.
            </div>
          )}
          <div className={styles.titleRow}>
            <div>
              <p className={styles.eyebrow}>EMPLOYEE DIGITAL TWIN</p>
              <h1>
                Ваш следующий
                <br className={styles.mobileBreak} /> карьерный шаг
                <span>.</span>
              </h1>
              <p className={styles.subtitle}>
                Понимайте, что развивать сегодня, чтобы приблизиться к своей
                цели.
              </p>
            </div>
            {dataset && (
              <div className={styles.snapshot}>
                Срез данных<strong>{dateLabel(dataset.snapshotDate)}</strong>
              </div>
            )}
          </div>
          {state.error && (
            <div role="alert" className={styles.error}>
              <span>{state.error}</span>
              <button className={styles.textButton} onClick={state.clearError}>
                Закрыть
              </button>
            </div>
          )}
          {state.notice && (
            <div role="status" className={styles.notice}>
              {state.notice}
            </div>
          )}
          {!state.adapterReady && (
            <div className={styles.empty}>
              <h2>Подключение Intelligence</h2>
              <p>
                Интерфейс готов принять общий адаптер команды. После его
                подключения здесь появятся профиль, доказательства и карьерный
                план.
              </p>
            </div>
          )}
          <div className={styles.contentGrid}>
            <div className={styles.primaryColumn}>
              {employee && view ? (
                <>
                  <section
                    className={styles.profile}
                    aria-label="Профиль сотрудника"
                  >
                    <div className={styles.profileTop}>
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
                            className={styles.eyebrow}
                          >
                            ПРОФИЛЬ
                          </label>
                          <select
                            id="employee-select"
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
                            {employee.role} <span>· {employee.grade}</span>
                          </p>
                        </div>
                      </div>
                      <span className={styles.tag}>
                        {languageNames[employee.preferredLanguage]}
                      </span>
                    </div>
                    <div className={styles.profileBody}>
                      <div>
                        <p className={styles.eyebrow}>КАРЬЕРНАЯ ЦЕЛЬ</p>
                        <h2>
                          {view.target
                            ? `${view.target.grade} ${view.target.role}`
                            : "Цель пока не задана"}
                        </h2>
                        <p className={styles.muted}>
                          {view.target
                            ? "Готовность отражает покрытие требований к навыкам, а не гарантию повышения."
                            : "Добавьте карьерную цель в профиль, чтобы построить следующие шаги."}
                        </p>
                        <div className={styles.pills}>
                          <span>{employee.workFormat}</span>
                          <span>
                            Оценка: {dateLabel(employee.lastReviewDate)}
                          </span>
                          {!!view.replayedActivityIds.length && (
                            <span className={styles.replayBadge}>
                              ✓ Учтено после оценки:{" "}
                              {view.replayedActivityIds.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className={styles.readinessRing}
                        style={{
                          background: `conic-gradient(#b0f093 ${Math.max(0, Math.min(1, view.readiness ?? 0)) * 360}deg, #3d514b 0deg)`,
                        }}
                      >
                        <div>
                          <strong>{percent(view.readiness)}</strong>
                          <span>готовность</span>
                        </div>
                      </div>
                    </div>
                  </section>
                  <section
                    className={styles.panel}
                    aria-labelledby="skills-title"
                  >
                    <div className={styles.sectionHeading}>
                      <div>
                        <span className={styles.eyebrow}>
                          ОТ ТЕКУЩЕГО К ЦЕЛЕВОМУ
                        </span>
                        <h2 id="skills-title">Карта навыков</h2>
                      </div>
                      <span className={styles.muted}>Уровни 0–5</span>
                    </div>
                    {!view.gaps.length ? (
                      <p className={styles.muted}>
                        {view.target
                          ? "Разрывы по навыкам отсутствуют."
                          : "Требования появятся после выбора цели."}
                      </p>
                    ) : (
                      <div className={styles.skillTable}>
                        <div className={styles.skillHead}>
                          <span>Компетенция</span>
                          <span>Сейчас / цель</span>
                          <span>Развитие</span>
                        </div>
                        {view.gaps.map((gap) => (
                          <div className={styles.skillRow} key={gap.skillId}>
                            <div>
                              <strong>{skillName(gap.skillId)}</strong>
                              {gap.critical && (
                                <span className={styles.critical}>
                                  Критично для цели
                                </span>
                              )}
                            </div>
                            <span>
                              {gap.current}{" "}
                              <span className={styles.muted}>
                                / {gap.required}
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
                              <span style={{ width: `${gap.current * 20}%` }} />
                              <i style={{ left: `${gap.required * 20}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <details className={styles.allSkills}>
                      <summary>
                        Все эффективные навыки (
                        {Object.keys(view.effectiveSkills).length})
                      </summary>
                      <dl>
                        {Object.entries(view.effectiveSkills).map(
                          ([id, level]) => (
                            <div key={id}>
                              <dt>{skillName(id)}</dt>
                              <dd>{level}/5</dd>
                            </div>
                          ),
                        )}
                      </dl>
                    </details>
                  </section>
                  <section
                    className={styles.panel}
                    aria-labelledby="decision-title"
                  >
                    <div className={styles.sectionHeading}>
                      <div>
                        <span className={styles.eyebrow}>DECISION LAB</span>
                        <h2 id="decision-title">Почему именно этот шаг?</h2>
                      </div>
                      <span className={styles.labIcon} aria-hidden="true">
                        ↗
                      </span>
                    </div>
                    <div className={styles.comparison}>
                      <div className={styles.baseline}>
                        <span className={styles.eyebrow}>
                          САМЫЙ СЛАБЫЙ НАВЫК
                        </span>
                        <h3>
                          {view.baseline
                            ? (activity(view.baseline.activityId)?.title ??
                              view.baseline.activityId)
                            : "Baseline не рассчитан"}
                        </h3>
                        <p>
                          {view.baseline?.explanation ??
                            "Сравнение появится, когда движок предоставит baseline."}
                        </p>
                        <span className={styles.muted}>
                          Однофакторный ориентир
                        </span>
                      </div>
                      <div className={styles.engineChoice}>
                        <span className={styles.eyebrow}>
                          ВЫБОР CAREER QUEST
                        </span>
                        <h3>
                          {top
                            ? activity(top.activityId)?.title
                            : "Нет подходящего шага"}
                        </h3>
                        <p>
                          {top?.deterministicExplanation ??
                            "Подходящие активности появятся после обновления цели или каталога."}
                        </p>
                        {top && (
                          <button
                            className={styles.textButton}
                            onClick={() => setEvidence({ primary: top })}
                          >
                            Посмотреть доказательства ↗
                          </button>
                        )}
                      </div>
                    </div>
                  </section>
                  <section
                    id="recommendations"
                    aria-labelledby="recommendation-title"
                  >
                    <div className={styles.sectionHeading}>
                      <div>
                        <span className={styles.eyebrow}>
                          РЕКОМЕНДАЦИИ ДЛЯ ВАС
                        </span>
                        <h2 id="recommendation-title">Начните с этого</h2>
                      </div>
                      <span className={styles.tag}>
                        {view.explanationStatus === "verified-ai"
                          ? "AI · проверено"
                          : view.explanationStatus === "fallback"
                            ? "Резервное объяснение"
                            : "Расчёт движка"}
                      </span>
                    </div>
                    {!view.recommendations.length && (
                      <div className={styles.empty}>
                        <h3>
                          {view.target
                            ? "Сейчас нет доступного следующего шага"
                            : "Нужна карьерная цель"}
                        </h3>
                        <p>
                          Система не предлагает неподходящие активности. HR
                          может уточнить цель или дополнить каталог.
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
                                    ? "РЕКОМЕНДУЕМЫЙ ШАГ"
                                    : "АЛЬТЕРНАТИВА"}
                                </span>
                                <span>
                                  {event?.durationHours ?? "—"} ч ·{" "}
                                  {event?.format === "self_paced"
                                    ? "В своём темпе"
                                    : event?.format === "online"
                                      ? "Онлайн"
                                      : "Очно"}
                                </span>
                              </div>
                              <h3>{event?.title ?? rec.activityId}</h3>
                              <p>{rec.deterministicExplanation}</p>
                              <div className={styles.pills}>
                                {Object.entries(rec.expectedGains).map(
                                  ([id, gain]) => (
                                    <span key={id}>
                                      +{gain} {skillName(id)}
                                    </span>
                                  ),
                                )}
                                <span>
                                  Готовность → {percent(rec.projectedReadiness)}
                                </span>
                              </div>
                              {session && (
                                <p className={styles.muted}>
                                  Ближайшая сессия: {dateLabel(session)}
                                </p>
                              )}
                              <div className={styles.questActions}>
                                <button
                                  className={styles.secondaryButton}
                                  disabled={busy}
                                  onClick={() =>
                                    state.previewActivity(rec.activityId)
                                  }
                                >
                                  Что изменится?{" "}
                                  <span aria-hidden="true">↗</span>
                                </button>
                                <button
                                  className={styles.textButton}
                                  onClick={() => setEvidence({ primary: rec })}
                                >
                                  Почему это?
                                </button>
                                {index > 0 && top && (
                                  <button
                                    className={styles.textButton}
                                    onClick={() =>
                                      setEvidence({
                                        primary: top,
                                        alternative: rec,
                                      })
                                    }
                                  >
                                    Почему не альтернатива?
                                  </button>
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
                      Почему не другие активности?{" "}
                      <span>{view.excluded.length} исключено движком ↗</span>
                    </button>
                  )}
                  <section
                    id="career-path"
                    className={styles.panel}
                    aria-labelledby="path-title"
                    aria-busy={planning}
                  >
                    <div className={styles.sectionHeading}>
                      <div>
                        <span className={styles.eyebrow}>
                          ПЛАН НА НЕСКОЛЬКО ШАГОВ
                        </span>
                        <h2 id="path-title">Ваша карьерная траектория</h2>
                      </div>
                      <span className={styles.tag}>До 4 активностей</span>
                    </div>
                    <div
                      className={styles.strategyTabs}
                      role="group"
                      aria-label="Стратегия плана"
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
                        Выберите стратегию, чтобы увидеть возможную
                        последовательность развития.
                      </p>
                    )}
                    {planning && <p role="status">Рассчитываем варианты…</p>}
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
                              ? "Требования к навыкам покрыты"
                              : state.path.reason === "no-target"
                                ? "Нет карьерной цели"
                                : state.path.reason === "no-candidates"
                                  ? "Нет подходящих активностей"
                                  : "Прогноз после плана"}
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
                                        `+${delta} ${skillName(id)}`,
                                    )
                                    .join(" · ")}
                                </p>
                              </div>
                              <span>{percent(step.afterView.readiness)}</span>
                              {index === 0 && (
                                <button
                                  className={styles.textButton}
                                  disabled={busy}
                                  onClick={() =>
                                    state.previewActivity(step.activityId)
                                  }
                                >
                                  Примерить
                                </button>
                              )}
                            </li>
                          ))}
                        </ol>
                        {!!state.path.steps.length && (
                          <p className={styles.muted}>
                            План — симуляция навыков. Расписание и возможность
                            участия нужно подтвердить отдельно. Завершайте
                            активности последовательно.
                          </p>
                        )}
                      </>
                    )}
                  </section>
                  <section id="progress-log" className={styles.panel}>
                    <div className={styles.sectionHeading}>
                      <div>
                        <span className={styles.eyebrow}>
                          ВАШ РОСТ В ЭТОЙ СЕССИИ
                        </span>
                        <h2>История прогресса</h2>
                      </div>
                      <span className={styles.tag}>
                        {
                          state.ledger.filter(
                            (e) => e.employeeId === employee.id,
                          ).length
                        }{" "}
                        завершено
                      </span>
                    </div>
                    {!state.ledger.some((e) => e.employeeId === employee.id) ? (
                      <p className={styles.muted}>
                        Подтверждённые активности появятся здесь. Исходные файлы
                        сохраняют прежние значения.
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
                                      `${skillName(id)}: ${entry.before[id] ?? 0} → ${entry.after[id]}`,
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
                  </section>
                </>
              ) : (
                <div className={styles.welcome}>
                  <span className={styles.welcomeArt} aria-hidden="true">
                    ↗
                  </span>
                  <h2>
                    {dataset
                      ? "В наборе нет сотрудников"
                      : "Начните с вашего профиля"}
                  </h2>
                  <p>
                    {dataset
                      ? "Загрузите набор с хотя бы одним профилем сотрудника."
                      : "Загрузите данные, чтобы увидеть навыки, цель и возможные шаги развития."}
                  </p>
                </div>
              )}
            </div>
            <aside
              className={styles.contextColumn}
              aria-label="Данные и текущие активности"
            >
              <DatasetUpload />
              {employee && view && (
                <>
                  <section className={styles.panel}>
                    <span className={styles.eyebrow}>УЖЕ В РАБОТЕ</span>
                    <h2>Активный путь</h2>
                    {!view.activeActivityIds.length ? (
                      <p className={styles.muted}>
                        Нет активностей в процессе.
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
                                  aria-label={`Прогресс ${activity(id)?.title}`}
                                />
                                <span>{record.completionPct}% выполнено</span>
                              </>
                            )}
                          </div>
                        );
                      })
                    )}
                  </section>
                  <section className={styles.trustNote}>
                    <span aria-hidden="true">✳</span>
                    <h3>Понятный рост</h3>
                    <p>
                      Рекомендации объясняют связь между целью, навыками и
                      историей участия. Вы сами выбираете следующий шаг.
                    </p>
                    <small>Движок: {view.engineVersion}</small>
                    {!dataset?.history.some(
                      (h) => h.employeeId === employee.id,
                    ) && (
                      <p>
                        История участия отсутствует. Это не должно снижать
                        оценку сотрудника.
                      </p>
                    )}
                  </section>
                </>
              )}
            </aside>
          </div>
          <footer className={styles.footer}>
            <span>Career Quest · Halyk / HackAlem AI</span>
            <span>Карьерный рост начинается с понятного шага.</span>
          </footer>
        </main>
      </div>
      {showExcluded && (
        <Modal
          drawer
          title="Почему не другие активности"
          onClose={() => setShowExcluded(false)}
        >
          <p className={styles.muted}>
            Причины исключения предоставлены движком Intelligence.
          </p>
          {view?.excluded?.map((item) => (
            <div key={item.activityId} className={styles.evidenceBlock}>
              <h3>{item.title}</h3>
              <ul>
                {item.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
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
              ? "Сравнение доказательств"
              : "Почему эта рекомендация"
          }
          onClose={() => setEvidence(null)}
        >
          {renderEvidence(evidence.primary)}
          {evidence.alternative && (
            <>
              {renderEvidence(evidence.alternative)}
              <p className={styles.muted}>
                Сравните факторы и подтверждённые факты обеих рекомендаций.
                Порядок задан движком Intelligence.
              </p>
            </>
          )}
          <p className={styles.muted}>
            Версия: {view?.engineVersion} · {view?.explanationStatus}
          </p>
        </Modal>
      )}
      {simulation && (
        <Modal
          title="Что изменится после завершения"
          onClose={state.cancelPreview}
        >
          <span className={styles.eyebrow}>WHAT-IF · ПРЕДПРОСМОТР</span>
          <h3>{activity(simulation.step.activityId)?.title}</h3>
          <p className={styles.muted}>
            Проверьте ожидаемый результат. Подтверждайте только действительно
            завершённую активность.
          </p>
          <div className={styles.simulationReadiness}>
            <span>Готовность к цели</span>
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
                  {simulation.step.before[id] ?? 0} →{" "}
                  {simulation.step.after[id]}{" "}
                  <span className={styles.positive}>+{gain}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p>
            <strong>Следующий рекомендуемый шаг:</strong>{" "}
            {simulation.step.afterView.recommendations[0]
              ? activity(
                  simulation.step.afterView.recommendations[0].activityId,
                )?.title
              : "Доступные шаги закончились"}
          </p>
          {state.error && (
            <p role="alert" className={styles.error}>
              {state.error}
            </p>
          )}
          <div className={styles.modalActions}>
            <button
              className={styles.secondaryButton}
              onClick={state.cancelPreview}
            >
              Отмена
            </button>
            <button
              className={styles.primaryButton}
              disabled={busy}
              onClick={() => state.confirmCompletion(simulation.requestId)}
            >
              Подтвердить завершение
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
