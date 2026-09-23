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
import type { NormalizedDataset } from "@/lib/contracts";
import type { LedgerEvent } from "@/state/intelligenceAdapter";
import styles from "../employee/employee.module.css";

const rules = loadGamificationRules(rawRules);
const rewards = loadRewards(rawRewards);

export interface DevelopmentEconomyProps {
  dataset: NormalizedDataset;
  employeeId: string;
  ledger: readonly LedgerEvent[];
}

/**
 * Экономика развития. Баланс не хранится: он пересчитывается из датасета, журнала
 * и версионированных правил, поэтому повторный импорт даёт тот же результат.
 * Состояние здесь — только намеренные действия: списания, принятые вызовы, отказ.
 */
export function DevelopmentEconomy({ dataset, employeeId, ledger }: DevelopmentEconomyProps) {
  const { t, number } = useI18n();
  const [state, setState] = useState<GamificationState>(emptyGamificationState);
  const [error, setError] = useState<string | null>(null);

  const optedOut = state.optedOut.includes(employeeId);
  const view = useMemo(
    () => balanceForViewer({ dataset, employeeId, ledger, state, rules }),
    [dataset, employeeId, ledger, state],
  );
  const proposals = useMemo(
    () => proposeChallenges(dataset, employeeId, rules),
    [dataset, employeeId],
  );
  const progress = useMemo(
    () => challengeProgress(dataset, employeeId, state, ledger),
    [dataset, employeeId, state, ledger],
  );

  const snapshotDate = dataset.meta.asOfDate;

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
      setError(
        cause instanceof RedemptionError
          ? cause.message
          : t("Не удалось списать баллы", "Ұпайларды шығару мүмкін болмады", "Could not redeem points"),
      );
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="economy-title">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>
            {t("ЭКОНОМИКА РАЗВИТИЯ", "ДАМУ ЭКОНОМИКАСЫ", "DEVELOPMENT ECONOMY")}
          </span>
          <h2 id="economy-title">
            {t("Баллы развития", "Даму ұпайлары", "Development points")}
          </h2>
        </div>
        <span className={styles.tag}>{rules.meta.version}</span>
      </div>

      <p className={styles.muted}>
        {t(
          "Баллы начисляются за добровольное развитие и помощь коллегам. За обязательные активности баллы не начисляются, а рейтингов сотрудников здесь нет.",
          "Ұпайлар ерікті даму мен әріптестерге көмек үшін беріледі. Міндетті іс-шаралар үшін ұпай берілмейді, қызметкерлер рейтингі жоқ.",
          "Points are earned for voluntary development and for helping colleagues. Mandatory activities earn nothing, and there are no employee rankings here.",
        )}
      </p>

      <label className={styles.muted}>
        <input
          type="checkbox"
          checked={optedOut}
          onChange={(event) => setState(setOptedOut(state, employeeId, event.target.checked))}
        />{" "}
        {t("Отключить геймификацию", "Ойындандыруды өшіру", "Turn gamification off")}
      </label>

      {!optedOut && (
        <>
          <div className={styles.datasetMetrics}>
            <div>
              <strong>{number(view.balance)}</strong>
              <span>{t("баллов доступно", "ұпай қолжетімді", "points available")}</span>
            </div>
            <div>
              <strong>{number(view.total)}</strong>
              <span>{t("всего заработано", "барлығы жиналды", "earned in total")}</span>
            </div>
            <div>
              <strong>{number(view.spent)}</strong>
              <span>{t("потрачено", "жұмсалды", "spent")}</span>
            </div>
          </div>

          <details className={styles.methodDetails}>
            <summary>
              {t("Откуда баллы", "Ұпайлар қайдан", "Where the points come from")}
            </summary>
            <ul className={styles.fileList}>
              {view.entries.slice(0, 6).map((entry) => (
                <li key={entry.id}>
                  <strong>+{number(entry.points)}</strong>{" "}
                  {entry.facts
                    .filter((fact) => fact.code !== "completed_at")
                    .map((fact) => `${fact.label}: ${fact.value}`)
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
            <summary>{t("На что потратить", "Неге жұмсауға болады", "What to spend on")}</summary>
            <ul className={styles.fileList}>
              {rewards.map((reward) => (
                <li key={reward.id}>
                  <strong>{reward.title}</strong> · {number(reward.cost)}{" "}
                  {t("баллов", "ұпай", "points")}
                  <br />
                  <span className={styles.muted}>{reward.description}</span>
                  <br />
                  <button
                    className={styles.textButton}
                    disabled={reward.cost > view.balance}
                    onClick={() => redeem(reward.id)}
                  >
                    {reward.cost > view.balance
                      ? t("Пока не хватает", "Әзірге жеткіліксіз", "Not enough yet")
                      : t("Получить", "Алу", "Redeem")}
                  </button>
                </li>
              ))}
            </ul>
          </details>

          <details className={styles.methodDetails}>
            <summary>{t("Личные вызовы", "Жеке сынақтар", "Personal challenges")}</summary>
            <ul className={styles.fileList}>
              {proposals.map((proposal) => {
                const accepted = progress.find((item) => item.challenge.id === proposal.id);
                return (
                  <li key={proposal.id}>
                    {proposal.title}
                    {accepted ? (
                      <>
                        {" · "}
                        {number(accepted.current)}/{number(accepted.target)}
                        {" · "}
                        {t("до", "дейін", "until")} {accepted.challenge.deadline}
                      </>
                    ) : (
                      <>
                        {" "}
                        <button
                          className={styles.textButton}
                          onClick={() =>
                            setState(
                              acceptChallenge(state, employeeId, proposal, snapshotDate, rules),
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
          {error}
        </p>
      )}
    </section>
  );
}

/** HR видит только агрегаты: ни одного имени рядом с баллами. */
export function DevelopmentEconomyAggregate({ state }: { state: GamificationState }) {
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
        <span>{t("вызовов принято", "сынақ қабылданды", "challenges accepted")}</span>
      </div>
    </div>
  );
}
