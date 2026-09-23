import { describe, expect, it } from "vitest";

import {
  previewHrEventImpact,
  validateHrEventDraft,
  type HrEventDraft,
} from "@/domain/catalog";
import { localizeMessage } from "@/lib/i18n/domain";
import type { Grade, NormalizedDataset } from "@/lib/contracts";
import {
  createEmployeeStore,
  selectDatasetGeneration,
} from "@/state/employeeStore";
import {
  createRealIntelligenceAdapter,
  projectDataset,
} from "@/state/realIntelligenceAdapter";
import {
  loadChallengeDataset,
  loadChallengeFiles,
} from "../recommendation/test-utils";

function readyStore() {
  const source = loadChallengeDataset();
  const store = createEmployeeStore(createRealIntelligenceAdapter());
  expect(store.getState().loadDataset(projectDataset(source))).toBe(true);
  return { source, store };
}

function usefulDraft(
  state: ReturnType<ReturnType<typeof createEmployeeStore>["getState"]>,
): HrEventDraft {
  const source = state.normalizedDataset!;
  const selected = Object.values(state.views)
    .map((view) => ({
      view,
      employee: source.employeesById[view.employeeId],
      gap: view.gaps.find((candidate) => candidate.current < candidate.required),
    }))
    .find(({ view, employee, gap }) => view.target && employee && gap);
  if (!selected?.view.target || !selected.gap)
    throw new Error("Challenge fixture has no employee with a target gap");

  return {
    title: "HR session integration lab",
    description: "A focused activity created during the current HR session.",
    type: Object.values(source.eventsById)[0]!.type,
    format: "self_paced",
    duration_hours: 1,
    mandatory: false,
    target_roles: [selected.employee.role],
    target_grades: [selected.view.target.grade as Grade],
    develops_skills: [
      {
        skill_id: selected.gap.skillId,
        gain: 1,
        max_level: 5,
      },
    ],
    prerequisites: {},
    upcoming_sessions: [],
    enrollment_deadline: source.meta.asOfDate,
  };
}

describe("HR-created event store overlay", () => {
  it("changes the event-builder reset key only after a successful dataset reload", () => {
    const { source, store } = readyStore();
    const initialGeneration = selectDatasetGeneration(store.getState());
    expect(initialGeneration).toBe(1);

    const top = store.getState().views[store.getState().selectedEmployeeId!]
      .recommendations[0];
    expect(top).toBeDefined();
    store.getState().previewActivity(top.activityId);
    const requestId = store.getState().simulation!.requestId;
    expect(store.getState().confirmCompletion(requestId)).toBe(true);
    expect(selectDatasetGeneration(store.getState())).toBe(initialGeneration);

    expect(store.getState().addHrEvent(usefulDraft(store.getState()))).not.toBeNull();
    expect(selectDatasetGeneration(store.getState())).toBe(initialGeneration);

    const invalid = { ...projectDataset(source), source: undefined };
    expect(store.getState().loadDataset(invalid)).toBe(false);
    expect(selectDatasetGeneration(store.getState())).toBe(initialGeneration);

    // Metadata is intentionally identical: a monotonically increasing import
    // epoch still changes the HrEventBuilder key and remounts all form state.
    expect(store.getState().loadDataset(projectDataset(source))).toBe(true);
    expect(selectDatasetGeneration(store.getState())).toBe(
      initialGeneration + 1,
    );
  });

  it("commits the event atomically and matches preview eligibility to actual candidates", () => {
    const { store } = readyStore();
    const before = store.getState();
    const draft = usefulDraft(before);
    const predictedEvent = validateHrEventDraft(before.normalizedDataset!, draft);
    const preview = previewHrEventImpact(
      before.normalizedDataset!,
      predictedEvent.event,
    );

    const created = before.addHrEvent(draft);
    expect(created).not.toBeNull();
    const after = store.getState();
    const eventId = created!.event.id;
    const actualEligible = Object.values(after.views)
      .filter((view) =>
        view.candidates.some((candidate) => candidate.activityId === eventId),
      )
      .map((view) => view.employeeId)
      .sort();

    expect(actualEligible).toEqual(preview.eligibleEmployeeIds);
    expect(actualEligible).toHaveLength(preview.eligibleEmployeeCount);
    expect(after.hrCreatedEvents).toEqual([created]);
    expect(after.dataset!.activities.at(-1)?.id).toBe(eventId);
    expect(after.normalizedDataset!.eventsById[eventId]).toEqual(created!.event);
    expect(
      (after.dataset!.source as NormalizedDataset).eventsById[
        eventId
      ],
    ).toEqual(created!.event);
    expect(after.views).not.toBe(before.views);
    expect(actualEligible.length).toBeGreaterThan(0);
    for (const employeeId of actualEligible) {
      expect(after.views[employeeId]).not.toBe(before.views[employeeId]);
    }
    expect(after.revision).toBe(before.revision + 1);
    expect(after.simulation).toBeNull();
    expect(after.path).toBeNull();
  });

  it("rolls back every catalog and recommendation field when validation fails", () => {
    const { store } = readyStore();
    const before = store.getState();
    const invalid = {
      ...usefulDraft(before),
      develops_skills: [
        { skill_id: "SK_DOES_NOT_EXIST", gain: 1, max_level: 5 },
      ],
    } satisfies HrEventDraft;

    expect(before.addHrEvent(invalid)).toBeNull();
    const after = store.getState();
    expect(after.dataset).toBe(before.dataset);
    expect(after.normalizedDataset).toBe(before.normalizedDataset);
    expect(after.views).toBe(before.views);
    expect(after.hrCreatedEvents).toBe(before.hrCreatedEvents);
    expect(after.revision).toBe(before.revision);
    expect(after.error).toContain("HR event validation failed");
  });

  it("clears HR-created events on a successful repeated import and says so", async () => {
    const { store } = readyStore();
    const created = store.getState().addHrEvent(usefulDraft(store.getState()));
    expect(created).not.toBeNull();

    const imported = await store.getState().importFiles({
      "employees.json": String(loadChallengeFiles().employees),
      "events.json": String(loadChallengeFiles().events),
      "skills.json": String(loadChallengeFiles().skills),
      "activity_history.csv": loadChallengeFiles().activityHistoryCsv,
    });

    expect(imported).toBe(true);
    const after = store.getState();
    expect(after.hrCreatedEvents).toEqual([]);
    expect(after.dataset!.activities.some((item) => item.id === created!.event.id)).toBe(
      false,
    );
    expect(after.normalizedDataset!.eventsById[created!.event.id]).toBeUndefined();
    expect(after.notice).toContain("Созданные HR-активности сброшены");
    expect(localizeMessage(after.notice!, "en")).toBe(
      "Data reloaded. HR-created activities were cleared with the session changes.",
    );
  });
});
