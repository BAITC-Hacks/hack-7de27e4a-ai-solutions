import type { NormalizedDataset } from "@/lib/contracts";
/** B-owned display projection of A's contracts; original normalized state stays in source. */
export type SkillLevels = Readonly<Record<string, number>>;
export type Language = "ru" | "kk" | "en";
export type Activity = Readonly<{
  id: string;
  title: string;
  type: string;
  format: "self_paced" | "online" | "offline";
  durationHours: number;
  recurring: boolean;
  mandatory: boolean;
  gains: readonly { skillId: string; gain: number; maxLevel: number }[];
  upcomingSessions: readonly string[];
}>;
export type Employee = Readonly<{
  id: string;
  name: string;
  role: string;
  grade: string;
  preferredLanguage: Language;
  workFormat: string;
  lastReviewDate: string;
  skills: SkillLevels;
}>;
export type HistoryItem = Readonly<{
  employeeId: string;
  activityId: string;
  status: string;
  date: string;
  completionPct?: number;
}>;
export type Dataset = Readonly<{
  id: string;
  snapshotDate: string;
  employees: readonly Employee[];
  skills: readonly { id: string; name: string }[];
  activities: readonly Activity[];
  history: readonly HistoryItem[];
  /** A may retain its original normalized payload, including role requirements, here. */
  source?: unknown;
}>;
export type Evidence = Readonly<{ id: string; label: string; value: string }>;
export type Recommendation = Readonly<{
  activityId: string;
  rank: number;
  totalScore: number;
  projectedReadiness: number;
  factorScores: Readonly<Record<string, number>>;
  evidence: readonly Evidence[];
  deterministicExplanation: string;
  expectedGains: SkillLevels;
}>;
export type EmployeeView = Readonly<{
  employeeId: string;
  target: { role: string; grade: string } | null;
  effectiveSkills: SkillLevels;
  readiness: number | null;
  gaps: readonly {
    skillId: string;
    current: number;
    required: number;
    critical: boolean;
  }[];
  recommendations: readonly Recommendation[];
  /** All eligible candidates, not merely top-3, for the bounded planner. */
  candidates: readonly Recommendation[];
  completedActivityIds: readonly string[];
  activeActivityIds: readonly string[];
  replayedActivityIds: readonly string[];
  baseline?: { activityId: string; explanation: string };
  /** Reasons come from A's RecommendationResult.excluded; UI must not invent them. */
  excluded?: readonly {
    activityId: string;
    title: string;
    reasons: readonly string[];
  }[];
  explanationStatus: "deterministic" | "verified-ai" | "fallback";
  engineVersion: string;
}>;
export type LedgerEvent = Readonly<{
  id: string;
  requestId: string;
  datasetId: string;
  employeeId: string;
  activityId: string;
  completedAt: string;
  effectiveDate: string;
  before: SkillLevels;
  delta: SkillLevels;
  after: SkillLevels;
}>;
export type Overlay = Readonly<{
  skills: SkillLevels;
  completedActivityIds: readonly string[];
  simulatedActivityIds?: readonly string[];
}>;
export type EvaluationInput = Readonly<{
  dataset: Dataset;
  employeeId: string;
  ledger: readonly LedgerEvent[];
  overlay?: Overlay;
}>;
export type UploadName =
  "employees.json" | "events.json" | "skills.json" | "activity_history.csv";
export type UploadSources = Record<UploadName, string>;
export type ImportIssue = Readonly<{
  file: string;
  path?: string;
  row?: number;
  message: string;
  severity: "error" | "warning";
}>;
export type ImportResult =
  | { ok: true; dataset: Dataset; issues: readonly ImportIssue[] }
  | { ok: false; issues: readonly ImportIssue[] };
export interface IntelligenceAdapter {
  normalizedState?: (
    dataset: Dataset,
    ledger: readonly LedgerEvent[],
  ) => NormalizedDataset;
  /** Owns parsing, aliases, schemas, reference validation and the exact v1.0 mapping. */
  importFiles(files: UploadSources): Promise<ImportResult>;
  /** Pure/synchronous. Owns target, history replay, gaps, eligibility, ranking and evidence.
   * Base = reviewed skills + post-review history + committed ledger.
   * overlay replaces effective skills and adds simulated completions; never replay it again.
   * No LLM call belongs in this function. Use the snapshotDate rather than the wall clock.
   */
  evaluate(input: EvaluationInput): EmployeeView;
}
export const adapterUnavailable: IntelligenceAdapter = {
  async importFiles() {
    return {
      ok: false,
      issues: [
        {
          file: "engine",
          severity: "error",
          message:
            "Подключите адаптер Intelligence участника A. Импорт исходной схемы пока недоступен.",
        },
      ],
    };
  },
  evaluate() {
    throw new Error("Intelligence adapter is not connected");
  },
};
