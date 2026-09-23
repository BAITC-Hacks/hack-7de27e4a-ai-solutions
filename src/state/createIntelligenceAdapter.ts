import type {
  Dataset,
  EmployeeView,
  EvaluationInput,
  ImportIssue,
  IntelligenceAdapter,
} from "./intelligenceAdapter";

/** Typed bridge between A's importer/recommender and B's display projection.
 * Production binds A's NormalizedDataset and RecommendationResult in realIntelligenceAdapter.
 * Mapping functions adapt field names without copying the ranking or replay algorithms.
 */
export interface IntelligenceBindings<TDataset, TResult> {
  importCareerQuestDataset: (files: {
    employees: unknown | string;
    events: unknown | string;
    skills: unknown | string;
    activityHistoryCsv: string;
  }) => TDataset;
  recommendForEmployee: (
    dataset: TDataset,
    employeeId: string,
    limit?: number,
  ) => TResult;
  datasetView: (dataset: TDataset) => Omit<Dataset, "source">;
  employeeView: (
    result: TResult,
    allCandidates: TResult,
    dataset: TDataset,
  ) => EmployeeView;
  /** Apply B's ledger/overlay to a NEW normalized view. Do not replay gains twice.
   * A's core remains the sole owner of original history replay/target/scoring.
   */
  withProgress: (
    dataset: TDataset,
    input: Pick<EvaluationInput, "employeeId" | "ledger" | "overlay">,
  ) => TDataset;
  validationIssues: (error: unknown) => readonly ImportIssue[];
}

export function createIntelligenceAdapter<TDataset, TResult>(
  bindings: IntelligenceBindings<TDataset, TResult>,
): IntelligenceAdapter {
  return {
    async importFiles(files) {
      try {
        const source = bindings.importCareerQuestDataset({
          employees: files["employees.json"],
          events: files["events.json"],
          skills: files["skills.json"],
          activityHistoryCsv: files["activity_history.csv"],
        });
        return {
          ok: true,
          dataset: { ...bindings.datasetView(source), source },
          issues: [],
        };
      } catch (error) {
        return { ok: false, issues: bindings.validationIssues(error) };
      }
    },
    evaluate(input) {
      if (input.dataset.source === undefined)
        throw new Error("NormalizedDataset отсутствует в источнике адаптера");
      const normalized = bindings.withProgress(
        input.dataset.source as TDataset,
        input,
      );
      const result = bindings.recommendForEmployee(
        normalized,
        input.employeeId,
        3,
      );
      const all = bindings.recommendForEmployee(
        normalized,
        input.employeeId,
        Math.max(3, input.dataset.activities.length),
      );
      return bindings.employeeView(result, all, normalized);
    },
  };
}
