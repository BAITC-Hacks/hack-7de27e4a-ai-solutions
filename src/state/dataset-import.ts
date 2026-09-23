import {
  DatasetValidationError,
  importCareerQuestDataset,
} from "@/domain/data";
import type { NormalizedDataset, ValidationIssue } from "@/lib/contracts";

export interface DatasetTextBundle {
  employees: string;
  skills: string;
  events: string;
  activityHistoryCsv: string;
}

export interface DatasetImportProblem {
  source: string;
  path: string;
  message: string;
}

export function importDatasetTextBundle(bundle: DatasetTextBundle): NormalizedDataset {
  return importCareerQuestDataset(bundle);
}

export function describeDatasetImportError(error: unknown): DatasetImportProblem[] {
  if (error instanceof DatasetValidationError) {
    return error.issues.map((issue: ValidationIssue) => ({
      source: issue.source,
      path: issue.path,
      message: issue.message,
    }));
  }

  return [
    {
      source: "import",
      path: "$",
      message: error instanceof Error ? error.message : "Не удалось прочитать набор данных",
    },
  ];
}
