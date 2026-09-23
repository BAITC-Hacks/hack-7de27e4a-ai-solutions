"use client";

import { useMemo, useState } from "react";

import {
  buildHrAnalytics,
  type ActivityParticipation,
  type NoStepReason,
} from "@/domain/analytics";
import type { NormalizedDataset } from "@/lib/contracts";
import { useActiveCareerQuestDataset } from "@/lib/evaluation/use-active-dataset";

import styles from "./hr-command-center.module.css";

const REASON_LABELS: Record<NoStepReason, string> = {
  NO_TARGET: "Нет следующей цели",
  TARGET_READY: "Требования уже закрыты",
  NO_ELIGIBLE_ACTIVITY: "Нет подходящей активности",
};

const percent = (value: number) => `${Math.round(value * 100)}%`;
export const PARTICIPATION_PREVIEW_LIMIT = 10;

export function participationRowsForDisplay(
  rows: ActivityParticipation[],
  expanded: boolean,
): ActivityParticipation[] {
  return expanded ? rows : rows.slice(0, PARTICIPATION_PREVIEW_LIMIT);
}

export interface HrCommandCenterProps {
  initialDataset: NormalizedDataset;
}

export function HrCommandCenter({ initialDataset }: HrCommandCenterProps) {
  const active = useActiveCareerQuestDataset(initialDataset);
  const analytics = useMemo(() => buildHrAnalytics(active.dataset), [active.dataset]);
  const [participationExpanded, setParticipationExpanded] = useState(false);
  const maxAffected = Math.max(1, ...analytics.skillGaps.map((gap) => gap.affectedEmployees));
  const displayedParticipation = participationRowsForDisplay(
    analytics.activityParticipation,
    participationExpanded,
  );

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>◇</span>
          <span><strong>Career Quest</strong><small>organization intelligence</small></span>
        </div>
        <div className={styles.roleBadge}>HR view · агрегаты</div>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Снимок на {analytics.asOfDate} · {active.sourceLabel}</p>
            <h1>Где развитию нужна помощь — без рейтинга сотрудников</h1>
            <p>
              Командный центр показывает дефицит навыков, покрытие рекомендациями и участие
              в программах. Он не оценивает результативность и не связывает обучение с оплатой.
            </p>
          </div>
          <div className={styles.heroStatus}>
            <span data-state={active.hydrationStatus} />
            {active.hydrationStatus === "loading"
              ? "Синхронизируем локальный progress ledger"
              : active.hydrationStatus === "unavailable"
                ? "Ledger недоступен — показан исходный snapshot"
                : "Progress ledger учтён"}
            {active.ignoredLedgerEntries
              ? ` · пропущено несовместимых записей: ${active.ignoredLedgerEntries}`
              : ""}
          </div>
        </section>

        <section className={styles.metrics} aria-label="Ключевые метрики">
          <article className={styles.metric}>
            <span>Покрытие следующим шагом</span>
            <strong>{percent(analytics.summary.recommendationCoverage)}</strong>
            <small>{analytics.summary.employeesWithNextStep} из {analytics.summary.targetableEmployees} с целью</small>
          </article>
          <article className={styles.metric}>
            <span>Средняя readiness</span>
            <strong>{percent(analytics.summary.averageReadiness)}</strong>
            <small>агрегат по сотрудникам с целью</small>
          </article>
          <article className={styles.metric} data-alert={analytics.summary.employeesWithoutNextStep > 0}>
            <span>Нужен ручной маршрут</span>
            <strong>{analytics.summary.employeesWithoutNextStep}</strong>
            <small>без доступного следующего шага</small>
          </article>
          <article className={styles.metric}>
            <span>Профилей в snapshot</span>
            <strong>{analytics.summary.employeeCount}</strong>
            <small>никакого employee leaderboard</small>
          </article>
        </section>

        <div className={styles.grid}>
          <section className={`${styles.card} ${styles.gapsCard}`}>
            <div className={styles.cardHead}>
              <div>
                <p className={styles.eyebrow}>Organization skill gaps</p>
                <h2>Где каталог даст максимальный эффект</h2>
              </div>
              <span className={styles.pill}>aggregate only</span>
            </div>
            <div className={styles.gapList}>
              {analytics.skillGaps.slice(0, 9).map((gap) => (
                <div className={styles.gapRow} key={gap.skillId}>
                  <div className={styles.gapLabel}>
                    <strong>{gap.skillName}</strong>
                    <span>{gap.affectedEmployees} сотрудников · {gap.criticalAffectedEmployees} critical</span>
                  </div>
                  <div className={styles.track}>
                    <span style={{ width: `${(gap.affectedEmployees / maxAffected) * 100}%` }} />
                  </div>
                  <strong className={styles.gapValue}>Σ {gap.totalGap}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className={`${styles.card} ${styles.departmentsCard}`}>
            <div className={styles.cardHead}>
              <div>
                <p className={styles.eyebrow}>Coverage by department</p>
                <h2>Где помочь сначала</h2>
              </div>
            </div>
            <div className={styles.departmentList}>
              {analytics.departments.map((department) => (
                <article key={department.department}>
                  <div>
                    <strong>{department.department}</strong>
                    <span>{department.topGapSkillName ?? "Нет открытых gaps"}</span>
                  </div>
                  <div className={styles.coverageValue}>
                    <strong>{percent(department.recommendationCoverage)}</strong>
                    <span>{department.employeesWithNextStep}/{department.targetableEmployees} с целью</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={`${styles.card} ${styles.participationCard}`}>
            <div className={styles.cardHead}>
              <div>
                <p className={styles.eyebrow}>Activity participation</p>
                <h2>Явка и завершение программ</h2>
              </div>
              <div className={styles.cardHeadActions}>
                <span className={styles.pill}>events.json × history.csv</span>
                <button
                  className={styles.tableToggle}
                  type="button"
                  aria-expanded={participationExpanded}
                  aria-controls="hr-participation-rows"
                  onClick={() => setParticipationExpanded((expanded) => !expanded)}
                >
                  {participationExpanded
                    ? `Свернуть до ${PARTICIPATION_PREVIEW_LIMIT}`
                    : `Все ${analytics.activityParticipation.length} событий`}
                </button>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Активность</th><th>Участий</th><th>Завершено</th><th>No-show</th><th>Отказ</th><th>Completion</th></tr></thead>
                <tbody id="hr-participation-rows">
                  {displayedParticipation.map((activity) => (
                    <tr key={activity.eventId}>
                      <td><strong>{activity.title}</strong><small>{activity.eventId}{activity.mandatory ? " · mandatory" : " · voluntary"}</small></td>
                      <td>{activity.total}</td>
                      <td>{activity.completed}</td>
                      <td>{activity.noShow}</td>
                      <td>{activity.declined}</td>
                      <td><span className={styles.rate}>{percent(activity.completionRate)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={`${styles.card} ${styles.queueCard}`}>
            <div className={styles.cardHead}>
              <div>
                <p className={styles.eyebrow}>Operational queue · HR demo role</p>
                <h2>Кому нужен ручной следующий шаг</h2>
              </div>
              <span className={styles.alertPill}>{analytics.noStepEmployees.length} случаев</span>
            </div>
            <p className={styles.privacyNote}>Это рабочая очередь, не рейтинг: порядок по причине и ID, без score результативности.</p>
            <div className={styles.queueList}>
              {analytics.noStepEmployees.slice(0, 10).map((employee) => (
                <article key={employee.employeeId}>
                  <span className={styles.avatar}>{employee.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span>
                  <div>
                    <strong>{employee.fullName}</strong>
                    <span>{employee.department} · {employee.role} {employee.grade}</span>
                  </div>
                  <span className={styles.reason}>{REASON_LABELS[employee.reason]}</span>
                </article>
              ))}
              {!analytics.noStepEmployees.length ? <div className={styles.empty}>Все сотрудники с целью получили следующий шаг.</div> : null}
            </div>
          </section>

          <section className={`${styles.card} ${styles.catalogCard}`}>
            <div className={styles.cardHead}>
              <div>
                <p className={styles.eyebrow}>Catalog coverage</p>
                <h2>Разрывы без подходящего события</h2>
              </div>
            </div>
            <div className={styles.catalogList}>
              {analytics.catalogGaps.slice(0, 8).map((gap) => (
                <article key={gap.skillId}>
                  <div><strong>{gap.skillName}</strong><span>{gap.catalogActivityCount} добровольных активностей в каталоге</span></div>
                  <span>{gap.employeesWithoutEligibleActivity} без доступного шага</span>
                </article>
              ))}
              {!analytics.catalogGaps.length ? <div className={styles.empty}>Каталог покрывает все открытые gaps хотя бы одной доступной активностью.</div> : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
