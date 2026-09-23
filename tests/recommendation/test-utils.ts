import { readFileSync } from "node:fs";
import path from "node:path";

import { importCareerQuestDataset } from "@/domain/data";
import type { CareerQuestFiles, NormalizedDataset } from "@/lib/contracts";

const fixtureRoot = path.resolve(process.cwd(), "data/source");

export function loadChallengeFiles(): CareerQuestFiles {
  return {
    employees: readFileSync(path.join(fixtureRoot, "employees.json"), "utf8"),
    events: readFileSync(path.join(fixtureRoot, "events.json"), "utf8"),
    skills: readFileSync(path.join(fixtureRoot, "skills.json"), "utf8"),
    activityHistoryCsv: readFileSync(path.join(fixtureRoot, "activity_history.csv"), "utf8"),
  };
}

export function loadChallengeDataset(): NormalizedDataset {
  return importCareerQuestDataset(loadChallengeFiles());
}

export function cloneDataset(dataset: NormalizedDataset): NormalizedDataset {
  return structuredClone(dataset);
}
