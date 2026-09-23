import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { importCareerQuestDataset } from "@/domain/data";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import type { Locale } from "@/lib/i18n/core";
import { EmployeeWorkspace } from "@/components/employee/EmployeeWorkspace";
import { EmployeeStoreProvider } from "@/state/EmployeeStoreProvider";
import { createEmployeeStore } from "@/state/employeeStore";
import {
  createRealIntelligenceAdapter,
  projectDataset,
} from "@/state/realIntelligenceAdapter";

const raw = (name: string) =>
  readFileSync(new URL(`../../data/source/${name}`, import.meta.url), "utf8");
const data = projectDataset(
  importCareerQuestDataset({
    employees: raw("employees.json"),
    events: raw("events.json"),
    skills: raw("skills.json"),
    activityHistoryCsv: raw("activity_history.csv"),
  }),
);

describe("Employee interface language", () => {
  it.each([
    [
      "ru",
      "Моя траектория",
      "Основы лидерства",
      "Серверный разработчик",
      "Подтвердить завершение",
      "Оценка:",
    ],
    [
      "kk",
      "Менің даму жолым",
      "Көшбасшылық негіздері",
      "Серверлік жүйелер әзірлеушісі",
      "Аяқталғанын растау",
      "Бағалау:",
    ],
    [
      "en",
      "My career path",
      "Leadership Foundations",
      "Backend Engineer",
      "Confirm completion",
      "Review:",
    ],
  ] as const)(
    "renders %s consistently across profile, recommendations, upload and what-if despite profile language kk",
    (locale, heading, title, role, confirm, review) => {
      const store = createEmployeeStore(createRealIntelligenceAdapter());
      store.getState().loadDataset(data);
      store.getState().selectEmployee("E0028");
      const before = store.getState();
      const rankedIds = before.views.E0028.recommendations.map(
        (rec) => rec.activityId,
      );
      before.previewActivity(rankedIds[0]);
      // Zustand's SSR snapshot is normally the empty import screen. Seed only this renderer
      // with the prepared browser state so all loaded controls can be checked without a network.
      const renderedStore = { ...store, getInitialState: store.getState };
      const html = renderToStaticMarkup(
        createElement(I18nProvider, {
          initialLocale: locale as Locale,
          children: createElement(EmployeeStoreProvider, {
            store: renderedStore,
            children: createElement(EmployeeWorkspace),
          }),
        }),
      );
      expect(html).toContain(heading);
      expect(html).toContain(title);
      expect(html).toContain(role);
      expect(html).toContain(confirm);
      expect(html).toContain(review);
      expect(html).toContain(
        locale === "en"
          ? "Dataset loaded"
          : locale === "kk"
            ? "Жиын жүктелді"
            : "Набор загружен",
      );
      if (locale !== "en") expect(html).not.toContain("Leadership Foundations");
      if (locale === "en") {
        expect(html).not.toContain("Подтвердить завершение");
        expect(html).not.toContain("Моя траектория");
        expect(html).not.toContain("Мақсат:");
      }
      expect(
        store
          .getState()
          .views.E0028.recommendations.map((rec) => rec.activityId),
      ).toEqual(rankedIds);
      expect(store.getState().ledger).toHaveLength(0);
      expect(
        store
          .getState()
          .dataset!.employees.find((employee) => employee.id === "E0028")!
          .preferredLanguage,
      ).toBe("kk");
    },
  );
});
