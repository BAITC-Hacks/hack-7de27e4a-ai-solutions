import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { importCareerQuestDataset } from "@/domain/data";
import {
  detectDatasetSlot,
  JudgeImportError,
  mergeDatasetTexts,
  bundleToFiles,
  type BundleTexts,
} from "@/domain/data/judge-import";
import { recommendForEmployee } from "@/domain/recommendation";

const read = (...segments: string[]) =>
  readFile(path.join(process.cwd(), ...segments), "utf8");

let base: BundleTexts;
let judgeProfiles: string;
let judgeHistory: string;
let bomEmployees: string;

beforeAll(async () => {
  const [employees, events, skills, history] = await Promise.all([
    read("data", "source", "employees.json"),
    read("data", "source", "events.json"),
    read("data", "source", "skills.json"),
    read("data", "source", "activity_history.csv"),
  ]);
  base = { employees, events, skills, history };
  judgeProfiles = await read("fixtures", "judge", "judge_profiles.json");
  judgeHistory = await read("fixtures", "judge", "judge_history.csv");
  bomEmployees = await read("fixtures", "judge", "employees.json");
});

describe("определение типа файла", () => {
  it("узнаёт стандартные имена", () => {
    expect(detectDatasetSlot("employees.json", "{}")).toEqual({
      slot: "employees",
      confidence: "name",
    });
  });

  it("узнаёт профили в файле с произвольным именем", () => {
    expect(detectDatasetSlot("judge_profiles.json", judgeProfiles)).toEqual({
      slot: "employees",
      confidence: "content",
    });
  });

  it("узнаёт историю по колонкам CSV, несмотря на имя и CRLF", () => {
    expect(detectDatasetSlot("whatever.csv", judgeHistory)).toEqual({
      slot: "history",
      confidence: "content",
    });
  });

  it("не спотыкается о BOM", () => {
    expect(detectDatasetSlot("anything.json", bomEmployees).slot).toBe("employees");
  });

  it("не угадывает непонятный файл", () => {
    expect(detectDatasetSlot("notes.txt", "просто текст")).toEqual({
      slot: null,
      reason: "unreadable",
    });
  });
});

describe("режим «дополнить»", () => {
  it("добавляет профили жюри к исходным, не вытесняя их", () => {
    const { bundle, summary } = mergeDatasetTexts({
      base,
      incoming: { employees: judgeProfiles },
      mode: "append",
    });
    expect(summary.addedEmployees).toBe(3);
    expect(summary.updatedEmployees).toBe(0);
    expect(summary.newEmployeeIds).toEqual(["J0001", "J0002", "J0003"]);

    const dataset = importCareerQuestDataset(bundleToFiles(bundle));
    expect(Object.keys(dataset.employeesById)).toHaveLength(203);
    expect(dataset.employeesById.E0028).toBeDefined();
    expect(dataset.employeesById.J0003).toBeDefined();
  });

  it("отклоняет строки истории с неизвестными ссылками и называет номер строки", () => {
    const { bundle, summary } = mergeDatasetTexts({
      base,
      incoming: { employees: judgeProfiles, history: judgeHistory },
      mode: "append",
    });
    expect(summary.addedHistory).toBe(4);
    expect(summary.rejectedTotal).toBe(2);
    expect(summary.rejectedRows).toHaveLength(2);
    expect(summary.rejectedRows[0]).toMatchObject({ row: 6, recordId: "J000005" });
    expect(summary.rejectedRows[0].reason).toContain("EV_099");
    expect(summary.rejectedRows[1]).toMatchObject({ row: 7, recordId: "J000006" });
    expect(summary.rejectedRows[1].reason).toContain("E9999");

    const dataset = importCareerQuestDataset(bundleToFiles(bundle));
    expect(dataset.history).toHaveLength(2743 + 4);
  });

  it("заменяет существующий профиль и считает это обновлением", () => {
    const patched = JSON.stringify({
      employees: [
        { ...JSON.parse(base.employees).employees[0], full_name: "Renamed Person" },
      ],
    });
    const { bundle, summary } = mergeDatasetTexts({
      base,
      incoming: { employees: patched },
      mode: "append",
    });
    expect(summary.addedEmployees).toBe(0);
    expect(summary.updatedEmployees).toBe(1);
    const dataset = importCareerQuestDataset(bundleToFiles(bundle));
    expect(Object.keys(dataset.employeesById)).toHaveLength(200);
    expect(dataset.employeesById.E0001.fullName).toBe("Renamed Person");
  });

  it("требует уже загруженный набор", () => {
    expect(() =>
      mergeDatasetTexts({ base: null, incoming: { employees: judgeProfiles }, mode: "append" }),
    ).toThrow(JudgeImportError);
  });
});

describe("режим «заменить»", () => {
  it("берёт недостающие части из текущего набора и чистит осиротевшую историю", () => {
    const { bundle, summary } = mergeDatasetTexts({
      base,
      incoming: { employees: judgeProfiles },
      mode: "replace",
    });
    const dataset = importCareerQuestDataset(bundleToFiles(bundle));
    expect(Object.keys(dataset.employeesById)).toHaveLength(3);
    expect(Object.keys(dataset.eventsById)).toHaveLength(40);
    // История исходных 200 сотрудников осиротела: отклоняем её, а не падаем.
    expect(summary.rejectedTotal).toBe(2743);
    expect(summary.rejectedRows.length).toBeLessThanOrEqual(50);
    expect(dataset.history).toHaveLength(0);
  });

  it("без базы и без части набора сообщает, чего не хватает", () => {
    expect(() =>
      mergeDatasetTexts({ base: null, incoming: { employees: judgeProfiles }, mode: "replace" }),
    ).toThrow(/events|skills|history/);
  });
});

describe("профили жюри доходят до движка", () => {
  it("каждый добавленный профиль получает разбор без падения", () => {
    const { bundle } = mergeDatasetTexts({
      base,
      incoming: { employees: judgeProfiles, history: judgeHistory },
      mode: "append",
    });
    const dataset = importCareerQuestDataset(bundleToFiles(bundle));
    for (const id of ["J0001", "J0002", "J0003"]) {
      const result = recommendForEmployee(dataset, id);
      expect(result.employeeId).toBe(id);
      expect(result.recommendations.length).toBeLessThanOrEqual(3);
    }
  });

  it("межролевая цель ведёт в целевую роль, а не в следующий грейд текущей", () => {
    const { bundle } = mergeDatasetTexts({
      base,
      incoming: { employees: judgeProfiles },
      mode: "append",
    });
    const dataset = importCareerQuestDataset(bundleToFiles(bundle));
    const target = recommendForEmployee(dataset, "J0001").gapAnalysis.target;
    expect(target?.role).toBe("Product Manager");
    expect(target?.source).toBe("career_goal");
  });

  it("на профиле-ловушке побеждает критичный разрыв, а не самый низкий навык", () => {
    const { bundle } = mergeDatasetTexts({
      base,
      incoming: { employees: judgeProfiles, history: judgeHistory },
      mode: "append",
    });
    const dataset = importCareerQuestDataset(bundleToFiles(bundle));
    const result = recommendForEmployee(dataset, "J0003");
    expect(result.recommendations.length).toBeGreaterThan(0);
    const criticalGaps = result.gapAnalysis.gaps.filter((gap) => gap.critical);
    expect(criticalGaps.length).toBeGreaterThan(0);
    const topGains = Object.keys(result.recommendations[0].effectiveGains);
    expect(topGains).not.toEqual(["SK_DATA_VIZ"]);
  });

  it("профиль без истории не роняет расчёт", () => {
    const { bundle } = mergeDatasetTexts({
      base,
      incoming: { employees: judgeProfiles },
      mode: "append",
    });
    const dataset = importCareerQuestDataset(bundleToFiles(bundle));
    const result = recommendForEmployee(dataset, "J0002");
    expect(result.effectiveProfile.replayEvidence).toHaveLength(0);
  });
});
