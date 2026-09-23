import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HRPage from "../../src/app/hr/page";
import TrustPage from "../../src/app/trust/page";
import {
  TrustIntegrationProvider,
  type TrustIntegration,
} from "../../src/components/trust/integration";
import { dataset, employee } from "./fixtures";
import {
  DemoModeProvider,
  useDemoMode,
  type DemoAccess,
  type DemoModeValue,
} from "../../src/components/app/DemoModeContext";
import { I18nProvider } from "../../src/lib/i18n/I18nProvider";
import type { Locale } from "../../src/lib/i18n/core";
import { EmployeeStoreTrustBridge } from "../../src/components/trust/EmployeeStoreTrustBridge";
import { importCareerQuestDataset } from "@/domain/data";
import { createEmployeeStore } from "../../src/state/employeeStore";
import {
  createRealIntelligenceAdapter,
  projectDataset,
} from "../../src/state/realIntelligenceAdapter";
const integration = (): TrustIntegration => ({
  access: "hr",
  state: "ready",
  analytics: dataset(),
  challenge: { label: "Synthetic E0028 challenge", employee: employee() },
});
const render = (value: TrustIntegration, page = HRPage) =>
  renderToStaticMarkup(
    createElement(TrustIntegrationProvider, {
      value,
      children: createElement(page),
    }),
  );
describe("HR and Trust surfaces", () => {
  it("show missing integration, loading and invalid import states", () => {
    expect(renderToStaticMarkup(createElement(HRPage))).toContain(
      "Данные ещё не подключены",
    );
    expect(render({ ...integration(), state: "loading" })).toContain(
      "Готовим данные",
    );
    expect(render({ ...integration(), state: "invalid" })).toContain(
      "Файлы не прошли проверку",
    );
  });
  it("renders aggregates for HR and hides the dashboard from employee mode", () => {
    const hr = render(integration());
    expect(hr).toContain("50%");
    expect(hr).toContain("SK_SYSTEM_DESIGN");
    expect(hr).not.toContain("E0028");
    const denied = render({ ...integration(), access: "employee" });
    expect(denied).toContain("Раздел для HR");
    expect(denied).not.toContain("SK_SYSTEM_DESIGN");
  });
  it("offers data upload after entering HR and keeps the mode gate first", () => {
    for (const Page of [HRPage, TrustPage]) {
      const empty = render({ ...integration(), analytics: null }, Page);
      expect(empty).toContain("Данные ещё не загружены");
      expect(empty).toContain("Перейти к загрузке");
      expect(empty).toContain('href="/employee#data-upload"');
      const employeeView = render(
        { ...integration(), access: "employee", analytics: null },
        Page,
      );
      expect(employeeView).toContain("Перейти в режим HR");
      expect(employeeView).not.toContain("Данные ещё не загружены");
    }
  });
  it("does not present unevaluated metrics as success", () => {
    const html = render(integration(), TrustPage);
    expect(html).toContain("Не измерено");
    expect(html).toContain("синтетических");
    expect(html).toContain("EV_MENTORING");
  });
  it.each([
    ["ru", "Перейти в режим HR", "Вернуться к сотруднику"],
    ["kk", "HR режиміне өту", "Қызметкерге оралу"],
    ["en", "Switch to HR mode", "Back to employee"],
  ] as const)(
    "offers an in-place HR switch on both protected routes in %s",
    (locale, primary, secondary) => {
      for (const Page of [HRPage, TrustPage]) {
        const html = renderToStaticMarkup(
          createElement(I18nProvider, {
            initialLocale: locale as Locale,
            children: createElement(DemoModeProvider, {
              access: "employee",
              setAccess: () => {},
              children: createElement(TrustIntegrationProvider, {
                value: { ...integration(), access: "employee" },
                children: createElement(Page),
              }),
            }),
          }),
        );
        expect(html).toMatch(
          new RegExp(`<button[^>]*type="button"[^>]*>${primary}</button>`),
        );
        expect(html).not.toContain('disabled=""');
        expect(html).toContain(secondary);
        expect(html).toContain('href="/employee"');
        expect(html).not.toContain("SK_SYSTEM_DESIGN");
        expect(html).not.toContain("EV_MENTORING");
      }
    },
  );
  it("opens HR through the shared mode context without changing imported data or confirmed progress", () => {
    const raw = (name: string) =>
      readFileSync(
        new URL(`../../data/source/${name}`, import.meta.url),
        "utf8",
      );
    const normalized = importCareerQuestDataset({
      employees: raw("employees.json"),
      skills: raw("skills.json"),
      events: raw("events.json"),
      activityHistoryCsv: raw("activity_history.csv"),
    });
    const store = createEmployeeStore(createRealIntelligenceAdapter());
    expect(store.getState().loadDataset(projectDataset(normalized))).toBe(true);
    store.getState().selectEmployee("E0028");
    store
      .getState()
      .previewActivity(
        store.getState().views.E0028.recommendations[0].activityId,
      );
    expect(
      store
        .getState()
        .confirmCompletion(store.getState().simulation!.requestId),
    ).toBe(true);
    const committed = store.getState();
    let access: DemoAccess = "employee";
    let exposedMode: DemoModeValue | null = null;
    const setAccess = (next: DemoAccess) => {
      access = next;
    };
    function ModeConsumer() {
      exposedMode = useDemoMode();
      return createElement(HRPage);
    }
    const renderCurrentMode = () =>
      renderToStaticMarkup(
        createElement(DemoModeProvider, {
          access,
          setAccess,
          children: createElement(EmployeeStoreTrustBridge, {
            store,
            access,
            children: createElement(ModeConsumer),
          }),
        }),
      );

    expect(renderCurrentMode()).toContain("Перейти в режим HR");
    expect(exposedMode).not.toBeNull();
    (exposedMode as unknown as DemoModeValue).setAccess("hr");
    const hr = renderCurrentMode();
    expect(hr).toContain("Развитие команды");
    expect(hr).not.toContain("Перейти в режим HR");
    expect(store.getState()).toBe(committed);
    expect(store.getState().selectedEmployeeId).toBe("E0028");
    expect(store.getState().ledger).toHaveLength(1);
    expect(store.getState().normalizedDataset).toBe(
      committed.normalizedDataset,
    );

    (exposedMode as unknown as DemoModeValue).setAccess("employee");
    expect(renderCurrentMode()).toContain("Перейти в режим HR");
    expect(store.getState()).toBe(committed);
  });
});
