import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DatasetValidationError,
  importCareerQuestDataset,
} from "@/domain/data";
import type { CareerQuestFiles } from "@/lib/contracts";
import type { Locale } from "@/lib/i18n/core";
import { formatDate } from "@/lib/i18n/core";
import {
  catalogName,
  localizeEvidence,
  localizeMessage,
  localizedBaseline,
  localizedExplanation,
} from "@/lib/i18n/domain";
import { createDatasetAuditCases } from "@/lib/evaluation/dataset-audit";
import { createAIContractCases } from "@/lib/evaluation/ai-suite";
import { runEvaluation } from "@/lib/evaluation/harness";
import {
  createRealIntelligenceAdapter,
  projectDataset,
} from "@/state/realIntelligenceAdapter";

const read = (name: string) =>
  readFileSync(new URL(`../../data/source/${name}`, import.meta.url), "utf8");
const files: CareerQuestFiles = {
  employees: read("employees.json"),
  skills: read("skills.json"),
  events: read("events.json"),
  activityHistoryCsv: read("activity_history.csv"),
};
const source = importCareerQuestDataset(files);
const dataset = projectDataset(source);
const adapter = createRealIntelligenceAdapter();
const view = adapter.evaluate({ dataset, employeeId: "E0028", ledger: [] });
const locales: Locale[] = ["ru", "kk", "en"];
const numericTokens = (value: string) =>
  (value.match(/\d+(?:\.\d+)?/g) ?? []).sort();

describe("display localization without changing career decisions", () => {
  it("renders real Kazakh month names even when the browser omits Kazakh ICU data", () => {
    expect(formatDate("2026-10-08", "kk")).toBe("8 қазан 2026");
    expect(formatDate("2026-11-19", "kk")).toBe("19 қараша 2026");
    expect(formatDate("unknown", "kk")).toBe("unknown");
  });
  it("covers all 60 skills and 40 events by both catalog label and ID in three languages", () => {
    expect(dataset.skills).toHaveLength(60);
    expect(dataset.activities).toHaveLength(40);
    const brands = new Set([
      "Python",
      "Java",
      "SQL",
      "CI/CD",
      "JavaScript",
      "TypeScript",
      "React",
    ]);
    for (const item of [
      ...dataset.skills.map(({ id, name }) => ({ id, title: name })),
      ...dataset.activities,
    ]) {
      expect(catalogName(item.id, "en")).toBe(item.title);
      for (const locale of locales) {
        expect(catalogName(item.id, locale)).toBe(
          catalogName(item.title, locale),
        );
        expect(catalogName(item.id, locale)).not.toBe(item.id);
        if (locale !== "en" && !brands.has(item.title))
          expect(catalogName(item.title, locale)).not.toBe(item.title);
      }
    }
  });

  it("covers every role, grade and data status while preserving unfamiliar imported names", () => {
    const roles = [
      ...new Set(dataset.employees.map((employee) => employee.role)),
    ];
    expect(roles).toHaveLength(8);
    for (const value of [...roles, "Junior", "Middle", "Senior", "Lead"]) {
      expect(catalogName(value, "en")).toBe(value);
      expect(catalogName(value, "ru")).not.toBe(value);
      expect(catalogName(value, "kk")).not.toBe(value);
    }
    for (const value of [
      "office",
      "remote",
      "hybrid",
      "self_paced",
      "in_progress",
      "completed",
      "dropped",
      "no_show",
      "declined",
      "overdue",
    ]) {
      for (const locale of locales)
        expect(catalogName(value, locale)).not.toBe(value);
    }
    for (const locale of locales) {
      expect(catalogName("Жанар Сәуле", locale)).toBe("Жанар Сәуле");
      expect(catalogName("My New Workshop 2027", locale)).toBe(
        "My New Workshop 2027",
      );
      expect(catalogName("SK_CUSTOM", locale)).toBe("SK_CUSTOM");
    }
  });

  it("uses structured gains, all factor scores, history counts and readiness in the selected language", () => {
    const rec = view.recommendations[0];
    const history = rec.evidence.find((item) =>
      item.id.startsWith("history:"),
    )!;
    for (const locale of locales) {
      const explanation = localizedExplanation(
        { ...rec, deterministicExplanation: "WRONG LANGUAGE SENTINEL" },
        view,
        dataset,
        locale,
      );
      expect(explanation).not.toContain("WRONG LANGUAGE SENTINEL");
      for (const [id, gain] of Object.entries(rec.expectedGains))
        expect(explanation).toContain(`${catalogName(id, locale)} +${gain}`);
      for (const score of Object.values(rec.factorScores))
        expect(explanation).toContain(`: ${score}`);
      expect(explanation).toContain(
        `${Number((view.readiness! * 100).toFixed(2))}%`,
      );
      expect(explanation).toContain(
        `${Number((rec.projectedReadiness * 100).toFixed(2))}%`,
      );
      expect(explanation).toContain(
        localizeEvidence(history, dataset, locale).value,
      );
      expect(explanation).toContain(
        String(
          dataset.activities.find((activity) => activity.id === rec.activityId)!
            .durationHours,
        ),
      );
    }
    expect(localizedExplanation(rec, view, dataset, "en")).not.toMatch(
      /[А-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨөҺһ]/,
    );
    expect(localizedExplanation(rec, view, dataset, "kk")).toContain(
      "дайындық",
    );
  });

  it("translates evidence labels and numeric descriptions without changing a numeric token", () => {
    const all = view.recommendations.flatMap((rec) => rec.evidence);
    expect(all.some((item) => item.id.startsWith("replay:"))).toBe(true);
    for (const locale of locales)
      for (const item of all) {
        const localized = localizeEvidence(item, dataset, locale);
        expect(numericTokens(localized.value)).toEqual(
          numericTokens(item.value),
        );
        expect(localized.label).not.toMatch(/SK_[A-Z_]+/);
        if (locale === "en")
          expect(`${localized.label} ${localized.value}`).not.toMatch(
            /[А-Яа-яЁё]/,
          );
        else
          expect(`${localized.label} ${localized.value}`).not.toMatch(
            /Career target|Similar activity history|Replayed|effective gain|contribution|positive|negative|assigned|critical/,
          );
      }
    const renamed = {
      ...dataset,
      skills: dataset.skills.map((skill) =>
        skill.id === "SK_LEADERSHIP"
          ? { ...skill, name: "Custom studio craft" }
          : skill,
      ),
    };
    expect(
      localizeEvidence(
        { id: "x", label: "SK_LEADERSHIP", value: "2/3" },
        renamed,
        "kk",
      ).label,
    ).toBe("Custom studio craft");
  });

  it("localizes the existing naive baseline including exclusions, without changing its choice", () => {
    expect(view.baseline).toBeDefined();
    for (const locale of locales) {
      const text = localizedBaseline(view, dataset, locale);
      expect(numericTokens(text)).toEqual(
        numericTokens(view.baseline!.explanation),
      );
      if (locale === "en") expect(text).not.toMatch(/[А-Яа-яЁё]/);
      if (locale === "kk")
        expect(text).not.toMatch(
          /минимальный|требование|учитывает|Активность|Навык/,
        );
    }
  });

  it("does not mutate source data, views, ranks or scores across language switches", () => {
    const before = JSON.stringify({ source, dataset, view });
    for (const locale of [...locales, ...[...locales].reverse()]) {
      for (const rec of view.recommendations) {
        localizedExplanation(rec, view, dataset, locale);
        rec.evidence.forEach((item) => localizeEvidence(item, dataset, locale));
      }
      localizedBaseline(view, dataset, locale);
      view.excluded?.forEach((item) =>
        item.reasons.forEach((reason) => localizeMessage(reason, locale)),
      );
    }
    expect(JSON.stringify({ source, dataset, view })).toBe(before);
    expect(
      adapter.evaluate({ dataset, employeeId: view.employeeId, ledger: [] }),
    ).toEqual(view);
  });
});

describe("localized validation and Trust diagnostics", () => {
  it("handles actual Zod import issues and preserves constraints and source identifiers", () => {
    const employees = JSON.parse(files.employees as string);
    employees.employees[0].skills.SK_PYTHON = 6;
    employees.employees[0].grade = "Not a grade";
    try {
      importCareerQuestDataset({ ...files, employees });
      expect.fail("Invalid source must fail import");
    } catch (error) {
      expect(error).toBeInstanceOf(DatasetValidationError);
      for (const issue of (error as DatasetValidationError).issues)
        for (const locale of ["ru", "kk"] as Locale[]) {
          const result = localizeMessage(issue.message, locale);
          expect(result).not.toMatch(/Too big|Invalid option|expected|number/);
          expect(numericTokens(result)).toEqual(numericTokens(issue.message));
        }
    }
    for (const locale of locales) {
      expect(localizeMessage("Duplicate identifier: E0028", locale)).toContain(
        "E0028",
      );
      expect(
        localizeMessage("Некорректный уровень SK_SQL: 8", locale),
      ).toContain("SK_SQL");
      expect(
        numericTokens(
          localizeMessage("Некорректный уровень SK_SQL: 8", locale),
        ),
      ).toEqual(["8"]);
      expect(
        localizeMessage(
          "Too many fields: expected 9 fields but parsed 12",
          locale,
        ),
      ).toContain("9");
      expect(
        localizeMessage(
          "Too many fields: expected 9 fields but parsed 12",
          locale,
        ),
      ).toContain("12");
    }
  });

  it("localizes JSON locations, absent fields, aborts and future validator errors", () => {
    const json =
      "Expected property name or '}' in JSON at position 19 (line 3 column 4)";
    for (const locale of ["ru", "kk"] as Locale[]) {
      expect(localizeMessage(json, locale)).not.toMatch(
        /Expected|position|line|column/,
      );
      expect(numericTokens(localizeMessage(json, locale))).toEqual([
        "19",
        "3",
        "4",
      ]);
      expect(
        localizeMessage(
          "Invalid input: expected number, received undefined",
          locale,
        ),
      ).not.toMatch(/Invalid|number|undefined/);
      expect(
        localizeMessage(
          "Invalid precision: expected at most 4 decimal places",
          locale,
        ),
      ).toContain("4");
      expect(
        localizeMessage(
          "Invalid precision: expected at most 4 decimal places",
          locale,
        ),
      ).not.toContain("Invalid");
      expect(localizeMessage("AbortError", locale)).not.toBe("AbortError");
    }
  });

  it("translates bad JSON control/Unicode diagnostics and safely handles an unknown parser diagnostic", () => {
    const diagnostics = [
      "Bad control character in string literal in JSON at position 15 (line 2 column 9)",
      "Bad Unicode escape in JSON at position 8 (line 1 column 9)",
      "Bad parser encoding in JSON at position 27 (line 4 column 8)",
    ];
    for (const diagnostic of diagnostics)
      for (const locale of ["ru", "kk"] as Locale[]) {
        const result = localizeMessage(diagnostic, locale);
        expect(result).not.toMatch(
          /Bad|control character|escape|parser encoding|position|line|column/,
        );
        expect(result).toContain("JSON");
        expect(numericTokens(result)).toEqual(numericTokens(diagnostic));
      }
    expect(localizeMessage(diagnostics[2], "en")).toBe(diagnostics[2]);
  });

  it("localizes every emitted dataset/AI audit name and detail, preserving measured numbers", async () => {
    const report = await runEvaluation([
      ...createDatasetAuditCases(source),
      ...createAIContractCases(),
    ]);
    expect(report.cases.length).toBeGreaterThan(25);
    for (const item of report.cases)
      for (const locale of locales) {
        const name = localizeMessage(item.name, locale);
        const detail = localizeMessage(item.detail, locale);
        expect(numericTokens(detail)).toEqual(numericTokens(item.detail));
        if (locale === "en")
          expect(`${name} ${detail}`).not.toMatch(/[А-Яа-яЁё]/);
        if (locale === "kk")
          expect(`${name} ${detail}`).not.toMatch(
            /Совпало|проверены|рекомендаций|Время|Объяснение|исходным|Зависший|провайдера|Факты/,
          );
        expect(`${name} ${detail}`).not.toMatch(
          /eligibility-функцией|preferred_language|projectedSkills/,
        );
        if (locale !== "en")
          expect(`${name} ${detail}`).not.toContain("readiness");
      }
  });
});
