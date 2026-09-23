"use client";

import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { recommendForEmployee } from "@/domain/recommendation";
import {
  buildCareerQuestPath,
  computePrivateProgress,
  recommendSkillBuddies,
  simulateActivity,
} from "@/domain/simulation";
import type {
  ActivityHistoryRecord,
  FactorScores,
  NormalizedDataset,
  Recommendation,
  SkillGap,
} from "@/lib/contracts";
import {
  requestBoundedAiReview,
  type AiReviewResult,
} from "@/state/ai-review";
import {
  ensureCompletionLedgerHydrated,
  useCareerQuestStore,
  type DatasetSource,
} from "@/state/career-quest-store";
import {
  describeDatasetImportError,
  importDatasetTextBundle,
  type DatasetImportProblem,
} from "@/state/dataset-import";
import {
  persistCompletion,
  type PersistedCompletion,
} from "@/state/progress-ledger";

import styles from "./career-dashboard.module.css";

const FACTOR_LABELS: Record<keyof FactorScores, string> = {
  targetGapImpact: "Влияние на skill gap",
  engagementFit: "История участия",
  feasibility: "Доступность",
  goalAlignment: "Карьерная цель",
  pathDiversity: "Ценность для пути",
};

const STATUS_LABELS: Record<ActivityHistoryRecord["status"], string> = {
  completed: "Пройдено",
  in_progress: "В процессе",
  dropped: "Не завершено",
  no_show: "Пропущено",
  declined: "Отказ",
  overdue: "Просрочено",
};

const FORMAT_LABELS = {
  online: "Онлайн",
  offline: "Очно",
  self_paced: "В своём темпе",
} as const;

const DATASET_FILE_LABELS = {
  employees: "employees.json",
  skills: "skills.json",
  events: "events.json",
  activityHistoryCsv: "activity_history.csv",
} as const;

type DatasetFileKey = keyof typeof DATASET_FILE_LABELS;
type DatasetFiles = Record<DatasetFileKey, File | null>;
type ImportStatus = "idle" | "loading" | "success" | "error";

function percentage(value: number) {
  return Math.round(value * 100);
}

function precisePercentage(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function selectInitialEmployee(dataset: NormalizedDataset) {
  const candidates = Object.values(dataset.employeesById)
    .map((employee) => {
      const result = recommendForEmployee(dataset, employee.id);
      const top = result.recommendations[0];
      return {
        employee,
        recommendationCount: result.recommendations.length,
        impact: top ? top.projectedReadiness - result.gapAnalysis.readiness : 0,
      };
    })
    .filter((item) => item.recommendationCount > 0)
    .sort(
      (left, right) =>
        right.impact - left.impact ||
        right.recommendationCount - left.recommendationCount ||
        left.employee.id.localeCompare(right.employee.id),
    );

  return candidates[0]?.employee.id ?? Object.keys(dataset.employeesById).sort()[0];
}

function primaryGapForRecommendation(
  recommendation: Recommendation | undefined,
  gaps: SkillGap[],
) {
  if (!recommendation) return gaps.find((gap) => gap.gap > 0);
  return Object.keys(recommendation.effectiveGains)
    .map((skillId) => gaps.find((gap) => gap.skillId === skillId))
    .filter((gap): gap is SkillGap => Boolean(gap))
    .sort(
      (left, right) =>
        Number(right.critical) - Number(left.critical) || right.gap - left.gap,
    )[0];
}

function initials(fullName: string) {
  return fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export interface CareerDashboardProps {
  initialDataset: NormalizedDataset;
  viewerEmployeeId?: string;
  ledgerDatasetFingerprint?: string;
  accessMode?: "employee" | "demo";
  allowDatasetImport?: boolean;
}

export function CareerDashboard({
  initialDataset,
  viewerEmployeeId,
  ledgerDatasetFingerprint,
  accessMode = "demo",
  allowDatasetImport,
}: CareerDashboardProps) {
  const storedDataset = useCareerQuestStore((state) => state.dataset);
  const datasetSource = useCareerQuestStore((state) => state.source);
  const datasetFingerprint = useCareerQuestStore((state) => state.datasetFingerprint);
  const ledgerHydrationStatus = useCareerQuestStore((state) => state.ledgerHydrationStatus);
  const ledger = useCareerQuestStore((state) => state.appliedLedgerEntries);
  const initializeDataset = useCareerQuestStore((state) => state.initializeDataset);
  const replaceDataset = useCareerQuestStore((state) => state.replaceDataset);
  const registerCompletionEntry = useCareerQuestStore((state) => state.registerCompletionEntry);
  const applyCompletion = useCareerQuestStore((state) => state.applyCompletion);
  const dataset = storedDataset ?? initialDataset;
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() =>
    viewerEmployeeId && initialDataset.employeesById[viewerEmployeeId]
      ? viewerEmployeeId
      : selectInitialEmployee(initialDataset),
  );
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [activeRecommendationId, setActiveRecommendationId] = useState<string | null>(null);
  const [previewActivityId, setPreviewActivityId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"reason" | "evidence">("reason");
  const [toast, setToast] = useState<string | null>(null);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [demoToolsOpen, setDemoToolsOpen] = useState(false);
  const [datasetFiles, setDatasetFiles] = useState<DatasetFiles>({
    employees: null,
    skills: null,
    events: null,
    activityHistoryCsv: null,
  });
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importProblems, setImportProblems] = useState<DatasetImportProblem[]>([]);
  const [aiReview, setAiReview] = useState<{
    activityId: string;
    status: "loading" | "done" | "error";
    result?: AiReviewResult;
    message?: string;
  } | null>(null);
  const canImportDataset = allowDatasetImport ?? accessMode === "demo";
  const storageReady =
    ledgerHydrationStatus === "ready" || ledgerHydrationStatus === "unavailable";
  const boundViewerEmployeeId =
    accessMode === "employee" && viewerEmployeeId && dataset.employeesById[viewerEmployeeId]
      ? viewerEmployeeId
      : null;
  const profileAccessGranted = accessMode === "demo" || Boolean(boundViewerEmployeeId);
  const activeEmployeeId = boundViewerEmployeeId ?? (dataset.employeesById[selectedEmployeeId]
    ? selectedEmployeeId
    : viewerEmployeeId && dataset.employeesById[viewerEmployeeId]
      ? viewerEmployeeId
      : selectInitialEmployee(dataset));

  useEffect(() => {
    let cancelled = false;
    const initialSource: DatasetSource =
      accessMode === "employee"
        ? { kind: "employee-view", label: `${initialDataset.meta.dataset} · private view` }
        : { kind: "bundled", label: initialDataset.meta.dataset };
    if (accessMode === "employee" || datasetSource?.kind === "employee-view") {
      replaceDataset(initialDataset, initialSource, ledgerDatasetFingerprint);
    } else {
      initializeDataset(initialDataset);
    }

    void ensureCompletionLedgerHydrated(initialDataset, initialSource)
      .catch(() => {
        if (!cancelled) setToast("Локальное хранилище недоступно: прогресс сохранится до обновления страницы.");
      });

    return () => {
      cancelled = true;
    };
  }, [
    accessMode,
    datasetSource?.kind,
    initialDataset,
    initializeDataset,
    ledgerDatasetFingerprint,
    replaceDataset,
  ]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const employees = useMemo(
    () =>
      Object.values(dataset.employeesById).sort(
        (left, right) => left.fullName.localeCompare(right.fullName) || left.id.localeCompare(right.id),
      ),
    [dataset],
  );

  const visibleEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLocaleLowerCase("ru");
    if (!query) return employees;
    return employees.filter((employee) =>
      `${employee.id} ${employee.fullName} ${employee.role} ${employee.department}`
        .toLocaleLowerCase("ru")
        .includes(query),
    );
  }, [employeeQuery, employees]);

  const result = useMemo(
    () => recommendForEmployee(dataset, activeEmployeeId),
    [activeEmployeeId, dataset],
  );
  const employee = result.effectiveProfile.employee;
  const target = result.gapAnalysis.target;
  const selectedRecommendation =
    result.recommendations.find((item) => item.activityId === activeRecommendationId) ??
    result.recommendations[0];
  const currentAiReview =
    selectedRecommendation && aiReview?.activityId === selectedRecommendation.activityId
      ? aiReview
      : null;
  const previewIsCurrent = Boolean(
    previewActivityId &&
      result.recommendations.some(
        (recommendation) => recommendation.activityId === previewActivityId,
      ),
  );
  const preview = useMemo(
    () =>
      previewActivityId && previewIsCurrent
        ? simulateActivity(dataset, activeEmployeeId, previewActivityId)
        : null,
    [activeEmployeeId, dataset, previewActivityId, previewIsCurrent],
  );
  const careerPath = useMemo(
    () => buildCareerQuestPath(dataset, activeEmployeeId, 3),
    [activeEmployeeId, dataset],
  );
  const privateProgress = useMemo(
    () => computePrivateProgress(dataset, activeEmployeeId),
    [activeEmployeeId, dataset],
  );
  const primaryGap = primaryGapForRecommendation(
    selectedRecommendation,
    result.gapAnalysis.gaps,
  );
  const buddySkillId = primaryGap?.skillId ?? Object.keys(selectedRecommendation?.effectiveGains ?? {})[0];
  const buddies = useMemo(
    () =>
      buddySkillId
        ? recommendSkillBuddies(dataset, activeEmployeeId, buddySkillId, 3)
        : [],
    [activeEmployeeId, buddySkillId, dataset],
  );

  const previewReadiness = preview?.readinessAfter ?? result.gapAnalysis.readiness;
  const readinessDelta = selectedRecommendation
    ? selectedRecommendation.projectedReadiness - result.gapAnalysis.readiness
    : 0;
  const criticalOpenGaps = result.gapAnalysis.gaps.filter((gap) => gap.critical && gap.gap > 0);
  const allSkillRows = useMemo(() => {
    const targetRequirements = target?.profile.requiredSkills ?? {};
    const skillIds = new Set([
      ...Object.keys(result.effectiveProfile.effectiveSkills),
      ...Object.keys(targetRequirements),
    ]);
    return [...skillIds]
      .map((skillId) => {
        const gap = result.gapAnalysis.gaps.find((item) => item.skillId === skillId);
        return {
          skillId,
          name: dataset.skillsById[skillId]?.name ?? skillId,
          currentLevel: result.effectiveProfile.effectiveSkills[skillId] ?? 0,
          requiredLevel: targetRequirements[skillId],
          gap: gap?.gap ?? 0,
          critical: gap?.critical ?? false,
          previewAfter: preview?.skillChanges.find((change) => change.skillId === skillId)?.after,
        };
      })
      .sort(
        (left, right) =>
          Number(right.critical) - Number(left.critical) ||
          right.gap - left.gap ||
          Number(right.requiredLevel !== undefined) - Number(left.requiredLevel !== undefined) ||
          left.name.localeCompare(right.name),
      );
  }, [dataset.skillsById, preview, result.effectiveProfile.effectiveSkills, result.gapAnalysis.gaps, target]);
  const displayedSkills = showAllSkills ? allSkillRows : allSkillRows.slice(0, 8);

  const history = useMemo(
    () =>
      [...(dataset.historyByEmployeeId[activeEmployeeId] ?? [])].sort(
        (left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id),
      ),
    [activeEmployeeId, dataset],
  );
  const displayedHistory = showAllHistory ? history : history.slice(0, 6);
  const participationSummary = useMemo(
    () => ({
      completed: history.filter((record) => record.status === "completed").length,
      missed: history.filter((record) =>
        ["no_show", "dropped", "overdue"].includes(record.status),
      ).length,
      declined: history.filter((record) => record.status === "declined").length,
    }),
    [history],
  );

  const weakestNonTargetSkill = useMemo(() => {
    const required = new Set(Object.keys(target?.profile.requiredSkills ?? {}));
    return Object.entries(result.effectiveProfile.effectiveSkills)
      .filter(([skillId]) => !required.has(skillId))
      .map(([skillId, level]) => ({
        skillId,
        level,
        name: dataset.skillsById[skillId]?.name ?? skillId,
      }))
      .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name))[0];
  }, [dataset.skillsById, result.effectiveProfile.effectiveSkills, target]);

  function handleEmployeeChange(employeeId: string) {
    setSelectedEmployeeId(employeeId);
    setActiveRecommendationId(null);
    setPreviewActivityId(null);
    setAiReview(null);
    setInspectorTab("reason");
    setShowAllHistory(false);
    setShowAllSkills(false);
  }

  function openRecommendation(activityId: string, withPreview = false) {
    setActiveRecommendationId(activityId);
    setAiReview(null);
    setInspectorTab("reason");
    setPreviewActivityId(withPreview ? activityId : null);
  }

  async function importJudgeDataset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { employees, skills, events, activityHistoryCsv } = datasetFiles;
    if (!employees || !skills || !events || !activityHistoryCsv) {
      setImportStatus("error");
      setImportProblems([
        {
          source: "import",
          path: "$",
          message: "Выберите все четыре файла набора данных.",
        },
      ]);
      return;
    }

    setImportStatus("loading");
    setImportProblems([]);
    try {
      const [employeesText, skillsText, eventsText, historyText] = await Promise.all([
        employees.text(),
        skills.text(),
        events.text(),
        activityHistoryCsv.text(),
      ]);
      const importedDataset = importDatasetTextBundle({
        employees: employeesText,
        skills: skillsText,
        events: eventsText,
        activityHistoryCsv: historyText,
      });
      const source: DatasetSource = {
        kind: "imported",
        label: `${importedDataset.meta.dataset} · v${importedDataset.meta.version}`,
      };

      replaceDataset(importedDataset, source);
      let activeImportedDataset = importedDataset;
      try {
        activeImportedDataset = (
          await ensureCompletionLedgerHydrated(importedDataset, source)
        ).dataset;
      } catch {
        setToast("Датасет загружен, но локальный ledger недоступен в этом браузере.");
      }
      const nextEmployeeId =
        viewerEmployeeId && activeImportedDataset.employeesById[viewerEmployeeId]
          ? viewerEmployeeId
          : selectInitialEmployee(activeImportedDataset);
      handleEmployeeChange(nextEmployeeId);
      setEmployeeQuery("");
      setImportStatus("success");
      setToast(
        `Набор принят: ${Object.keys(importedDataset.employeesById).length} профилей, ${Object.keys(importedDataset.eventsById).length} активностей.`,
      );
    } catch (error) {
      setImportStatus("error");
      setImportProblems(describeDatasetImportError(error));
    }
  }

  async function reviewWithBoundedAi() {
    if (!selectedRecommendation) return;
    const activityId = selectedRecommendation.activityId;
    if (datasetSource?.kind === "imported") {
      setAiReview({
        activityId,
        status: "error",
        message:
          "Внешний AI-критик отключён для browser-import: server provenance недоступен. Детерминированное объяснение остаётся источником истины",
      });
      return;
    }
    setAiReview({ activityId, status: "loading" });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const review = await requestBoundedAiReview(
        activeEmployeeId,
        result.recommendations.slice(0, 3),
        employee.preferredLanguage,
        ledger
          .filter((entry) => entry.employeeId === activeEmployeeId)
          .map((entry) => entry.activityId),
        datasetSource?.kind ?? "bundled",
        controller.signal,
      );
      setAiReview({ activityId, status: "done", result: review });
    } catch (error) {
      setAiReview({
        activityId,
        status: "error",
        message:
          error instanceof DOMException && error.name === "AbortError"
            ? "AI-критик не ответил вовремя"
            : error instanceof Error
              ? error.message
              : "AI-критик временно недоступен",
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function completePreviewedActivity() {
    if (!previewActivityId) return;
    if (!datasetFingerprint) {
      setToast("Датасет ещё не готов к сохранению прогресса.");
      return;
    }
    const activityId = previewActivityId;
    const sequence = ledger.filter((entry) => entry.employeeId === activeEmployeeId).length + 1;
    const entry: PersistedCompletion = {
      // Put chronology before activity ID so even external consumers that use the ID as
      // a same-day tie-break cannot reverse the order in which effects were applied.
      id: `LOCAL_${datasetFingerprint.slice(-16)}_${activeEmployeeId}_${String(sequence).padStart(5, "0")}_${activityId}`,
      datasetFingerprint,
      employeeId: activeEmployeeId,
      activityId,
      completedAt: `${dataset.meta.asOfDate}:${String(ledger.length + 1).padStart(5, "0")}`,
    };

    // Clear transient UI before the shared external store changes. Otherwise one intermediate
    // render can try to simulate the just-completed activity and fail as ALREADY_COMPLETED.
    setPreviewActivityId(null);
    setActiveRecommendationId(null);
    setAiReview(null);
    try {
      const completion = applyCompletion(activeEmployeeId, activityId, entry.id);
      registerCompletionEntry(entry);
      let persisted = true;
      try {
        await persistCompletion(entry);
      } catch {
        persisted = false;
      }
      setToast(
        persisted
          ? `Готово: ${completion.simulation.title}. Навыки и следующий шаг пересчитаны, прогресс сохранён локально.`
          : `Готово: ${completion.simulation.title}. Результат применён на эту сессию, но хранилище браузера недоступно.`,
      );
    } catch (error) {
      setPreviewActivityId(activityId);
      setToast(error instanceof Error ? error.message : "Не удалось сохранить завершение активности.");
    }
  }

  return (
    <main className="cq-shell">
      <header className="cq-topbar">
        <div className="cq-brand">
          <div className="cq-brand-mark" aria-hidden="true">◇</div>
          <div>
            <strong>Career Quest</strong>
            <span>AI career navigator</span>
          </div>
        </div>

        {accessMode === "employee" ? (
          <div className={styles.currentProfile} aria-label="Личный профиль">
            <div>
              <span>Личный профиль · identity-bound</span>
              <strong>{employee.fullName} · {employee.id}</strong>
            </div>
          </div>
        ) : (
          <div className={styles.currentProfile} aria-label="Текущий демо-профиль">
            <div>
              <span>Демо-профиль</span>
              <strong>{employee.fullName} · {employee.id}</strong>
            </div>
            <button
              className="cq-button cq-button-ghost"
              type="button"
              aria-expanded={demoToolsOpen}
              onClick={() => setDemoToolsOpen((open) => !open)}
            >
              {demoToolsOpen ? "Закрыть" : "Демо и импорт"}
            </button>
          </div>
        )}

        <div className="cq-account">
          <span>
            {accessMode === "demo" ? "DEMO" : "SELF"} · {profileAccessGranted ? employee.preferredLanguage.toUpperCase() : "PRIVATE"}
          </span>
          <span className="cq-lock-pill">
            {accessMode === "demo" ? "◇ Демо · синтетические профили" : "⌁ Личный режим · без списка коллег"}
          </span>
        </div>
      </header>

      {accessMode === "demo" && demoToolsOpen ? (
        <section className={`cq-card ${styles.demoTools}`} aria-label="Демо-профили и импорт данных">
          <div className={styles.demoHeading}>
            <div>
              <p className="cq-eyebrow">Изолированный demo mode</p>
              <h2>Проверка профиля и judge dataset</h2>
              <p>Список содержит только синтетические профили текущего набора и скрыт в обычном employee mode.</p>
            </div>
            <span className="cq-tag">{datasetSource?.label ?? dataset.meta.dataset}</span>
          </div>

          <div className={styles.demoGrid}>
            <div className={styles.demoProfilePicker}>
              <label htmlFor="demo-employee-search">Тестовый сотрудник</label>
              <input
                id="demo-employee-search"
                className="cq-input"
                value={employeeQuery}
                onChange={(event) => setEmployeeQuery(event.target.value)}
                placeholder="ID, имя, роль или отдел"
              />
              <select
                className="cq-select"
                value={activeEmployeeId}
                onChange={(event) => handleEmployeeChange(event.target.value)}
                aria-label="Синтетический тестовый профиль"
              >
                {visibleEmployees.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName} · {item.role} · {item.grade} ({item.id})
                  </option>
                ))}
              </select>
            </div>

            {canImportDataset ? (
              <form className={styles.importForm} onSubmit={importJudgeDataset}>
                <div className={styles.importFiles}>
                  {(Object.entries(DATASET_FILE_LABELS) as Array<[DatasetFileKey, string]>).map(
                    ([key, label]) => (
                      <label className={styles.fileField} key={key}>
                        <span>{label}</span>
                        <input
                          type="file"
                          accept={key === "activityHistoryCsv" ? ".csv,text/csv" : ".json,application/json"}
                          onChange={(event) =>
                            setDatasetFiles((current) => ({
                              ...current,
                              [key]: event.target.files?.[0] ?? null,
                            }))
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
                <button
                  className="cq-button cq-button-lime"
                  type="submit"
                  disabled={importStatus === "loading"}
                >
                  {importStatus === "loading" ? "Проверяем связи и схему…" : "Загрузить и проверить"}
                </button>
                <div className={styles.importStatus} aria-live="polite">
                  {importStatus === "success" ? "✓ Датасет активен; рекомендации пересчитаны." : null}
                  {importStatus === "error" ? (
                    <div>
                      <strong>Импорт отклонён — текущие данные не изменены.</strong>
                      <ul>
                        {importProblems.slice(0, 6).map((problem, index) => (
                          <li key={`${problem.source}:${problem.path}:${index}`}>
                            {problem.source} · {problem.path}: {problem.message}
                          </li>
                        ))}
                      </ul>
                      {importProblems.length > 6 ? <span>Ещё ошибок: {importProblems.length - 6}</span> : null}
                    </div>
                  ) : null}
                </div>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      {accessMode === "employee" && !profileAccessGranted ? (
        <section className={`cq-card ${styles.accessGate}`} aria-label="Доступ к личному профилю">
          <span aria-hidden="true">⌁</span>
          <div>
            <p className="cq-eyebrow">Private by default</p>
            <h1>Личный профиль не назначен</h1>
            <p>Задайте CAREER_QUEST_VIEWER_ID на сервере; произвольный выбор профиля доступен только в demo mode.</p>
          </div>
        </section>
      ) : (
      <div className="cq-dashboard">
        <section className="cq-main">
          <article className="cq-card cq-hero">
            <div className="cq-hero-top">
              <div>
                <p className="cq-eyebrow">
                  Текущий профиль · {employee.role} {employee.grade} · стаж {employee.tenureMonths} мес.
                </p>
                <h1>
                  {employee.fullName}, вы на <strong>{percentage(previewReadiness)}%</strong> готовы
                  {target ? ` к ${target.role} ${target.grade}` : " к новому маршруту"}
                </h1>
                <p className="cq-hero-copy">
                  {primaryGap
                    ? `Главный доступный рычаг — ${dataset.skillsById[primaryGap.skillId]?.name ?? primaryGap.skillId}. ${preview ? "What-if активен: профиль ещё не изменён." : `Лучший следующий шаг добавит ${Math.max(0, percentage(readinessDelta))} п.п. готовности.`}`
                    : "Все требования текущей цели закрыты или для неё пока нет подходящей активности."}
                </p>
                {target ? (
                  <p className="cq-target-source">
                    {target.source === "career_goal" ? "Личная карьерная цель" : "Автоматический следующий грейд"}
                  </p>
                ) : null}
              </div>
              <div
                className="cq-ring"
                style={{ "--ring-progress": `${previewReadiness * 360}deg` } as CSSProperties}
                title={`Точная готовность: ${precisePercentage(previewReadiness)}`}
              >
                <div className="cq-ring-core">
                  <div>
                    <strong>{percentage(previewReadiness)}%</strong>
                    <span>readiness</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="cq-path-strip" aria-label="Career Quest Path">
              {(careerPath.steps.length ? careerPath.steps : result.recommendations).slice(0, 3).map((step, index) => {
                const activityId = "activityId" in step ? step.activityId : "";
                const title = "title" in step ? step.title : dataset.eventsById[activityId]?.title;
                return (
                  <div
                    className="cq-path-node"
                    data-state={previewActivityId === activityId ? "preview" : index === 0 ? "active" : "next"}
                    key={`${activityId}:${index}`}
                  >
                    <span className="cq-path-dot">{previewActivityId === activityId ? "↗" : index + 1}</span>
                    <div>
                      <span>Шаг {index + 1}</span>
                      <strong>{title}</strong>
                    </div>
                  </div>
                );
              })}
              {!careerPath.steps.length && !result.recommendations.length ? (
                <div className="cq-path-node" data-state="active">
                  <span className="cq-path-dot">✓</span>
                  <div><span>Статус</span><strong>Маршрут завершён</strong></div>
                </div>
              ) : null}
            </div>
          </article>

          <div className="cq-section-head">
            <div>
              <h2>Ваши лучшие следующие шаги</h2>
              <p>Ранжировано по цели, skill gap, истории, выполнимости и разнообразию.</p>
            </div>
            <span className="cq-engine-pill"><span className="cq-engine-dot" /> Hybrid AI · safe fallback</span>
          </div>

          {result.recommendations.length ? (
            <div className="cq-quest-grid">
              {result.recommendations.map((recommendation) => {
                const event = dataset.eventsById[recommendation.activityId];
                const isPreviewed = previewActivityId === recommendation.activityId;
                return (
                  <article
                    className="cq-quest"
                    data-featured={recommendation.rank === 1}
                    key={recommendation.activityId}
                  >
                    <div className="cq-quest-rank">
                      <span className="cq-rank-label">
                        {recommendation.rank === 1 ? "Лучший выбор" : `Альтернатива ${recommendation.rank}`}
                      </span>
                      <span className="cq-score">{Math.round(recommendation.totalScore * 100)} score</span>
                    </div>
                    <h3>{recommendation.title}</h3>
                    <p className="cq-quest-description">{event.description}</p>
                    <div className="cq-quest-impact">
                      {Object.entries(recommendation.effectiveGains).map(([skillId, gain]) => (
                        <span className="cq-tag" data-tone="lime" key={skillId}>
                          +{gain} {dataset.skillsById[skillId]?.name ?? skillId}
                        </span>
                      ))}
                      <span className="cq-tag">{FORMAT_LABELS[event.format]}</span>
                      <span className="cq-tag">{event.durationHours} ч</span>
                      <span className="cq-tag">
                        {percentage(result.gapAnalysis.readiness)} → {percentage(recommendation.projectedReadiness)}%
                      </span>
                    </div>
                    <div className="cq-quest-footer">
                      <button
                        className="cq-button cq-button-soft"
                        onClick={() => openRecommendation(recommendation.activityId)}
                      >
                        Почему это?
                      </button>
                      <button
                        className={`cq-button ${isPreviewed ? "cq-button-soft" : "cq-button-primary"}`}
                        onClick={() => {
                          openRecommendation(recommendation.activityId);
                          setPreviewActivityId(isPreviewed ? null : recommendation.activityId);
                        }}
                      >
                        {isPreviewed ? "Сбросить" : "What-if"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="cq-card cq-empty">
              <div><strong>Подходящих активностей сейчас нет</strong><br />Мы честно не создаём фиктивный следующий шаг.</div>
            </div>
          )}

          <article className="cq-card cq-skills">
            <div className="cq-section-head">
              <div>
                <h2>Карта навыков</h2>
                <p>
                  Effective levels с учётом {result.effectiveProfile.replayEvidence.length} изменений после последней оценки.
                </p>
              </div>
              <button className="cq-button cq-button-ghost" onClick={() => setShowAllSkills((value) => !value)}>
                {showAllSkills ? "Свернуть" : `Все навыки (${allSkillRows.length})`}
              </button>
            </div>
            <div className="cq-skills-grid">
              {displayedSkills.map((skill) => {
                const current = skill.previewAfter ?? skill.currentLevel;
                return (
                  <div className="cq-skill-row" key={skill.skillId}>
                    <div className="cq-skill-label">
                      <strong>{skill.name} {skill.critical ? <em className="cq-critical">critical</em> : null}</strong>
                      <span>{current}{skill.requiredLevel !== undefined ? ` / нужно ${skill.requiredLevel}` : " / 5"}</span>
                    </div>
                    <div className="cq-skill-track">
                      <div
                        className="cq-skill-fill"
                        data-preview={skill.previewAfter !== undefined}
                        style={{ width: `${(current / 5) * 100}%` }}
                      />
                      {skill.requiredLevel !== undefined ? (
                        <span className="cq-requirement-mark" style={{ left: `${(skill.requiredLevel / 5) * 100}%` }} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>

        <aside className="cq-side">
          <article className="cq-card cq-private">
            <div className="cq-private-head">
              <h3>⌁ Личный прогресс</h3>
              <span className="cq-tag">только в личном режиме</span>
            </div>
            <div className="cq-private-value">
              {privateProgress.xp.toLocaleString("ru-RU")} XP <small>· уровень {privateProgress.level}</small>
            </div>
            <div className="cq-xp-track">
              <div className="cq-xp-fill" style={{ width: `${privateProgress.progress * 100}%` }} />
            </div>
            <div className="cq-private-note">
              <span>{privateProgress.levelName}</span>
              <span>до следующего: {Math.max(0, privateProgress.nextLevelXp - privateProgress.currentLevelXp)} XP</span>
            </div>
          </article>

          <article className="cq-card cq-buddy">
            <div className="cq-buddy-head">
              <div>
                <p className="cq-eyebrow">Skill Buddy</p>
                <h3>К кому обратиться</h3>
              </div>
              <div className="cq-buddy-avatar">◎</div>
            </div>
            <p>
              {primaryGap
                ? `Нужна практика по навыку «${dataset.skillsById[primaryGap.skillId]?.name ?? primaryGap.skillId}». Подсказка основана на навыках, а не на рейтинге людей.`
                : "Открытых критичных разрывов нет — можно выбрать buddy для следующей карьерной цели."}
            </p>
            {buddies[0] ? (
              <div className="cq-buddy-person">
                <span className="cq-buddy-avatar">{initials(buddies[0].fullName)}</span>
                <div>
                  <strong>{buddies[0].fullName}</strong>
                  <span>{buddies[0].role} · навык {buddies[0].skillLevel}/5{buddies[0].sameDepartment ? " · тот же отдел" : ""}</span>
                </div>
              </div>
            ) : null}
          </article>

          <article className="cq-card cq-inspector">
            <div className="cq-inspector-head">
              <div>
                <p className="cq-eyebrow">Decision Inspector</p>
                <h3>{selectedRecommendation?.title ?? "Рекомендация не выбрана"}</h3>
              </div>
              {selectedRecommendation ? <span className="cq-score">#{selectedRecommendation.rank}</span> : null}
            </div>

            {selectedRecommendation ? (
              <>
                <div className="cq-tabs">
                  <button className="cq-tab" data-active={inspectorTab === "reason"} onClick={() => setInspectorTab("reason")}>Почему это</button>
                  <button className="cq-tab" data-active={inspectorTab === "evidence"} onClick={() => setInspectorTab("evidence")}>Evidence Receipt</button>
                </div>

                {inspectorTab === "reason" ? (
                  <div>
                    <ul className="cq-reason-list">
                      <li><span className="cq-check">✓</span><span>Текущий профиль: {employee.role} {employee.grade}; цель: {target?.role ?? "не задана"} {target?.grade ?? ""}; стаж {employee.tenureMonths} мес.</span></li>
                      <li><span className="cq-check">✓</span><span>{primaryGap ? `${dataset.skillsById[primaryGap.skillId]?.name ?? primaryGap.skillId}: ${primaryGap.currentLevel} из ${primaryGap.requiredLevel}${primaryGap.critical ? " — критичный навык цели" : ""}.` : "Активность закрывает подтверждённый разрыв цели."}</span></li>
                      <li><span className="cq-check">✓</span><span>Эффективный прирост: {Object.entries(selectedRecommendation.effectiveGains).map(([skillId, gain]) => `+${gain} ${dataset.skillsById[skillId]?.name ?? skillId}`).join(", ")}.</span></li>
                      <li><span className="cq-check">✓</span><span>История: пройдено {participationSummary.completed}, пропущено/не завершено {participationSummary.missed}, отказов {participationSummary.declined}; engagement-fit {percentage(selectedRecommendation.factorScores.engagementFit)}%.</span></li>
                    </ul>

                    <div className="cq-explanation-quote">
                      <strong>AI-объяснение · deterministic fallback</strong>
                      <span>{selectedRecommendation.deterministicExplanation}</span>
                      <button
                        className="cq-button cq-button-ghost"
                        type="button"
                        disabled={currentAiReview?.status === "loading"}
                        onClick={reviewWithBoundedAi}
                      >
                        {currentAiReview?.status === "loading"
                          ? "Проверяет bounded AI…"
                          : "Запросить bounded AI-критика"}
                      </button>
                      {currentAiReview?.status === "done" && currentAiReview.result ? (
                        <div className={styles.aiReview} data-status={currentAiReview.result.status}>
                          <strong>
                            {currentAiReview.result.status === "verified"
                              ? "✓ Verified AI review"
                              : `Safe fallback · ${currentAiReview.result.status}`}
                          </strong>
                          <small>
                            Advisory choice: {currentAiReview.result.selectedCandidateIds.join(", ") || "fallback order"}
                          </small>
                          <span>
                            {currentAiReview.result.reasons
                              .filter((reason) =>
                                currentAiReview.result?.selectedCandidateIds.includes(reason.candidateId),
                              )
                              .map((reason) => reason.explanation)
                              .join(" ") || currentAiReview.result.text}
                          </span>
                          {currentAiReview.result.latencyMs !== undefined ? (
                            <small>{currentAiReview.result.latencyMs} ms · server-reconstructed evidence</small>
                          ) : null}
                        </div>
                      ) : null}
                      {currentAiReview?.status === "error" ? (
                        <div className={styles.aiReview} data-status="fallback">
                          <strong>Safe fallback активен</strong>
                          <span>{currentAiReview.message}. Решение и объяснение выше не изменены.</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="cq-counterfactual">
                      <strong>Почему не самый слабый навык?</strong><br />
                      {weakestNonTargetSkill
                        ? `${weakestNonTargetSkill.name} сейчас на уровне ${weakestNonTargetSkill.level}, но не входит в требования цели ${target?.role ?? ""} ${target?.grade ?? ""}. Низкий уровень сам по себе не делает активность полезным карьерным шагом.`
                        : "Движок выбирает не минимальное значение, а максимальный доказуемый вклад в карьерную цель."}
                    </div>

                    {preview ? (
                      <div className="cq-preview">
                        <div className="cq-preview-values">
                          <span>После выполнения</span>
                          <strong>{percentage(preview.readinessBefore)} → {percentage(preview.readinessAfter)}%</strong>
                        </div>
                        <p>Предпросмотр: исходный профиль ещё не изменён. После подтверждения рекомендации пересчитаются.</p>
                        <button className="cq-button cq-button-lime" onClick={completePreviewedActivity} disabled={!storageReady}>
                          {storageReady ? "Отметить выполненной и пересчитать" : "Загружаем прогресс…"}
                        </button>
                      </div>
                    ) : (
                      <button className="cq-button cq-button-primary" style={{ width: "100%", marginTop: 16 }} onClick={() => setPreviewActivityId(selectedRecommendation.activityId)}>
                        Посмотреть Career Digital Twin
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="cq-factor-list">
                      {(Object.entries(selectedRecommendation.factorScores) as Array<[keyof FactorScores, number]>).map(([factor, score]) => (
                        <div className="cq-factor-row" key={factor}>
                          <span>{FACTOR_LABELS[factor]}</span>
                          <div className="cq-factor-track"><div className="cq-factor-fill" style={{ width: `${score * 100}%` }} /></div>
                          <strong>{percentage(score)}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="cq-evidence-footer">
                      ✓ {selectedRecommendation.evidenceReceipt.evidence.length} фактов подтверждены данными.<br />
                      {selectedRecommendation.evidenceReceipt.engineVersion} · score {selectedRecommendation.totalScore.toFixed(4)} · diversity penalty {selectedRecommendation.evidenceReceipt.diversityPenalty.toFixed(3)}
                    </div>
                    <div className={`cq-evidence-list ${styles.evidenceListScrollable}`}>
                      {selectedRecommendation.evidenceReceipt.evidence.map((item) => (
                        <div className="cq-evidence-item" key={item.id}>
                          <span>{item.label}</span>
                          <strong>{String(item.value)}</strong>
                          <code>{item.source}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="cq-empty">Нет решения для проверки.</div>
            )}
          </article>

          <article className="cq-card cq-history">
            <div className="cq-inspector-head">
              <div>
                <p className="cq-eyebrow">История развития</p>
                <h3>{history.length} активностей</h3>
              </div>
              <button className="cq-button cq-button-ghost" onClick={() => setShowAllHistory((value) => !value)}>
                {showAllHistory ? "Свернуть" : "Показать все"}
              </button>
            </div>
            <div className="cq-history-list">
              {displayedHistory.map((record) => (
                <div className="cq-history-row" key={record.id}>
                  <span className="cq-history-dot" data-status={record.status} />
                  <div>
                    <strong>{dataset.eventsById[record.eventId]?.title ?? record.eventId}</strong>
                    <span>{STATUS_LABELS[record.status]} · {record.assignedBy === "self" ? "по своему выбору" : `назначено: ${record.assignedBy}`}</span>
                  </div>
                  <time>{record.date}</time>
                </div>
              ))}
            </div>
          </article>
        </aside>
      </div>
      )}

      {toast ? <div className="cq-toast" role="status">{toast}</div> : null}
    </main>
  );
}
