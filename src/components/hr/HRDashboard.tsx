"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { catalogName } from "@/lib/i18n/domain";
import { selectHRAnalytics } from "../../domain/analytics/selectors";
import type { AnalyticsInput, CatalogGap } from "../../domain/analytics/types";
import { useTrustIntegration } from "../trust/integration";
import { HrExternalLearningSection } from "./external-learning-section";
import styles from "./dashboard.module.css";
import { HRAgentPanel } from "./HRAgentPanel";
import { DropoutPanel } from "./DropoutPanel";

type BriefSpec =
  | { kind: "catalog"; skillId: string; unavailable: number; multiple: number }
  | { kind: "skills"; gap: number }
  | { kind: "session"; activityId: string; employees: number; closure: number }
  | { kind: "participation"; noShow: number; dropped: number }
  | { kind: "discussion" };
export interface ActionBrief {
  title: string;
  rationale: string;
  nextStep: string;
}

function MetricIcon({
  kind,
}: {
  kind: "coverage" | "step" | "growth" | "gap";
}) {
  const paths = {
    coverage:
      "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M17 4a4 4 0 0 1 0 8M23 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    step: "M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    growth: "M3 17l6-6 4 4 8-10M15 5h6v6",
    gap: "M4 20V10m8 10V4m8 16v-7",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}

export function HRDashboard({ input }: { input: AnalyticsInput }) {
  const { locale, t, number } = useI18n();
  const externalLearningPlan =
    useTrustIntegration()?.externalLearningPlan ?? null;
  const pct = (n: number | null) =>
    n === null
      ? t("Нет данных", "Дерек жоқ", "No data")
      : `${number(Math.round(n * 100))}%`;
  const statusLabels = {
    completed: t("Завершено", "Аяқталды", "Completed"),
    in_progress: t("В процессе", "Орындалуда", "In progress"),
    dropped: t("Прервано", "Тоқтатылды", "Dropped"),
    no_show: t("Неявка", "Қатыспады", "No show"),
    declined: t("Отклонено", "Бас тартылды", "Declined"),
    overdue: t("Просрочено", "Мерзімі өтті", "Overdue"),
  };
  const assignmentLabels = {
    self: t("По своей инициативе", "Өз бастамасымен", "Self-initiated"),
    manager: t(
      "Назначил руководитель",
      "Басшы тағайындады",
      "Assigned by manager",
    ),
    hr: t("Назначил HR", "HR тағайындады", "Assigned by HR"),
  };
  const [role, setRole] = useState("");
  const [briefSpec, setBrief] = useState<BriefSpec | null>(null);
  const brief: ActionBrief | null = briefSpec
    ? (() => {
        switch (briefSpec.kind) {
          case "catalog":
            return {
              title: t(
                "Расширить каталог: {skill}",
                "Каталогты кеңейту: {skill}",
                "Expand the catalog: {skill}",
                { skill: catalogName(briefSpec.skillId, locale) },
              ),
              rationale: t(
                "Нет доступного прироста для {none}; одного шага недостаточно для {multi}.",
                "{none} қызметкерге қолжетімді өсім жоқ; {multi} қызметкерге бір қадам жеткіліксіз.",
                "No available gain for {none}; one step is insufficient for {multi}.",
                {
                  none: number(briefSpec.unavailable),
                  multi: number(briefSpec.multiple),
                },
              ),
              nextStep: t(
                "Проверьте требования для участия и доступность сессий. Если подходящих программ действительно нет, подготовьте новую программу с нужным уровнем навыка.",
                "Алғышарттар мен сессиялардың қолжетімділігін тексеріңіз. Сәйкес бағдарлама болмаса, қажетті дағды деңгейіне арналған жаңа бағдарлама дайындаңыз.",
                "Check prerequisites and session availability. If no suitable program exists, prepare one for the required skill level.",
              ),
            };
          case "skills":
            return {
              title: t(
                "План развития по критичным навыкам",
                "Маңызды дағдыларды дамыту жоспары",
                "Critical skill development plan",
              ),
              rationale: t(
                "Взвешенный критичный дефицит: {gap}.",
                "Салмақталған маңызды тапшылық: {gap}.",
                "Weighted critical skill gap: {gap}.",
                { gap: number(briefSpec.gap) },
              ),
              nextStep: t(
                "Выберите программу из блока ожидаемого эффекта и согласуйте её с владельцем целевой роли.",
                "Күтілетін әсер бөлімінен бағдарламаны таңдап, мақсатты рөлге жауапты тұлғамен келісіңіз.",
                "Choose a program from the projected impact section and agree it with the target role owner.",
              ),
            };
          case "session":
            return {
              title: t(
                "Запланировать {activity}",
                "{activity} жоспарлау",
                "Schedule {activity}",
                { activity: catalogName(briefSpec.activityId, locale) },
              ),
              rationale: t(
                "Подходит {count} сотрудникам; прогноз закрытия критичных разрывов: {closure}.",
                "{count} қызметкерге сәйкес; маңызды тапшылықтың болжамды азаюы: {closure}.",
                "Suitable for {count} employees; projected critical gap closure: {closure}.",
                {
                  count: number(briefSpec.employees),
                  closure: number(briefSpec.closure),
                },
              ),
              nextStep: t(
                "Проверьте вместимость и согласуйте дополнительную сессию с владельцем программы.",
                "Қатысушылар санын тексеріп, бағдарламаға жауапты тұлғамен қосымша сессияны келісіңіз.",
                "Check capacity and agree an additional session with the program owner.",
              ),
            };
          case "participation":
            return {
              title: t(
                "Проверить формат участия",
                "Қатысу форматын тексеру",
                "Review participation format",
              ),
              rationale: t(
                "Неявки: {noShow}; прерывания: {dropped}.",
                "Қатыспағандар: {noShow}; тоқтатқандар: {dropped}.",
                "No shows: {noShow}; dropped: {dropped}.",
                {
                  noShow: number(briefSpec.noShow),
                  dropped: number(briefSpec.dropped),
                },
              ),
              nextStep: t(
                "Сопоставьте расписание и длительность программ с рабочей нагрузкой. Обсудите с руководителями причину, прежде чем менять назначения.",
                "Бағдарламалар кестесі мен ұзақтығын жұмыс жүктемесімен салыстырыңыз. Тағайындауларды өзгертпес бұрын себептерін басшылармен талқылаңыз.",
                "Compare program schedules and duration with workload. Discuss the reasons with managers before changing assignments.",
              ),
            };
          case "discussion":
            return {
              title: t(
                "Обсудить поддержку руководителей",
                "Басшылардың қолдауын талқылау",
                "Discuss manager support",
              ),
              rationale: t(
                "Сравнение инициативного и назначенного участия основано на отдельных группах.",
                "Өз бастамасымен және тағайындау бойынша қатысу бөлек топтарда салыстырылады.",
                "Self-initiated and assigned participation are compared in separate groups.",
              ),
              nextStep: t(
                "Проведите обсуждение доступности программ без публичного сравнения сотрудников.",
                "Қызметкерлерді көпшілік алдында салыстырмай, бағдарламалардың қолжетімділігін талқылаңыз.",
                "Discuss program availability without publicly comparing employees.",
              ),
            };
        }
      })()
    : null;
  const briefRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (brief)
      briefRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
  }, [briefSpec]);
  const roles = [
    ...new Set(input.employees.map((e) => e.target?.role ?? e.role)),
  ].sort();
  const effectiveRole = roles.includes(role) ? role : "";
  const filtered = useMemo(() => {
    if (!effectiveRole) return input;
    const employees = input.employees.filter(
      (e) => (e.target?.role ?? e.role) === effectiveRole,
    );
    const ids = new Set(employees.map((e) => e.employeeId));
    return {
      ...input,
      employees,
      history: input.history.filter((row) => ids.has(row.employeeId)),
    };
  }, [input, effectiveRole]);
  const analytics = useMemo(() => {
    try {
      return { result: selectHRAnalytics(filtered), error: false };
    } catch {
      return { result: null, error: true };
    }
  }, [filtered]);
  if (!analytics.result)
    return (
      <div className={styles.notice} role="alert">
        {t(
          "Не удалось посчитать аналитику. Проверьте связи профилей и истории в загруженных данных.",
          "Талдауды есептеу мүмкін болмады. Жүктелген деректердегі профильдер мен тарих байланысын тексеріңіз.",
          "Could not calculate analytics. Check profile and history references in the imported data.",
        )}
      </div>
    );
  const data = analytics.result;
  if (!input.employees.length)
    return (
      <div className={styles.empty}>
        <h2>
          {t(
            "Данные ещё не загружены",
            "Деректер әлі жүктелмеді",
            "No data loaded yet",
          )}
        </h2>
        <p>
          {t(
            "Загрузите профили, навыки, активности и историю на экране сотрудника.",
            "Қызметкер экранында профильдерді, дағдыларды, іс-шаралар мен тарихты жүктеңіз.",
            "Upload profiles, skills, activities and history on the employee screen.",
          )}
        </p>
        <Link className={styles.button} href="/employee">
          {t("Перейти к загрузке", "Жүктеуге өту", "Go to upload")}
        </Link>
      </div>
    );
  const voluntaryTotal = Object.values(data.statuses).reduce(
    (sum, n) => sum + n,
    0,
  );
  const download = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            ...brief,
            scope: effectiveRole
              ? catalogName(effectiveRole, locale)
              : t("Все роли", "Барлық рөлдер", "All roles"),
            note: t(
              "Проект решения для HR; событие не создано и сообщения не отправлены.",
              "HR үшін шешім жобасы; іс-шара жасалған жоқ, хабарламалар жіберілген жоқ.",
              "Draft HR decision; no event has been created and no messages have been sent.",
            ),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "career-quest-hr-action.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const catalogCard = (g: CatalogGap) => (
    <div key={g.skillId} className={styles.catalogItem}>
      <div>
        <b title={g.skillId}>{catalogName(g.skillId, locale)}</b>
        <span className={styles.muted}>
          {t(
            "Нет шага: {none} · Несколько шагов: {multi}",
            "Қадам жоқ: {none} · Бірнеше қадам: {multi}",
            "No step: {none} · Multiple steps: {multi}",
            {
              none: number(g.noAvailableStep),
              multi: number(g.needsMultipleSteps),
            },
          )}
        </span>
      </div>
      <button
        className={`${styles.button} ${styles.secondary}`}
        onClick={() =>
          setBrief({
            kind: "catalog",
            skillId: g.skillId,
            unavailable: g.noAvailableStep,
            multiple: g.needsMultipleSteps,
          })
        }
      >
        {t("Проект программы", "Бағдарлама жобасы", "Draft program")}
      </button>
    </div>
  );
  return (
    <>
      <div className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>
            {t("Развитие команды", "Команданы дамыту", "Team development")}
          </h1>
        </div>
        <label className={styles.filter}>
          {t("Целевая роль", "Мақсатты рөл", "Target role")}
          <span className={styles.selectControl}>
            <select
              aria-label={t("Целевая роль", "Мақсатты рөл", "Target role")}
              value={effectiveRole}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="">
                {t("Все роли", "Барлық рөлдер", "All roles")}
              </option>
              {roles.map((item) => (
                <option key={item} value={item}>
                  {catalogName(item, locale)}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statTop}>
            <span>
              {t(
                "Охват рекомендациями",
                "Ұсынымдармен қамту",
                "Recommendation coverage",
              )}
            </span>
            <span className={styles.statIcon}>
              <MetricIcon kind="coverage" />
            </span>
          </div>
          <strong>{pct(data.coverage)}</strong>
          <span className={styles.muted}>
            {t(
              "{covered} из {total} с карьерной целью",
              "Мансаптық мақсаты бар {total} қызметкердің {covered}-і",
              "{covered} of {total} with a career goal",
              {
                covered: number(data.coveredEmployees),
                total: number(data.employeesWithTarget),
              },
            )}
          </span>
          <div className={styles.statTrack} aria-hidden="true">
            <span style={{ width: `${(data.coverage ?? 0) * 100}%` }} />
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statTop}>
            <span>
              {t(
                "Без следующего шага",
                "Келесі қадам жоқ",
                "Without a next step",
              )}
            </span>
            <span className={styles.statIcon}>
              <MetricIcon kind="step" />
            </span>
          </div>
          <strong>{number(data.noStepEmployees)}</strong>
          <span className={styles.muted}>
            {t(
              "Из {count} с целью",
              "Мақсаты бар {count} қызметкердің ішінде",
              "Of {count} with a goal",
              { count: number(data.employeesWithTarget) },
            )}
          </span>
        </div>
        <div className={styles.stat}>
          <div className={styles.statTop}>
            <span>
              {t("Средняя готовность", "Орташа дайындық", "Average readiness")}
            </span>
            <span className={styles.statIcon}>
              <MetricIcon kind="growth" />
            </span>
          </div>
          <strong>{pct(data.meanReadiness)}</strong>
          <span className={styles.muted}>
            {t(
              "{count} профилей с целью",
              "Мақсаты бар {count} профиль",
              "{count} profiles with a goal",
              { count: number(data.employeesWithTarget) },
            )}
          </span>
          <div className={styles.statTrack} aria-hidden="true">
            <span style={{ width: `${(data.meanReadiness ?? 0) * 100}%` }} />
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statTop}>
            <span>
              {t("Критичный дефицит", "Маңызды тапшылық", "Critical skill gap")}
            </span>
            <span className={styles.statIcon}>
              <MetricIcon kind="gap" />
            </span>
          </div>
          <strong>{number(data.weightedCriticalGap)}</strong>
          <span className={styles.muted}>
            {t(
              "Вес критичных навыков ×2",
              "Маңызды дағдылардың салмағы ×2",
              "Critical skill weight ×2",
            )}
          </span>
        </div>
      </div>
      <div className={styles.summaryLine}>
        {data.employeesWithoutTarget > 0 && (
          <span className={styles.muted}>
            {t(
              "{count} профилей без цели · вне расчёта охвата",
              "Мақсатсыз {count} профиль · қамту есебінен тыс",
              "{count} profiles without a goal · excluded from coverage",
              { count: number(data.employeesWithoutTarget) },
            )}
          </span>
        )}
        <details className={styles.disclosure}>
          <summary>
            {t(
              "Как считаются показатели",
              "Көрсеткіштер қалай есептеледі",
              "How metrics are calculated",
            )}
          </summary>
          <p>
            {t(
              "Охват — сотрудники с рекомендацией среди профилей с карьерной целью. Профили без цели исключены из знаменателя охвата и средней готовности. «Без следующего шага» — сотрудники с целью, которым нужна доступная программа. Критичный дефицит — сумма разрывов по критичным навыкам с весом ×2.",
              "Қамту — мансаптық мақсаты бар профильдердің ішінде ұсыным алған қызметкерлер үлесі. Мақсатсыз профильдер қамту мен орташа дайындық есебіне кірмейді. «Келесі қадам жоқ» — мақсаты бар, бірақ қолжетімді бағдарлама қажет қызметкерлер. Маңызды тапшылық — маңызды дағдылар алшақтығының ×2 салмақпен алынған қосындысы.",
              "Coverage is the share of employees with a recommendation among profiles with a career goal. Profiles without a goal are excluded from coverage and average readiness. “Without a next step” means employees with a goal who need an available program. The critical skill gap sums critical gaps with a ×2 weight.",
            )}
          </p>
        </details>
      </div>
      <HRAgentPanel />
      <DropoutPanel input={filtered} />
      <div className={styles.grid}>
        <div>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>
                  {t("Дефицит навыков", "Дағдылар тапшылығы", "Skill gaps")}
                </h2>
              </div>
            </div>
            <div
              className={styles.scroll}
              tabIndex={0}
              role="region"
              aria-label={t(
                "Разрывы навыков по ролям",
                "Рөлдер бойынша дағды тапшылығы",
                "Skill gaps by role",
              )}
            >
              <table>
                <caption className={styles.srOnly}>
                  {t(
                    "Агрегаты без рейтинга сотрудников",
                    "Қызметкерлер рейтингі жоқ жиынтық деректер",
                    "Aggregates without employee rankings",
                  )}
                </caption>
                <thead>
                  <tr>
                    <th>{t("Навык", "Дағды", "Skill")}</th>
                    <th>{t("Роль / грейд", "Рөл / деңгей", "Role / grade")}</th>
                    <th>{t("Сотрудников", "Қызметкерлер", "Employees")}</th>
                    <th>
                      {t("Вес разрыва", "Тапшылық салмағы", "Weighted gap")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.gaps.map((g) => (
                    <tr key={`${g.role}:${g.grade}:${g.skillId}`}>
                      <td className={styles.tableCode} title={g.skillId}>
                        {catalogName(g.skillId, locale)}
                      </td>
                      <td>
                        <span className={styles.tableRole}>
                          {catalogName(g.role, locale)}
                        </span>
                        <span className={styles.tableGrade}>
                          {catalogName(g.grade, locale)}
                        </span>
                      </td>
                      <td>{number(g.affectedEmployees)}</td>
                      <td>
                        <span
                          className={`${styles.heat} ${g.criticalEmployees ? styles.hot : ""}`}
                        >
                          {number(g.weightedGap)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.gaps.length && (
              <p>
                {t(
                  "Дефицита навыков по текущим целям нет.",
                  "Ағымдағы мақсаттар бойынша дағды тапшылығы жоқ.",
                  "No skill gaps for the current goals.",
                )}
              </p>
            )}
            <details className={styles.disclosure}>
              <summary>
                {t("Как считается", "Қалай есептеледі", "How it is calculated")}
              </summary>
              <p>
                {t(
                  "Разрывы по целевой роли и грейду. Критичные навыки имеют вес ×2. Показаны агрегаты без рейтинга сотрудников.",
                  "Мақсатты рөл мен деңгей бойынша алшақтықтар. Маңызды дағдылардың салмағы ×2. Қызметкерлер рейтингісіз жиынтық деректер көрсетілген.",
                  "Gaps by target role and grade. Critical skills have a ×2 weight. Values are aggregated without employee rankings.",
                )}
              </p>
            </details>
            <div className={styles.action}>
              <button
                className={`${styles.button} ${styles.secondary}`}
                onClick={() =>
                  setBrief({
                    kind: "skills",
                    gap: data.weightedCriticalGap,
                  })
                }
              >
                {t(
                  "Подготовить план развития",
                  "Даму жоспарын дайындау",
                  "Draft development plan",
                )}
              </button>
            </div>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>
                {t("Эффект программ", "Бағдарламалар әсері", "Program impact")}
              </h2>
              <span className={styles.badge}>
                {t("Прогноз", "Болжам", "Projection")}
              </span>
            </div>
            <div
              className={styles.scroll}
              tabIndex={0}
              role="region"
              aria-label={t(
                "Прогноз эффекта программ",
                "Бағдарламалар әсерінің болжамы",
                "Projected program impact",
              )}
            >
              <table>
                <thead>
                  <tr>
                    <th>{t("Активность", "Іс-шара", "Activity")}</th>
                    <th>{t("Охват", "Қамту", "Coverage")}</th>
                    <th>
                      {t(
                        "Закрытие разрыва",
                        "Тапшылықты азайту",
                        "Gap closure",
                      )}
                    </th>
                    <th>{t("Действие", "Әрекет", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.programImpact.map((p) => (
                    <tr key={p.activityId}>
                      <td className={styles.tableCode} title={p.activityId}>
                        {catalogName(p.activityId, locale)}
                      </td>
                      <td>{number(p.employees)}</td>
                      <td>{number(p.weightedGapClosure)}</td>
                      <td>
                        <button
                          className={`${styles.button} ${styles.secondary} ${styles.tableButton}`}
                          onClick={() =>
                            setBrief({
                              kind: "session",
                              activityId: p.activityId,
                              employees: p.employees,
                              closure: p.criticalGapClosure,
                            })
                          }
                        >
                          {t("План сессии", "Сессия жоспары", "Session plan")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.programImpact.length && (
              <p>
                {t(
                  "Сейчас нет подходящих программ с положительным вкладом.",
                  "Қазір оң әсері бар сәйкес бағдарламалар жоқ.",
                  "No suitable programs with a positive impact are currently available.",
                )}
              </p>
            )}
            <details className={styles.disclosure}>
              <summary>
                {t("Как считается", "Қалай есептеледі", "How it is calculated")}
              </summary>
              <p>
                {t(
                  "Вклад одного прохождения среди подходящих сотрудников. Это прогноз по приросту навыков, не измеренный результат обучения.",
                  "Сәйкес қызметкерлер үшін бір рет қатысудың үлесі. Бұл — дағды өсіміне негізделген болжам, өлшенген оқу нәтижесі емес.",
                  "The contribution of one completion among eligible employees. This is a projection from skill gains, not a measured learning outcome.",
                )}
              </p>
            </details>
          </section>
        </div>
        <div>
          <section className={styles.panel}>
            <h2>{t("Участие", "Қатысу", "Participation")}</h2>
            <p className={styles.muted}>
              {t(
                "Добровольные активности · {count} записей",
                "Ерікті іс-шаралар · {count} жазба",
                "Voluntary activities · {count} records",
                { count: number(voluntaryTotal) },
              )}
            </p>
            {Object.entries(data.statuses).map(([status, count]) => (
              <div
                key={status}
                className={styles.participationItem}
                data-status={status}
              >
                <div className={styles.row}>
                  <span>
                    {statusLabels[status as keyof typeof statusLabels]}
                  </span>
                  <b>{number(count)}</b>
                </div>
                <div className={styles.bar}>
                  <span
                    style={{
                      width: voluntaryTotal
                        ? `${(count / voluntaryTotal) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            ))}
            {!voluntaryTotal && (
              <p>
                {t(
                  "История добровольного участия отсутствует.",
                  "Ерікті қатысу тарихы жоқ.",
                  "No voluntary participation history.",
                )}
              </p>
            )}
            <details className={styles.action}>
              <summary>
                {t(
                  "Обязательные активности",
                  "Міндетті іс-шаралар",
                  "Mandatory activities",
                )}
              </summary>
              {Object.entries(data.mandatoryStatuses).map(([status, count]) => (
                <p key={status}>
                  {statusLabels[status as keyof typeof statusLabels]}:{" "}
                  {number(count)}
                </p>
              ))}
            </details>
            <button
              className={`${styles.button} ${styles.secondary}`}
              onClick={() =>
                setBrief({
                  kind: "participation",
                  noShow: data.statuses.no_show,
                  dropped: data.statuses.dropped,
                })
              }
            >
              {t("Подготовить разбор", "Талдауды дайындау", "Draft review")}
            </button>
          </section>
          <section className={styles.panel}>
            <h2>
              {t(
                "Инициатива и назначения",
                "Бастама мен тағайындаулар",
                "Initiative and assignments",
              )}
            </h2>
            {data.engagement.map((e) => (
              <div className={styles.action} key={e.assignedBy}>
                <b>{assignmentLabels[e.assignedBy]}</b>
                <div className={styles.engagementValue}>
                  <strong>{pct(e.completionRate)}</strong>
                  <span>
                    {t(
                      "завершений · {count} записей",
                      "аяқталды · {count} жазба",
                      "completed · {count} records",
                      { count: number(e.total) },
                    )}
                  </span>
                </div>
              </div>
            ))}
            <details className={styles.disclosure}>
              <summary>
                {t("Как считается", "Қалай есептеледі", "How it is calculated")}
              </summary>
              <p>
                {t(
                  "Завершённые / все конечные статусы. Записи в процессе и обязательные активности исключены.",
                  "Аяқталғандар / барлық соңғы мәртебелер. Орындалып жатқан жазбалар мен міндетті іс-шаралар есепке кірмейді.",
                  "Completed outcomes divided by all final statuses. In-progress records and mandatory activities are excluded.",
                )}
              </p>
            </details>
            <button
              className={`${styles.button} ${styles.secondary}`}
              onClick={() =>
                setBrief({
                  kind: "discussion",
                })
              }
            >
              {t("План обсуждения", "Талқылау жоспары", "Discussion plan")}
            </button>
          </section>
        </div>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>
            {t("Пробелы каталога", "Каталогтағы олқылықтар", "Catalog gaps")}
          </h2>
          <span className={styles.badge}>
            {t("{count} навыков", "{count} дағды", "{count} skills", {
              count: number(data.catalogGaps.length),
            })}
          </span>
        </div>
        <details className={styles.disclosure}>
          <summary>
            {t(
              "Что означают показатели",
              "Көрсеткіштер нені білдіреді",
              "What the metrics mean",
            )}
          </summary>
          <p>
            {t(
              "«Нет шага» означает отсутствие доступного прироста сейчас; «несколько шагов» — ни одна текущая активность не закрывает весь разрыв. Это не доказательство отсутствия многошагового пути.",
              "«Қадам жоқ» — қазір қолжетімді өсім жоқ; «бірнеше қадам» — ешбір ағымдағы іс-шара бүкіл алшақтықты жаппайды. Бұл көпқадамды жолдың жоқтығын білдірмейді.",
              "“No step” means no gain is currently available. “Multiple steps” means no single current activity closes the full gap. This does not prove that a multi-step path is unavailable.",
            )}
          </p>
        </details>
        <div className={styles.catalogGrid}>
          {data.catalogGaps.slice(0, 4).map(catalogCard)}
        </div>
        {data.catalogGaps.length > 4 && (
          <details className={styles.disclosure}>
            <summary>
              {t(
                "Ещё {count} навыков",
                "Тағы {count} дағды",
                "{count} more skills",
                { count: number(data.catalogGaps.length - 4) },
              )}
            </summary>
            <div className={styles.catalogGrid}>
              {data.catalogGaps.slice(4).map(catalogCard)}
            </div>
          </details>
        )}
        {!data.catalogGaps.length && (
          <p>
            {t(
              "Текущие разрывы покрываются доступными активностями.",
              "Ағымдағы алшақтықтарды қолжетімді іс-шаралар жабады.",
              "Available activities cover the current gaps.",
            )}
          </p>
        )}
        {!effectiveRole && externalLearningPlan && (
          <HrExternalLearningSection plan={externalLearningPlan} />
        )}
      </section>
      {brief && (
        <section
          ref={briefRef}
          aria-label={t(
            "Проект действия HR",
            "HR әрекетінің жобасы",
            "HR action draft",
          )}
          role="status"
          className={`${styles.panel} ${styles.brief}`}
        >
          <div className={styles.panelHead}>
            <h2>{brief.title}</h2>
            <button
              className={`${styles.button} ${styles.secondary}`}
              onClick={() => setBrief(null)}
            >
              {t("Закрыть", "Жабу", "Close")}
            </button>
          </div>
          <p>{brief.rationale}</p>
          <p>{brief.nextStep}</p>
          <details className={styles.disclosure}>
            <summary>
              {t(
                "Проект для согласования",
                "Келісуге арналған жоба",
                "Draft for approval",
              )}
            </summary>
            <p>
              {t(
                "Назначения и сообщения не отправляются автоматически.",
                "Тағайындаулар мен хабарламалар автоматты түрде жіберілмейді.",
                "Assignments and messages are not sent automatically.",
              )}
            </p>
          </details>
          <button className={styles.button} onClick={download}>
            {t(
              "Скачать проект действия",
              "Әрекет жобасын жүктеу",
              "Download action draft",
            )}
          </button>
        </section>
      )}
    </>
  );
}
