import { readFile } from "node:fs/promises";
import path from "node:path";

import type { NormalizedDataset } from "@/lib/contracts";

import { importCareerQuestDataset } from "./importer";

export async function loadBundledDataset(): Promise<NormalizedDataset> {
  const sourceRoot = path.join(process.cwd(), "data", "source");
  const [employees, events, skills, activityHistoryCsv] = await Promise.all([
    readFile(path.join(sourceRoot, "employees.json"), "utf8"),
    readFile(path.join(sourceRoot, "events.json"), "utf8"),
    readFile(path.join(sourceRoot, "skills.json"), "utf8"),
    readFile(path.join(sourceRoot, "activity_history.csv"), "utf8"),
  ]);

  return importCareerQuestDataset({ employees, events, skills, activityHistoryCsv });
}
