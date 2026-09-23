"use client";

import { useMemo, useState } from "react";

import rawRules from "../../../data/gamification_rules.json";
import rawRewards from "../../../data/rewards.json";
import {
  acceptChallenge,
  aggregateGamification,
  balanceForViewer,
  challengeProgress,
  emptyGamificationState,
  loadGamificationRules,
  loadRewards,
  proposeChallenges,
  redeemReward,
  RedemptionError,
  setOptedOut,
  type GamificationState,
} from "@/domain/gamification";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { catalogName } from "@/lib/i18n/domain";
import type { NormalizedDataset } from "@/lib/contracts";
import type { LedgerEvent } from "@/state/intelligenceAdapter";
import styles from "../employee/employee.module.css";

const rules = loadGamificationRules(rawRules);
const rewards = loadRewards(rawRewards);

export interface DevelopmentEconomyProps {
  dataset: NormalizedDataset;
  employeeId: string;
  ledger: readonly LedgerEvent[];
  /** Original workspace object stays stable on completion; a new import resets local actions. */
  workspace?: object;
}

/**
 * Экономика развития. Баланс не хранится: он пересчитывается из датасета, журнала
 * и версионированных правил, поэтому повторный импорт даёт тот же результат.
 * Состояние здесь — только намеренные действия: списания, принятые вызовы, отказ.
 */
export function DevelopmentEconomy({
  dataset,
  employeeId,
  ledger,
  workspace = dataset,
}: DevelopmentEconomyProps) {
  const { t, number, locale, date } = useI18n();
  const [activeWorkspace, setActiveWorkspace] = useState(workspace);
  const [state, setState] = useState<GamificationState>(emptyGamificationState);
  const [error, setError] = useState<
    RedemptionError["code"] | "UNKNOWN" | null
  >(null);
  if (activeWorkspace !== workspace) {
    setActiveWorkspace(workspace);
    setState(emptyGamificationState);
    setError(null);
  }
  const rewardCopy = {
    external_course: {
      title: t(
        "Оплата внешнего курса",
        "Сыртқы курс ақысын төлеу",
        "External course funding",
      ),
      description: t(
        "Обучение навыку, для которого нет внутренней программы.",
        "Ішкі бағдарламасы жоқ дағдыны үйрену.",
        "Training for a skill without an internal programme.",
      ),
    },
    mentor_hour: {
      title: t(
        "Час с ведущим специалистом",
        "Жетекші маманмен бір сағат",
        "An hour with a lead specialist",
      ),
      description: t(
        "Личная сессия по навыку, важному для карьерной цели.",
        "Мансаптық мақсатқа маңызды дағды бойынша жеке кездесу.",
        "A personal session on a skill important to your career goal.",
      ),
    },
    learning_day: {
      title: t("День на обучение", "Оқуға арналған күн", "A day for learning"),
      description: t(
        "Рабочий день, выделенный на развитие.",
        "Дамуға бөлінген жұмыс күні.",
        "A working day dedicated to development.",
      ),
    },
    conference: {
      title: t(
        "Билет на профильную конференцию",
        "Кәсіби конференцияға билет",
        "Industry conference ticket",
      ),
      description: t(
        "Конференция по направлению вашей карьерной цели.",
        "Мансаптық мақсатыңызға сәйкес конференция.",
        "A conference aligned with your career goal.",
      ),
    },
  };
  const factLabels: Record<string, string> = {
    activity: t("Активность", "Іс-шара", "Activity"),
    base: t("Базовые баллы", "Базалық ұпайлар", "Base points"),
    critical_multiplier: t(
      "Критичный множитель",
      "Маңызды дағды көбейткіші",
      "Critical-skill multiplier",
    ),
    relevance: t("Релевантность цели", "Мақсатқа сәйкестік", "Goal relevance"),
    critical_skill: t("Критичный навык", "Маңызды дағды", "Critical skill"),
    thread: t(
      "Менторская беседа",
      "Тәлімгерлік әңгіме",
      "Mentoring conversation",
    ),
    from: t("От коллеги", "Әріптестен", "From a colleague"),
  };
  const errorText = {
    UNKNOWN_REWARD: t(
      "Эта награда недоступна",
      "Бұл сыйлық қолжетімсіз",
      "This reward is unavailable",
    ),
    INSUFFICIENT_BALANCE: t(
      "Недостаточно баллов",
      "Ұпай жеткіліксіз",
      "Not enough points",
    ),
    OPTED_OUT: t(
      "Геймификация отключена",
      "Ойындандыру өшірілген",
      "Gamification is off",
    ),
    UNKNOWN: t(
      "Не удалось списать баллы",
      "Ұпайларды шығару мүмкін болмады",
      "Could not redeem points",
    ),
  };

  const optedOut = state.optedOut.includes(employeeId);
  const view = useMemo(
    () => balanceForViewer({ dataset, employeeId, ledger, state, rules }),
    [dataset, employeeId, ledger, state],
  );
  const proposals = useMemo(
    () =>
      proposeChallenges(dataset, employeeId, rules).filter(
        (proposal) => proposal.kind !== "mentor_once",
      ),
    [dataset, employeeId],
  );
  const progress = useMemo(
    () => challengeProgress(dataset, employeeId, state, ledger),
    [dataset, employeeId, state, ledger],
  );

  const snapshotDate = dataset.meta.asOfDate;
  const visibleChallenges = [
    ...progress
      .map((item) => item.challenge)
      .filter((item) => item.kind !== "mentor_once"),
    ...proposals.filter(
      (proposal) => !progress.some((item) => item.challenge.id === proposal.id),
    ),
  ];

  const redeem = (rewardId: string) => {
    setError(null);
    try {
      const result = redeemReward({
        state,
        employeeId,
        rewardId,
        rewards,
        balance: view.balance,
        at: snapshotDate,
        requestId: `${employeeId}:${rewardId}:${state.redemptions.length}`,
      });
      setState(result.state);
    } catch (cause) {
      setError(cause instanceof RedemptionError ? cause.code : "UNKNOWN");
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="economy-title">
      <details className={styles.disclosure}>
        <summary>
          <h2 id="economy-title">
            {t("Баллы развития", "Даму ұпайлары", "Development points")}
          </h2>
          <span className={styles.disclosureMeta}>{number(view.balance)}</span>
        </summary>
        <div className={styles.disclosureContent}>
          <p className={styles.muted}>
            {t(
              "Баллы начисляются за добровольное развитие. За обязательные активности баллы не начисляются, а рейтингов сотрудников здесь нет.",
              "Ұпайлар ерікті даму үшін беріледі. Міндетті іс-шаралар үшін ұпай берілмейді, қызметкерлер рейтингі жоқ.",
              "Points are earned for voluntary development. Mandatory activities earn nothing, and there are no employee rankings here.",
            )}
          </p>
          <p className={styles.muted}>
            {t(
              "Демо-обмен без оплаты и выдачи наград. Принятые вызовы, списания и настройки действуют до ухода с этой страницы или нового импорта; их не отправляют в HR.",
              "Төлемсіз және сыйлық берусіз демо айырбастау. Қабылданған сынақтар, жұмсалған ұпайлар мен баптаулар осы беттен шыққанша немесе жаңа импортқа дейін сақталады; HR-ға жіберілмейді.",
              "Demo redemption without payment or reward fulfilment. Accepted challenges, spending and settings last until you leave this page or import again; they are not sent to HR.",
            )}
          </p>

          <label className={styles.muted}>
            <input
              type="checkbox"
              checked={optedOut}
              onChange={(event) =>
                setState(setOptedOut(state, employeeId, event.target.checked))
              }
            />{" "}
            {t(
              "Отключить геймификацию",
              "Ойындандыруды өшіру",
              "Turn gamification off",
            )}
          </label>

          {!optedOut && (
            <>
              <div className={styles.datasetMetrics}>
                <div>
                  <strong>{number(view.balance)}</strong>
                  <span>
                    {t(
                      "баллов доступно",
                      "ұпай қолжетімді",
                      "points available",
                    )}
                  </span>
                </div>
                <div>
                  <strong>{number(view.total)}</strong>
                  <span>
                    {t(
                      "всего заработано",
                      "барлығы жиналды",
                      "earned in total",
                    )}
                  </span>
                </div>
                <div>
                  <strong>{number(view.spent)}</strong>
                  <span>{t("потрачено", "жұмсалды", "spent")}</span>
                </div>
              </div>

              <details className={styles.methodDetails}>
                <summary>
                  {t(
                    "Откуда баллы",
                    "Ұпайлар қайдан",
                    "Where the points come from",
                  )}
                </summary>
                <ul className={styles.fileList}>
                  {[...view.entries]
                    .reverse()
                    .sort((a, b) => b.at.localeCompare(a.at))
                    .slice(0, 6)
                    .map((entry) => (
                      <li key={entry.id}>
                        <strong>+{number(entry.points)}</strong>{" "}
                        {entry.facts
                          .filter((fact) => fact.code !== "completed_at")
                          .map(
                            (fact) =>
                              `${factLabels[fact.code] ?? fact.code}: ${typeof fact.value === "number" ? number(fact.value) : catalogName(String(fact.value), locale)}`,
                          )
                          .join(" · ")}
                      </li>
                    ))}
                </ul>
                {view.skippedMandatory > 0 && (
                  <p className={styles.muted}>
                    {t(
                      "Обязательных активностей не засчитано",
                      "Міндетті іс-шаралар есептелмеді",
                      "Mandatory activities not counted",
                    )}
                    : {number(view.skippedMandatory)}
                  </p>
                )}
              </details>

              <details className={styles.methodDetails}>
                <summary>
                  {t(
                    "На что потратить",
                    "Неге жұмсауға болады",
                    "What to spend on",
                  )}
                </summary>
                <ul className={styles.fileList}>
                  {rewards.map((reward) => (
                    <li key={reward.id}>
                      <strong>{rewardCopy[reward.kind].title}</strong> ·{" "}
                      {number(reward.cost)} {t("баллов", "ұпай", "points")}
                      <br />
                      <span className={styles.muted}>
                        {rewardCopy[reward.kind].description}
                      </span>
                      <br />
                      <button
                        className={styles.textButton}
                        disabled={reward.cost > view.balance}
                        onClick={() => redeem(reward.id)}
                      >
                        {reward.cost > view.balance
                          ? t(
                              "Пока не хватает",
                              "Әзірге жеткіліксіз",
                              "Not enough yet",
                            )
                          : t(
                              "Обменять в демо",
                              "Демода айырбастау",
                              "Redeem in demo",
                            )}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>

              <details className={styles.methodDetails}>
                <summary>
                  {t("Личные вызовы", "Жеке сынақтар", "Personal challenges")}
                </summary>
                <ul className={styles.fileList}>
                  {visibleChallenges.map((proposal) => {
                    const accepted = progress.find(
                      (item) => item.challenge.id === proposal.id,
                    );
                    return (
                      <li key={proposal.id}>
                        {proposal.kind === "close_critical_gap"
                          ? t(
                              "Закрыть критичный разрыв: {skill}",
                              "Маңызды алшақтықты жабу: {skill}",
                              "Close a critical gap: {skill}",
                              {
                                skill: catalogName(
                                  proposal.skillId ?? "",
                                  locale,
                                ),
                              },
                            )
                          : proposal.kind === "complete_voluntary"
                            ? t(
                                "Завершить добровольные активности: {count}",
                                "Ерікті іс-шараларды аяқтау: {count}",
                                "Complete voluntary activities: {count}",
                                { count: number(proposal.target) },
                              )
                            : t(
                                "Помочь коллеге как наставник",
                                "Әріптеске тәлімгер ретінде көмектесу",
                                "Help a colleague as a mentor",
                              )}
                        {accepted ? (
                          <>
                            {" · "}
                            {number(accepted.current)}/{number(accepted.target)}
                            {" · "}
                            {t("до", "дейін", "until")}{" "}
                            {date(accepted.challenge.deadline)}
                          </>
                        ) : (
                          <>
                            {" "}
                            <button
                              className={styles.textButton}
                              onClick={() =>
                                setState(
                                  acceptChallenge(
                                    state,
                                    employeeId,
                                    proposal,
                                    snapshotDate,
                                    rules,
                                  ),
                                )
                              }
                            >
                              {t("Принять", "Қабылдау", "Accept")}
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className={styles.muted}>
                  {t(
                    "Срок считается от даты среза данных. Невыполненный вызов ничего не отнимает.",
                    "Мерзім деректер күнінен бастап есептеледі. Орындалмаған сынақ ештеңе алмайды.",
                    "The deadline counts from the dataset snapshot. An unfinished challenge takes nothing away.",
                  )}
                </p>
              </details>
            </>
          )}

          {error && (
            <p role="alert" className={styles.error}>
              {errorText[error]}
            </p>
          )}
          <p className={styles.muted}>
            {t("Правила", "Ережелер", "Rules")}: {rules.meta.version}
          </p>
        </div>
      </details>
    </section>
  );
}

/** HR видит только агрегаты: ни одного имени рядом с баллами. */
export function DevelopmentEconomyAggregate({
  state,
}: {
  state: GamificationState;
}) {
  const { t, number } = useI18n();
  const aggregate = aggregateGamification(state, rewards);
  return (
    <div className={styles.datasetMetrics}>
      <div>
        <strong>{number(aggregate.participants)}</strong>
        <span>{t("участников", "қатысушы", "participants")}</span>
      </div>
      <div>
        <strong>{number(aggregate.redemptionsTotal)}</strong>
        <span>{t("наград получено", "сыйлық алынды", "rewards redeemed")}</span>
      </div>
      <div>
        <strong>{number(aggregate.challengesAccepted)}</strong>
        <span>
          {t("вызовов принято", "сынақ қабылданды", "challenges accepted")}
        </span>
      </div>
    </div>
  );
}
