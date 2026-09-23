"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { recommendForEmployee } from "@/domain/recommendation";
import type { NormalizedDataset } from "@/lib/contracts";
import { evaluateTrustMetrics } from "@/lib/evaluation/trust-metrics";
import { useActiveCareerQuestDataset } from "@/lib/evaluation/use-active-dataset";

import styles from "./trust-center.module.css";

const percent = (value: number) => `${Math.round(value * 100)}%`;

interface LatencySummary {
  p50: number;
  p95: number;
  samples: number;
}

function percentile(sorted: number[], fraction: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function measureEngineLatency(dataset: NormalizedDataset): LatencySummary {
  const durations = Object.keys(dataset.employeesById)
    .sort()
    .map((employeeId) => {
      const startedAt = performance.now();
      recommendForEmployee(dataset, employeeId);
      return performance.now() - startedAt;
    })
    .sort((left, right) => left - right);
  return {
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    samples: durations.length,
  };
}

export interface TrustCenterProps {
  initialDataset: NormalizedDataset;
  modelConfigured: boolean;
}

export function TrustCenter({ initialDataset, modelConfigured }: TrustCenterProps) {
  const active = useActiveCareerQuestDataset(initialDataset);
  const metrics = useMemo(() => evaluateTrustMetrics(active.dataset), [active.dataset]);
  const [latency, setLatency] = useState<LatencySummary | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLatency(measureEngineLatency(active.dataset));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active.dataset]);

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>◇</span>
          <span><strong>Career Quest</strong><small>decision assurance</small></span>
        </div>
        <div className={styles.mode} data-live={modelConfigured}>
          <span /> {modelConfigured ? "LLM critic configured" : "Deterministic fallback active"}
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>AI Trust Center · {metrics.engineVersion}</p>
            <h1>Не «поверьте AI».<br /><em>Проверьте каждое решение.</em></h1>
            <p>
              Recommendation engine остаётся источником фактов. LLM возвращает только ID
              из allowlist, а сервер сам собирает видимый текст из рассчитанного evidence.
            </p>
          </div>
          <div className={styles.shield} aria-label="Trust gates status">
            <span>✓</span>
            <strong>{metrics.gates.filter((gate) => gate.passed).length}/{metrics.gates.length}</strong>
            <small>deterministic gates green</small>
          </div>
        </section>

        <section className={styles.metrics} aria-label="Trust metrics">
          <article>
            <span>Eligibility violations</span>
            <strong data-good={metrics.eligibilityViolations === 0}>{metrics.eligibilityViolations}</strong>
            <small>из {metrics.recommendationsEvaluated} рекомендаций</small>
          </article>
          <article>
            <span>Evidence receipt completeness</span>
            <strong data-good={metrics.evidenceReceiptCompletenessRate === 1}>{percent(metrics.evidenceReceiptCompletenessRate)}</strong>
            <small>target + gap + gain + history + projection</small>
          </article>
          <article>
            <span>Deterministic rerun</span>
            <strong data-good={metrics.deterministicStabilityRate === 1}>{percent(metrics.deterministicStabilityRate)}</strong>
            <small>{metrics.employeesEvaluated} профилей рассчитаны дважды</small>
          </article>
          <article>
            <span>Не weakest-skill baseline</span>
            <strong>{percent(metrics.weakestSkillBaselineDisagreementRate)}</strong>
            <small>решений отличаются от наивного baseline</small>
          </article>
          <article>
            <span>Engine latency p50 / p95</span>
            <strong className={styles.latencyValue}>
              {latency ? `${latency.p50.toFixed(2)} / ${latency.p95.toFixed(2)} ms` : "измеряем…"}
            </strong>
            <small>{latency ? `${latency.samples} локальных расчётов` : "без сетевого запроса"}</small>
          </article>
        </section>

        <div className={styles.grid}>
          <section className={`${styles.card} ${styles.gatesCard}`}>
            <div className={styles.cardHead}>
              <div>
                <p className={styles.eyebrow}>Live deterministic evaluation</p>
                <h2>Release gates на текущем dataset</h2>
              </div>
              <span className={styles.snapshot}>{active.sourceLabel} · {metrics.asOfDate}</span>
            </div>
            <div className={styles.gateList}>
              {metrics.gates.map((gate) => (
                <article key={gate.id} data-passed={gate.passed}>
                  <span className={styles.gateIcon}>{gate.passed ? "✓" : "!"}</span>
                  <div><strong>{gate.label}</strong><p>{gate.detail}</p></div>
                  <span className={styles.gateStatus}>{gate.passed ? "PASS" : "CHECK"}</span>
                </article>
              ))}
            </div>
          </section>

          <section className={`${styles.card} ${styles.coverageCard}`}>
            <p className={styles.eyebrow}>Dataset coverage</p>
            <h2>{metrics.employeesEvaluated} профилей</h2>
            <div className={styles.coverageRing} style={{ "--coverage": `${metrics.recommendationCoverage * 360}deg` } as CSSProperties}>
              <div><strong>{percent(metrics.recommendationCoverage)}</strong><span>получили шаг</span></div>
            </div>
            <dl>
              <div><dt>History replay</dt><dd>{metrics.historyReplayEmployees}</dd></div>
              <div><dt>Честный no-step</dt><dd>{metrics.noStepEmployees}</dd></div>
              <div><dt>Ledger</dt><dd>{active.hydrationStatus === "ready" ? "synced" : active.hydrationStatus}</dd></div>
            </dl>
          </section>

          <section className={`${styles.card} ${styles.protocolCard}`}>
            <div className={styles.cardHead}>
              <div>
                <p className={styles.eyebrow}>Bounded LLM protocol</p>
                <h2>Модель не может переписать факты</h2>
              </div>
              <span className={styles.apiBadge}>POST /api/ai/review</span>
            </div>
            <div className={styles.flow}>
              <article><span>01</span><strong>Engine shortlist</strong><p>Детерминированный ranking готов до LLM.</p></article>
              <i>→</i>
              <article><span>02</span><strong>Server reconstruction</strong><p>Браузер передаёт только employee/candidate/completion IDs; сервер проверяет replay и восстанавливает evidence.</p></article>
              <i>→</i>
              <article><span>03</span><strong>ID-only model output</strong><p>Allowlist IDs и минимум три citations; свободный текст от модели не принимается.</p></article>
              <i>→</i>
              <article><span>04</span><strong>Grounded renderer</strong><p>Текст строится сервером из cited evidence или включается deterministic fallback.</p></article>
            </div>
          </section>

          <section className={`${styles.card} ${styles.guardsCard}`}>
            <div className={styles.cardHead}>
              <div>
                <p className={styles.eyebrow}>Verifier policy</p>
                <h2>Что блокируется</h2>
              </div>
            </div>
            <div className={styles.guardGrid}>
              <article><span>⊘</span><strong>Unknown candidate</strong><p>ID отсутствует в engine allowlist.</p></article>
              <article><span>⊘</span><strong>Foreign evidence</strong><p>Evidence принадлежит другой рекомендации.</p></article>
              <article><span>⊘</span><strong>Model-authored prose</strong><p>Модель не управляет пользовательским текстом и числовыми claims.</p></article>
              <article><span>⊘</span><strong>Prompt injection</strong><p>Строки evidence всегда untrusted data.</p></article>
              <article><span>↯</span><strong>Timeout / outage</strong><p>Через 2.5 секунды включается fallback.</p></article>
              <article><span>⌁</span><strong>Raw PII</strong><p>Strict request schema отклоняет лишние поля.</p></article>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
