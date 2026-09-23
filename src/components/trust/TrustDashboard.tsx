"use client";
import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { catalogName, localizeMessage } from "@/lib/i18n/domain";
import { compareWithBaseline } from "../../lib/evaluation/baseline";
import { createAIContractCases } from "../../lib/evaluation/ai-suite";
import {
  runEvaluation,
  type EvaluationReport,
  type Rate,
} from "../../lib/evaluation/harness";
import { requestAIExplanation } from "../../lib/evaluation/client";
import type { AIExplanationResult } from "../../lib/evaluation/ai-contracts";
import type { TrustIntegration } from "./integration";
import styles from "../hr/dashboard.module.css";

function TrustIcon({
  kind,
}: {
  kind: "shield" | "check" | "history" | "clock";
}) {
  const paths = {
    shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z M9 12l2 2 4-4",
    check:
      "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
    history: "M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2",
    clock: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
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

export function TrustDashboard({
  integration,
}: {
  integration: TrustIntegration;
}) {
  const { locale, t, number } = useI18n();
  const percent = (n: number) => `${number(Math.round(n * 100))}%`;
  const measured = (m?: Rate) =>
    m?.rate == null
      ? t("Не измерено", "Өлшенбеді", "Not measured")
      : percent(m.rate);
  const duration = (n: number | null | undefined) =>
    n == null
      ? t("Не измерено", "Өлшенбеді", "Not measured")
      : t("{count} мс", "{count} мс", "{count} ms", {
          count: number(Math.round(n)),
        });
  const statuses = {
    verified: t("Ответ проверен", "Жауап тексерілді", "Response verified"),
    blocked: t(
      "Ответ отклонён · резервный режим",
      "Жауап қабылданбады · резервтік режим",
      "Response blocked · fallback",
    ),
    timeout: t(
      "Таймаут · резервный режим",
      "Уақыт бітті · резервтік режим",
      "Timeout · fallback",
    ),
    no_key: t(
      "Без ключа · резервный режим",
      "Кілт жоқ · резервтік режим",
      "No key · fallback",
    ),
  };
  const [stored, setStored] = useState<{
    report: EvaluationReport;
    source: TrustIntegration;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{
    result: AIExplanationResult;
    source: TrustIntegration;
  } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState(false);
  const running = useRef(false);
  const report = stored?.report;
  const stale = stored !== null && stored.source !== integration;
  const comparison = integration.challenge
    ? compareWithBaseline(integration.challenge.employee)
    : null;
  const evaluate = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(false);
    try {
      const next = await runEvaluation([
        ...createAIContractCases(),
        ...(integration.coreEvaluationCases ?? []),
      ]);
      setStored({ report: next, source: integration });
    } catch {
      setError(true);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              ...report,
              cases: report.cases.map((item) => ({
                ...item,
                name: localizeMessage(item.name, locale),
                detail: localizeMessage(item.detail, locale),
              })),
              locale,
              versions: integration.versions,
              stale,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "career-quest-evaluation.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const reviewNow = async () => {
    if (!integration.reviewRequest) return;
    setReviewing(true);
    try {
      setReview({
        result: await requestAIExplanation(integration.reviewRequest),
        source: integration,
      });
    } finally {
      setReviewing(false);
    }
  };
  return (
    <>
      <div className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>
            {t("Проверка решений", "Шешімдерді тексеру", "Decision checks")}
          </h1>
        </div>
        <button className={styles.button} disabled={busy} onClick={evaluate}>
          {busy
            ? t("Проверяем…", "Тексерілуде…", "Checking…")
            : t("Запустить проверки", "Тексеруді бастау", "Run checks")}
        </button>
      </div>
      {!integration.coreEvaluationCases?.length && (
        <div className={styles.notice}>
          {t(
            "Только AI-контракт · движок не измерен",
            "Тек AI келісімшарты · қозғалтқыш өлшенбеді",
            "AI contract only · engine not measured",
          )}
          <details className={styles.disclosure}>
            <summary>{t("Подробности", "Толығырақ", "Details")}</summary>
            <p>
              {t(
                "Доступны проверки правил AI на синтетических примерах. Проверки движка подключаются отдельно; допустимость рекомендаций, пересчёт истории и скорость рекомендаций пока не измерены.",
                "Жасанды мысалдарда AI келісімшартын тексеруге болады. Қозғалтқыш тексерістері бөлек қосылады; ұсынымдардың жарамдылығы, тарихты қайта есептеу және жылдамдық әлі өлшенбеді.",
                "AI contract checks are available on synthetic examples. Engine checks are connected separately; eligibility, history replay and recommendation speed have not yet been measured.",
              )}
            </p>
          </details>
        </div>
      )}
      {stale && (
        <div className={styles.notice}>
          {t(
            "Результаты устарели. Запустите проверки для текущих данных.",
            "Нәтижелер ескірді. Ағымдағы деректер үшін тексеруді іске қосыңыз.",
            "Results are out of date. Run checks for the current data.",
          )}
        </div>
      )}
      {error && (
        <div role="alert" className={styles.notice}>
          {t(
            "Не удалось запустить набор проверок. Проверьте подключение тестовых сценариев.",
            "Тексерістерді іске қосу мүмкін болмады. Сынақ сценарийлерінің қосылғанын тексеріңіз.",
            "Could not run the checks. Verify the test scenario integration.",
          )}
        </div>
      )}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statTop}>
            <span>
              {t("Нарушения правил", "Ереже бұзушылықтары", "Rule violations")}
            </span>
            <span className={styles.statIcon}>
              <TrustIcon kind="shield" />
            </span>
          </div>
          <strong
            className={
              report?.metrics.eligibility.rate == null
                ? styles.unmeasured
                : undefined
            }
          >
            {measured(report?.metrics.eligibility)}
          </strong>
          <span className={styles.muted}>
            {t(
              "{count} рекомендаций проверено",
              "{count} ұсыным тексерілді",
              "{count} recommendations checked",
              { count: number(report?.metrics.eligibility.denominator ?? 0) },
            )}
          </span>
        </div>
        <div className={styles.stat}>
          <div className={styles.statTop}>
            <span>
              {t(
                "Подтверждённые числа",
                "Расталған сандар",
                "Grounded numbers",
              )}
            </span>
            <span className={styles.statIcon}>
              <TrustIcon kind="check" />
            </span>
          </div>
          <strong
            className={
              report?.metrics.grounding.rate == null
                ? styles.unmeasured
                : undefined
            }
          >
            {measured(report?.metrics.grounding)}
          </strong>
          <span className={styles.muted}>
            {t(
              "{count} утверждений в тестах",
              "Тексерістерде {count} тұжырым",
              "{count} test claims",
              { count: number(report?.metrics.grounding.denominator ?? 0) },
            )}
          </span>
        </div>
        <div className={styles.stat}>
          <div className={styles.statTop}>
            <span>
              {t(
                "Пересчёт навыков",
                "Дағдыларды қайта есептеу",
                "Skill recalculation",
              )}
            </span>
            <span className={styles.statIcon}>
              <TrustIcon kind="history" />
            </span>
          </div>
          <strong
            className={
              report?.metrics.replay.rate == null
                ? styles.unmeasured
                : undefined
            }
          >
            {measured(report?.metrics.replay)}
          </strong>
          <span className={styles.muted}>
            {t(
              "{count} эталонных проверок",
              "{count} эталондық тексеріс",
              "{count} reference checks",
              { count: number(report?.metrics.replay.denominator ?? 0) },
            )}
          </span>
        </div>
        <div className={styles.stat}>
          <div className={styles.statTop}>
            <span>
              {t(
                "Скорость рекомендаций",
                "Ұсынымдар жылдамдығы",
                "Recommendation speed",
              )}
            </span>
            <span className={styles.statIcon}>
              <TrustIcon kind="clock" />
            </span>
          </div>
          <strong
            className={
              report?.metrics.latency.p95 == null
                ? styles.unmeasured
                : undefined
            }
          >
            {duration(report?.metrics.latency.p95)}
          </strong>
          <span className={styles.muted}>
            {t("{count} замеров", "{count} өлшем", "{count} samples", {
              count: number(report?.metrics.latency.samples ?? 0),
            })}
          </span>
        </div>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2>
              {t(
                "Сравнение подходов",
                "Тәсілдерді салыстыру",
                "Method comparison",
              )}
            </h2>
          </div>
        </div>
        {comparison ? (
          <>
            <span className={styles.challenge}>
              {localizeMessage(integration.challenge!.label, locale)}
            </span>
            <div className={styles.compare}>
              <div>
                <div className={styles.compareLabel}>
                  {t("Самый слабый навык", "Ең әлсіз дағды", "Weakest skill")}
                </div>
                <h2 title={comparison.baseline?.activityId}>
                  {comparison.baseline
                    ? catalogName(comparison.baseline.activityId, locale)
                    : t("Нет кандидата", "Үміткер жоқ", "No candidate")}
                </h2>
                <div className={styles.compareMetrics}>
                  <div>
                    <span>
                      {t(
                        "Закрытие критичных разрывов",
                        "Маңызды тапшылықты азайту",
                        "Critical gap closure",
                      )}
                    </span>
                    <strong>
                      {number(comparison.baselineCriticalClosure)}
                    </strong>
                  </div>
                  <div>
                    <span>
                      {t(
                        "Готовность после",
                        "Кейінгі дайындық",
                        "Readiness after",
                      )}
                    </span>
                    <strong>
                      {comparison.baseline
                        ? percent(comparison.baseline.projectedReadiness)
                        : "—"}
                    </strong>
                  </div>
                </div>
              </div>
              <div>
                <div className={styles.compareLabel}>Career Quest</div>
                <h2 title={comparison.engine?.activityId}>
                  {comparison.engine
                    ? catalogName(comparison.engine.activityId, locale)
                    : t("Нет рекомендации", "Ұсыным жоқ", "No recommendation")}
                </h2>
                <div className={styles.compareMetrics}>
                  <div>
                    <span>
                      {t(
                        "Закрытие критичных разрывов",
                        "Маңызды тапшылықты азайту",
                        "Critical gap closure",
                      )}
                    </span>
                    <strong>{number(comparison.engineCriticalClosure)}</strong>
                  </div>
                  <div>
                    <span>
                      {t(
                        "Готовность после",
                        "Кейінгі дайындық",
                        "Readiness after",
                      )}
                    </span>
                    <strong>
                      {comparison.engine
                        ? percent(comparison.engine.projectedReadiness)
                        : "—"}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
            <details className={styles.disclosure}>
              <summary>
                {t(
                  "Методика сравнения",
                  "Салыстыру әдістемесі",
                  "Comparison method",
                )}
              </summary>
              <p>
                {t(
                  "Базовый подход выбирает самый слабый из доступных для развития навыков. Оба метода используют одинаковые обязательные фильтры и текущие уровни навыков.",
                  "Базалық тәсіл дамытуға болатын ең әлсіз дағдыны таңдайды. Екі тәсіл де бірдей міндетті сүзгілер мен ағымдағы дағды деңгейлерін пайдаланады.",
                  "The baseline selects the weakest skill available for development. Both methods use the same hard filters and effective skills.",
                )}
              </p>
              <p>
                {comparison.baseline
                  ? t(
                      "{skill}: уровень {level}",
                      "{skill}: деңгей {level}",
                      "{skill}: level {level}",
                      {
                        skill: catalogName(comparison.baseline.skillId, locale),
                        level: number(comparison.baseline.level),
                      },
                    )
                  : t(
                      "Нет доступного прироста.",
                      "Қолжетімді өсім жоқ.",
                      "No gain available.",
                    )}
              </p>
              <p>
                {t(
                  "Career Quest учитывает вклад в цель, историю, выполнимость и траекторию. Показано ожидаемое закрытие критичных разрывов после прохождения.",
                  "Career Quest мақсатқа үлесті, тарихты, орындалу мүмкіндігін және траекторияны ескереді. Қатысудан кейінгі маңызды тапшылықтың болжамды азаюы көрсетілген.",
                  "Career Quest considers goal impact, history, feasibility and path diversity. Values show projected critical gap closure after completion.",
                )}
              </p>
            </details>
          </>
        ) : (
          <div className={styles.emptyInline}>
            {t(
              "Выберите демонстрационный профиль в кабинете сотрудника, чтобы увидеть фактическое сравнение.",
              "Нақты салыстыруды көру үшін қызметкер кабинетінде профиль таңдаңыз.",
              "Select a profile in the employee workspace to see the actual comparison.",
            )}
          </div>
        )}
      </section>
      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>
                {t(
                  "Результаты проверок",
                  "Тексеру нәтижелері",
                  "Check results",
                )}
              </h2>
            </div>
            {report && (
              <button
                className={`${styles.button} ${styles.secondary}`}
                onClick={download}
              >
                {t("Скачать JSON", "JSON жүктеу", "Download JSON")}
              </button>
            )}
          </div>
          {!report ? (
            <div className={styles.emptyInline}>
              {t(
                "Проверки ещё не запускались.",
                "Тексерістер әлі іске қосылмады.",
                "No checks have been run yet.",
              )}
            </div>
          ) : (
            <>
              <div role="status" className={styles.resultSummary}>
                <span>
                  <b>{number(report.passed)}</b>{" "}
                  {t("пройдено", "өтті", "passed")}
                </span>
                <span>
                  <b>{number(report.failed)}</b> {t("ошибок", "қате", "failed")}
                </span>
                <span>
                  {
                    {
                      "core-and-ai": t(
                        "Движок и AI",
                        "Қозғалтқыш және AI",
                        "Engine and AI",
                      ),
                      "core-only": t("Движок", "Қозғалтқыш", "Engine"),
                      "ai-only": t(
                        "AI-контракт",
                        "AI келісімшарты",
                        "AI contract",
                      ),
                      empty: t("Нет проверок", "Тексерістер жоқ", "No checks"),
                    }[report.scope]
                  }
                </span>
              </div>
              <div className={styles.resultList}>
                {report.cases.map((item) => (
                  <details
                    className={styles.resultItem}
                    key={item.id}
                    open={item.status === "failed"}
                  >
                    <summary>
                      <b>{localizeMessage(item.name, locale)}</b>
                      <span
                        className={
                          item.status === "passed" ? styles.pass : styles.fail
                        }
                      >
                        {item.status === "passed"
                          ? t("Пройдено", "Өтті", "Passed")
                          : t("Ошибка", "Қате", "Failed")}
                      </span>
                    </summary>
                    <p className={styles.muted}>
                      {localizeMessage(item.detail, locale)}
                    </p>
                  </details>
                ))}
              </div>
            </>
          )}
        </section>
        <div>
          <section className={styles.panel}>
            <h2>{t("AI-объяснение", "AI түсіндірмесі", "AI explanation")}</h2>
            <details className={styles.disclosure}>
              <summary>
                {t(
                  "Какие данные отправляются",
                  "Қандай деректер жіберіледі",
                  "What data is sent",
                )}
              </summary>
              <p>
                {t(
                  "Только разрешённые факты о выбранных кандидатах. Профиль и история остаются в браузере.",
                  "Тек таңдалған үміткер іс-шаралардың рұқсат етілген дәлел фактілері жіберіледі. Профиль мен тарих браузерде қалады.",
                  "Only allowlisted evidence facts for selected candidates are sent. The profile and history stay in the browser.",
                )}
              </p>
            </details>
            <button
              className={styles.button}
              disabled={!integration.reviewRequest || reviewing}
              onClick={reviewNow}
            >
              {reviewing
                ? t(
                    "Проверяем ответ…",
                    "Жауап тексерілуде…",
                    "Checking response…",
                  )
                : t(
                    "Проверить с AI",
                    "AI арқылы тексеру",
                    "Check with AI",
                  )}
            </button>
            {!integration.reviewRequest && (
              <p className={styles.muted}>
                {t(
                  "Сначала подключите факты выбранного профиля.",
                  "Алдымен таңдалған профильдің дәлел деректерін қосыңыз.",
                  "Connect the selected profile evidence first.",
                )}
              </p>
            )}
            {review && review.result.language === locale && (
              <div
                className={styles.reviewResult}
                data-status={review.result.status}
              >
                <p role="status" className={styles.badge}>
                  {statuses[review.result.status]}
                </p>
                {review.source !== integration && (
                  <p className={styles.muted}>
                    {t(
                      "Ответ относится к предыдущему состоянию.",
                      "Жауап алдыңғы күйге қатысты.",
                      "This response refers to an earlier state.",
                    )}
                  </p>
                )}
                <details className={styles.disclosure}>
                  <summary>
                    {t(
                      "Полное объяснение",
                      "Толық түсіндірме",
                      "Full explanation",
                    )}
                  </summary>
                  <p>{review.result.text}</p>
                </details>
              </div>
            )}
          </section>
          <section className={styles.panel}>
            <details className={`${styles.disclosure} ${styles.methodology}`}>
              <summary>
                {t(
                  "Методика и версии",
                  "Әдістеме және нұсқалар",
                  "Methodology and versions",
                )}
              </summary>
              <p>
                {t(
                  "Проверяем ограничения, факты и поведение при отказе модели. Это результаты конкретных сценариев; метрики не оценивают точность карьерного прогноза.",
                  "Шектеулерді, фактілерді және модель істен шыққандағы жұмысты тексереміз. Бұл нақты сценарийлердің нәтижелері; көрсеткіштер мансап болжамының дәлдігін бағаламайды.",
                  "We test constraints, facts and behavior during a model outage. These are results from specific scenarios; the metrics do not measure career prediction accuracy.",
                )}
              </p>
              <p>
                {t(
                  "Скорость рекомендаций — p95 локальных вызовов движка. p50: {p50}; p95: {p95}. Нарушения правил — доля недопустимых рекомендаций. Пересчёт навыков — совпадение истории с эталоном.",
                  "Ұсынымдар жылдамдығы — қозғалтқыштың жергілікті шақыруларының p95 мәні. p50: {p50}; p95: {p95}. Ереже бұзушылықтары — жарамсыз ұсынымдар үлесі. Дағдыларды қайта есептеу — тарих нәтижесінің эталонға сәйкестігі.",
                  "Recommendation speed is the p95 of local engine calls. p50: {p50}; p95: {p95}. Rule violations measure the share of ineligible recommendations. Skill recalculation measures history replay agreement with the reference.",
                  {
                    p50: duration(report?.metrics.latency.p50),
                    p95: duration(report?.metrics.latency.p95),
                  },
                )}
              </p>
              <div className={styles.versionList}>
                <div className={styles.versionRow}>
                  <span>{t("Проверки", "Тексерістер", "Checks")}</span>
                  <span className={styles.code}>career-quest-trust/1.0.0</span>
                </div>
                {integration.versions ? (
                  Object.entries(integration.versions).map(
                    ([name, version]) => (
                      <div className={styles.versionRow} key={name}>
                        <span>
                          {name === "engine"
                            ? t("Движок", "Қозғалтқыш", "Engine")
                            : name === "weights"
                              ? t("Веса", "Салмақтар", "Weights")
                              : name === "adapter"
                                ? t("Адаптер", "Адаптер", "Adapter")
                                : name}
                        </span>
                        <span className={styles.code}>{version}</span>
                      </div>
                    ),
                  )
                ) : (
                  <p className={styles.muted}>
                    {t(
                      "Версии ядра будут доступны после его подключения.",
                      "Қозғалтқыш қосылғаннан кейін оның нұсқалары қолжетімді болады.",
                      "Engine versions will be available after integration.",
                    )}
                  </p>
                )}
              </div>
              <p className={styles.muted}>
                {t(
                  "Нулевой знаменатель отображается как «Не измерено». Скорость проверки фактов не подменяет скорость рекомендаций.",
                  "Бөлім нөл болғанда «Өлшенбеді» көрсетіледі. Тексергіш жылдамдығы ұсынымдар жылдамдығын алмастырмайды.",
                  "A zero denominator is shown as “Not measured.” Verifier check speed is not a substitute for recommendation speed.",
                )}
              </p>
            </details>
          </section>
        </div>
      </div>
    </>
  );
}
