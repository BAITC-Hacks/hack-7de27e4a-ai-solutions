import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import { EmployeeExternalLearningSection } from "@/components/employee/external-learning-section";
import { EmployeeWorkspace } from "@/components/employee/EmployeeWorkspace";
import { HRDashboard } from "@/components/hr/HRDashboard";
import { HrExternalLearningSection } from "@/components/hr/external-learning-section";
import { EmployeeStoreTrustBridge } from "@/components/trust/EmployeeStoreTrustBridge";
import {
  TrustIntegrationProvider,
  type TrustIntegration,
} from "@/components/trust/integration";
import { projectEmployeeStore } from "@/domain/analytics/store-adapter";
import {
  buildEmployeeExternalLearningPlan,
  buildHrExternalLearningPlan,
  loadExternalCourseCatalog,
  type ExternalCourseCatalog,
  type HrExternalLearningPlan,
} from "@/domain/external";
import { recommendForEmployee } from "@/domain/recommendation";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import type { Locale } from "@/lib/i18n/core";
import type { NormalizedDataset } from "@/lib/contracts";
import { EmployeeStoreProvider } from "@/state/EmployeeStoreProvider";
import { createEmployeeStore } from "@/state/employeeStore";
import {
  createRealIntelligenceAdapter,
  projectDataset,
} from "@/state/realIntelligenceAdapter";

import { loadChallengeDataset } from "../recommendation/test-utils";

function employeeWithExternalLearning(
  dataset: NormalizedDataset,
  catalog: ExternalCourseCatalog,
): string {
  const employeeId = Object.keys(dataset.employeesById)
    .sort()
    .find(
      (id) =>
        buildEmployeeExternalLearningPlan(dataset, catalog, id).groups.length >
        0,
    );
  if (!employeeId) {
    throw new Error("Challenge fixture must expose an external learning gap");
  }
  return employeeId;
}

function renderLeaf(
  locale: Locale,
  dataset: NormalizedDataset,
  employeeId: string,
): string {
  return renderToStaticMarkup(
    createElement(I18nProvider, {
      initialLocale: locale,
      children: createElement(EmployeeExternalLearningSection, {
        dataset,
        employeeId,
      }),
    }),
  );
}

function renderHrLeaf(locale: Locale, plan: HrExternalLearningPlan): string {
  return renderToStaticMarkup(
    createElement(I18nProvider, {
      initialLocale: locale,
      children: createElement(HrExternalLearningSection, { plan }),
    }),
  );
}

function readyStore(dataset: NormalizedDataset) {
  const store = createEmployeeStore(createRealIntelligenceAdapter());
  expect(store.getState().loadDataset(projectDataset(dataset))).toBe(true);
  return store;
}

describe("External Learning in the active employee experience", () => {
  let dataset: NormalizedDataset;
  let catalog: ExternalCourseCatalog;
  let employeeId: string;

  beforeAll(() => {
    dataset = loadChallengeDataset();
    catalog = loadExternalCourseCatalog(dataset);
    employeeId = employeeWithExternalLearning(dataset, catalog);
  });

  it.each([
    [
      "ru",
      "Курсы для навыков без внутреннего обучения",
      "Прогресс по внешним курсам не меняет карьерную готовность: их результат пока не подтверждён.",
      "Открыть курс",
    ],
    [
      "kk",
      "Ішкі оқытуы жоқ дағдыларға арналған курстар",
      "Сыртқы курстардағы ілгерілеу мансаптық дайындықты өзгертпейді: олардың нәтижесі әлі расталмаған.",
      "Курсты ашу",
    ],
    [
      "en",
      "Courses for skills without internal training",
      "External course progress does not change career readiness: the results have not yet been verified.",
      "Open course",
    ],
  ] as const)(
    "renders the isolated leaf in %s without leaking another UI locale",
    (locale, heading, disclaimer, action) => {
      const html = renderLeaf(locale, dataset, employeeId);

      expect(html).toContain(heading);
      expect(html).toContain(disclaimer);
      expect(html).toContain(action);
      if (locale !== "ru") {
        expect(html).not.toContain(
          "Курсы для навыков без внутреннего обучения",
        );
        expect(html).not.toContain("Открыть курс</a>");
      }
      if (locale !== "kk") {
        expect(html).not.toContain(
          "Ішкі оқытуы жоқ дағдыларға арналған курстар",
        );
      }
      if (locale !== "en") {
        expect(html).not.toContain(
          "Courses for skills without internal training",
        );
      }
    },
  );

  it("keeps the optional courses collapsed behind a labelled native disclosure", () => {
    const html = renderLeaf("en", dataset, employeeId);
    const summary = html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1];

    expect(html).toMatch(/<details\b[^>]*>/);
    expect(html).not.toMatch(/<details\b[^>]*\sopen(?:=|[\s>])/);
    expect(summary).toContain('id="employee-external-learning-title"');
    expect(summary).toContain("External courses");
    expect(summary).not.toMatch(/<a\b|<button\b/);
    expect(html).toContain("We consider your level and preferred language:");
    expect(html).not.toContain("come first");
    expect(html).not.toMatch(/top-3|score/);
  });

  it("renders only isolated HTTPS course links", () => {
    const html = renderLeaf("en", dataset, employeeId);
    const anchors = html.match(/<a\b[^>]*>/g) ?? [];

    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(anchor).toMatch(/href="https:\/\//);
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toContain('rel="noopener noreferrer"');
      expect(anchor).not.toMatch(/javascript:|data:|http:\/\//i);
    }
  });

  it("mounts inside the active EmployeeWorkspace after internal top-3 and leaves scoring untouched", () => {
    const store = createEmployeeStore(createRealIntelligenceAdapter());
    expect(store.getState().loadDataset(projectDataset(dataset))).toBe(true);
    store.getState().selectEmployee(employeeId);

    const beforeState = store.getState();
    const normalizedBefore = beforeState.normalizedDataset!;
    const engineBefore = recommendForEmployee(normalizedBefore, employeeId);
    const sourceBefore = structuredClone(normalizedBefore);
    // Zustand SSR normally uses the empty initial snapshot. Seed this renderer with the
    // prepared browser state, matching the active Employee integration tests.
    const renderedStore = { ...store, getInitialState: store.getState };
    const html = renderToStaticMarkup(
      createElement(I18nProvider, {
        initialLocale: "en",
        children: createElement(EmployeeStoreProvider, {
          store: renderedStore,
          children: createElement(EmployeeWorkspace),
        }),
      }),
    );

    const internalRecommendations = html.indexOf("Start here");
    const externalLearning = html.indexOf(
      "Courses for skills without internal training",
    );
    const decisionInspector = html.indexOf("Why this particular step?");
    expect(internalRecommendations).toBeGreaterThanOrEqual(0);
    expect(externalLearning).toBeGreaterThan(internalRecommendations);
    expect(decisionInspector).toBeGreaterThan(externalLearning);

    expect(store.getState()).toBe(beforeState);
    expect(store.getState().ledger).toHaveLength(0);
    expect(store.getState().normalizedDataset).toBe(normalizedBefore);
    expect(store.getState().normalizedDataset).toEqual(sourceBefore);
    expect(recommendForEmployee(normalizedBefore, employeeId)).toEqual(
      engineBefore,
    );
  });

  it("limits HR demand calculations to the explicit employee scope", () => {
    const scoped = buildHrExternalLearningPlan(dataset, catalog, 3, [
      employeeId,
      employeeId,
    ]);
    const empty = buildHrExternalLearningPlan(dataset, catalog, 3, []);

    expect(scoped.employeesWithUncoveredGaps).toBe(1);
    expect(scoped.directions.length).toBeGreaterThan(0);
    expect(
      scoped.directions.every(
        (direction) =>
          direction.affectedEmployees === 1 &&
          direction.criticalAffectedEmployees <= 1 &&
          direction.courses.every(
            (option) =>
              option.potentialAudience <= 1 && option.levelFitAudience <= 1,
          ),
      ),
    ).toBe(true);
    expect(empty).toEqual({
      employeesWithUncoveredGaps: 0,
      employeesWithCriticalHardSkillGaps: 0,
      directions: [],
    });
    expect(() =>
      buildHrExternalLearningPlan(dataset, catalog, 3, ["UNKNOWN_EMPLOYEE"]),
    ).toThrow("Unknown employee: UNKNOWN_EMPLOYEE");
  });
});

describe("External Learning in the active HR experience", () => {
  let dataset: NormalizedDataset;
  let catalog: ExternalCourseCatalog;
  let plan: HrExternalLearningPlan;

  beforeAll(() => {
    dataset = loadChallengeDataset();
    catalog = loadExternalCourseCatalog(dataset);
    plan = buildHrExternalLearningPlan(dataset, catalog);
  });

  it.each([
    [
      "ru",
      "Чем закрыть пробелы вне каталога",
      "Агрегат по всей организации; персональные рейтинги не используются.",
      "Внешние курсы не участвуют в ранжировании рекомендаций",
    ],
    [
      "kk",
      "Каталогтан тыс олқылықтарды қалай жабуға болады",
      "Бүкіл ұйым бойынша жиынтық; қызметкерлердің жеке рейтингі қолданылмайды.",
      "Сыртқы курстар ұсынымдарды ранжирлеуге қатыспайды",
    ],
    [
      "en",
      "Options beyond the internal catalog",
      "Organization-wide aggregate; no individual employee ranking is used.",
      "External courses do not affect recommendation ranking or readiness.",
    ],
  ] as const)(
    "renders the aggregate-only HR block in %s",
    (locale, heading, scope, disclaimer) => {
      const html = renderHrLeaf(locale, plan);

      expect(html).toContain(heading);
      expect(html).toContain(scope);
      expect(html).toContain(disclaimer);
      expect(html).not.toMatch(/\bE\d{4}\b/);
      if (locale !== "ru") {
        expect(html).not.toContain("Чем закрыть пробелы вне каталога");
      }
      if (locale !== "kk") {
        expect(html).not.toContain(
          "Каталогтан тыс олқылықтарды қалай жабуға болады",
        );
      }
      if (locale !== "en") {
        expect(html).not.toContain("Options beyond the internal catalog");
      }
    },
  );

  it("exposes only isolated HTTPS course links and no employee identifiers", () => {
    const html = renderHrLeaf("en", plan);
    const anchors = html.match(/<a\b[^>]*>/g) ?? [];

    expect(anchors.length).toBeGreaterThan(0);
    expect(html).not.toMatch(/\bE\d{4}\b/);
    for (const anchor of anchors) {
      expect(anchor).toMatch(/href="https:\/\//);
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toContain('rel="noopener noreferrer"');
      expect(anchor).not.toMatch(/javascript:|data:|http:\/\//i);
    }
  });

  it("renders the organization plan through the real store bridge and active HR dashboard", () => {
    const store = readyStore(dataset);
    const before = store.getState();
    const html = renderToStaticMarkup(
      createElement(I18nProvider, {
        initialLocale: "en",
        children: createElement(EmployeeStoreTrustBridge, {
          store,
          access: "hr",
          children: createElement(HRDashboard, {
            input: projectEmployeeStore(store.getState())!,
          }),
        }),
      }),
    );

    expect(html).toContain("Team development");
    expect(html).toContain("Catalog gaps");
    expect(html).toContain("Options beyond the internal catalog");
    expect(html).toContain(
      "Organization-wide aggregate; no individual employee ranking is used.",
    );
    expect(html).toContain("External source");
    // HR may inspect the separate, access-gated dropout list. The external plan
    // itself must remain aggregate-only even when mounted beside that panel.
    const externalBlock = html.match(
      /<section\b[^>]*aria-labelledby="hr-external-learning-title"[\s\S]*?<\/section>/,
    )?.[0];
    expect(externalBlock).toBeDefined();
    expect(externalBlock).not.toMatch(/\bE\d{4}\b/);
    expect(store.getState()).toBe(before);
    expect(store.getState().ledger).toHaveLength(0);
  });

  it("keeps the existing HR dashboard available when the bridge has no external plan", () => {
    const store = readyStore(dataset);
    const analytics = projectEmployeeStore(store.getState())!;
    const withoutPlan: TrustIntegration = {
      access: "hr",
      state: "ready",
      analytics,
      externalLearningPlan: null,
    };

    const contextless = renderToStaticMarkup(
      createElement(I18nProvider, {
        initialLocale: "en",
        children: createElement(HRDashboard, { input: analytics }),
      }),
    );
    const explicitFallback = renderToStaticMarkup(
      createElement(I18nProvider, {
        initialLocale: "en",
        children: createElement(TrustIntegrationProvider, {
          value: withoutPlan,
          children: createElement(HRDashboard, { input: analytics }),
        }),
      }),
    );

    for (const html of [contextless, explicitFallback]) {
      expect(html).toContain("Team development");
      expect(html).toContain("Catalog gaps");
      expect(html).not.toContain("Options beyond the internal catalog");
    }
    expect(
      renderHrLeaf("en", {
        employeesWithUncoveredGaps: 0,
        employeesWithCriticalHardSkillGaps: 0,
        directions: [],
      }),
    ).toBe("");
  });
});
