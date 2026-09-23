import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmployeeWorkspace } from "@/components/employee/EmployeeWorkspace";
import { HrEventBuilder } from "@/components/hr/event-builder";
import {
  validateHrEventDraft,
  type HrEventDraft,
} from "@/domain/catalog";
import { recommendForEmployee } from "@/domain/recommendation";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import type { Grade, NormalizedDataset } from "@/lib/contracts";
import { EmployeeStoreProvider } from "@/state/EmployeeStoreProvider";
import { createEmployeeStore, type EmployeeStore } from "@/state/employeeStore";
import {
  createRealIntelligenceAdapter,
  projectDataset,
} from "@/state/realIntelligenceAdapter";

import { loadChallengeDataset } from "../recommendation/test-utils";

function readyStore() {
  const source = loadChallengeDataset();
  const store = createEmployeeStore(createRealIntelligenceAdapter());
  expect(store.getState().loadDataset(projectDataset(source))).toBe(true);
  return { source, store };
}

function renderedStore(store: EmployeeStore): EmployeeStore {
  return { ...store, getInitialState: store.getState } as EmployeeStore;
}

function visibleDraft(
  source: NormalizedDataset,
  store: EmployeeStore,
): { employeeId: string; draft: HrEventDraft } {
  for (const view of Object.values(store.getState().views)) {
    const employee = source.employeesById[view.employeeId];
    if (!employee || !view.target) continue;
    for (const gap of view.gaps.filter((item) => item.current < item.required)) {
      const draft: HrEventDraft = {
        title: "HR Architecture Quest",
        description: "A focused internal activity created by HR.",
        type: Object.values(source.eventsById)[0]!.type,
        format: "self_paced",
        duration_hours: 2,
        mandatory: false,
        target_roles: [employee.role],
        target_grades: [view.target.grade as Grade],
        develops_skills: [
          { skill_id: gap.skillId, gain: 2, max_level: 5 },
        ],
        prerequisites: {},
        upcoming_sessions: [],
        enrollment_deadline: source.meta.asOfDate,
      };
      const created = validateHrEventDraft(source, draft);
      const projected: NormalizedDataset = {
        ...source,
        eventsById: {
          ...source.eventsById,
          [created.event.id]: created.event,
        },
      };
      if (
        recommendForEmployee(projected, view.employeeId).recommendations.some(
          (recommendation) => recommendation.activityId === created.event.id,
        )
      ) {
        return { employeeId: view.employeeId, draft };
      }
    }
  }
  throw new Error("Challenge fixture has no visible HR-created recommendation");
}

describe("HR Event Builder in active UI", () => {
  it("renders an isolated aggregate-only builder without changing the HR shell", () => {
    const { store } = readyStore();
    const html = renderToStaticMarkup(
      createElement(I18nProvider, {
        initialLocale: "en",
        children: createElement(HrEventBuilder, {
          store: renderedStore(store),
        }),
      }),
    );

    expect(html).toContain("Activity builder");
    expect(html).toContain("Created by HR · this session");
    expect(html).toContain("Voluntary only");
    expect(html).toMatch(/type="checkbox"[^>]*disabled=""/);
    expect(html).toContain("Calculate impact");
    expect(html).toContain("Save and recalculate");
    expect(html).not.toMatch(/\bE\d{4}\b/);
  });

  it("shows the HR marker, snapshot deadline and calendar action on a real recommendation", () => {
    const { source, store } = readyStore();
    const { employeeId, draft } = visibleDraft(source, store);
    const created = store.getState().addHrEvent(draft);
    expect(created).not.toBeNull();
    store.getState().selectEmployee(employeeId);

    const html = renderToStaticMarkup(
      createElement(I18nProvider, {
        initialLocale: "en",
        children: createElement(EmployeeStoreProvider, {
          store: renderedStore(store),
          children: createElement(EmployeeWorkspace),
        }),
      }),
    );

    expect(html).toContain("HR Architecture Quest");
    expect(html).toContain("Created by HR");
    expect(html).toContain("enroll by");
    expect(html).toContain("Add to calendar .ics");
  });
});
