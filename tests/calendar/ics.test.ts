import { describe, expect, it } from "vitest";

import {
  CAREER_QUEST_ICS_PRODID,
  buildActivityCalendar,
  buildPersonalPlanCalendar,
  calendarFileName,
  createStableIcsUid,
  escapeIcsText,
  foldIcsLine,
} from "@/domain/calendar";
import type { DevelopmentEvent, NormalizedDataset } from "@/lib/contracts";

function event(
  id: string,
  overrides: Partial<DevelopmentEvent> = {},
): DevelopmentEvent {
  return {
    id,
    title: `Activity ${id}`,
    description: "A useful activity",
    type: "course",
    format: "online",
    durationHours: 4,
    mandatory: false,
    targetRoles: ["Backend Engineer"],
    targetGrades: ["Middle"],
    developsSkills: [{ skillId: "SK_SYSTEM_DESIGN", gain: 1, maxLevel: 4 }],
    prerequisites: {},
    upcomingSessions: ["2026-10-12"],
    ...overrides,
  };
}

function dataset(events: DevelopmentEvent[]): Pick<
  NormalizedDataset,
  "meta" | "eventsById"
> {
  return {
    meta: {
      dataset: "Career Quest",
      version: "test",
      asOfDate: "2026-10-01",
    },
    eventsById: Object.fromEntries(events.map((item) => [item.id, item])),
  };
}

function unfold(value: string): string {
  return value.replace(/\r\n[ \t]/g, "");
}

function physicalLines(value: string): string[] {
  return value.slice(0, -2).split("\r\n");
}

describe("RFC 5545 Career Quest calendar export", () => {
  it("exports every future activity session using the dataset snapshot", () => {
    const activity = event("EV_WORKSHOP", {
      title: "Systems workshop",
      description: "Architecture practice",
      durationHours: 8,
      upcomingSessions: [
        "2026-09-25",
        "2026-10-01",
        "2026-11-05",
        "2026-11-05",
      ],
    });

    const calendar = unfold(
      buildActivityCalendar({ activity, snapshotDate: "2026-10-01" }),
    );

    expect(calendar).toContain(`PRODID:${CAREER_QUEST_ICS_PRODID}\r\n`);
    expect(calendar).toContain("DTSTAMP:20261001T000000Z");
    expect(calendar).not.toContain("DTSTART;VALUE=DATE:20260925");
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(calendar).toContain("DTSTART;VALUE=DATE:20261001");
    expect(calendar).toContain("DTSTART;VALUE=DATE:20261105");
    expect(calendar).toContain("SUMMARY:Systems workshop");
    expect(calendar).toContain("DESCRIPTION:Architecture practice\\nDuration: 8 hours");
    expect(calendar).toContain("X-CAREER-QUEST-DURATION-HOURS:8");
  });

  it("uses CRLF exclusively and terminates the calendar with CRLF", () => {
    const calendar = buildActivityCalendar({
      activity: event("EV_CRLF"),
      snapshotDate: "2026-10-01",
    });

    expect(calendar.endsWith("\r\n")).toBe(true);
    expect(calendar.replace(/\r\n/g, "")).not.toContain("\n");
    expect(calendar.replace(/\r\n/g, "")).not.toContain("\r");
  });

  it("escapes text punctuation, backslashes and newlines without line injection", () => {
    const activity = event("EV_ESCAPE", {
      title: "Design, systems; safely\\today",
      description: "First line\nSecond, part; with \\ path\r\nUID:injected",
    });
    const calendar = unfold(
      buildActivityCalendar({ activity, snapshotDate: "2026-10-01" }),
    );

    expect(escapeIcsText(activity.description)).toBe(
      "First line\\nSecond\\, part\\; with \\\\ path\\nUID:injected",
    );
    expect(calendar).toContain(
      "SUMMARY:Design\\, systems\\; safely\\\\today",
    );
    expect(calendar).toContain(
      "DESCRIPTION:First line\\nSecond\\, part\\; with \\\\ path\\nUID:injected\\nDuration: 4 hours",
    );
    expect(calendar.match(/\r\nUID:/g)).toHaveLength(1);
  });

  it("folds every physical line at 75 UTF-8 octets without splitting Unicode", () => {
    const logical = `DESCRIPTION:${escapeIcsText(
      "Развитие архитектуры — 你好 — ".repeat(12),
    )}`;
    const folded = foldIcsLine(logical);

    for (const line of folded.split("\r\n")) {
      expect(new TextEncoder().encode(line).byteLength).toBeLessThanOrEqual(75);
    }
    expect(unfold(folded)).toBe(logical);
    expect(folded.split("\r\n").slice(1).every((line) => line.startsWith(" "))).toBe(
      true,
    );
  });

  it("creates deterministic, distinct UIDs for event/session pairs", () => {
    const first = createStableIcsUid("EV_001", "20261001");
    expect(createStableIcsUid("EV_001", "20261001")).toBe(first);
    expect(createStableIcsUid("EV_001", "20261002")).not.toBe(first);
    expect(createStableIcsUid("EV_002", "20261001")).not.toBe(first);

    const calendar = unfold(
      buildActivityCalendar({
        activity: event("EV_001", {
          upcomingSessions: ["2026-10-01", "2026-10-02"],
        }),
        snapshotDate: "2026-10-01",
      }),
    );
    const uids = [...calendar.matchAll(/UID:([^\r]+)\r\n/g)].map(
      (match) => match[1],
    );
    expect(new Set(uids).size).toBe(2);
  });

  it("exports accepted path steps before de-duplicated nearest recommendations", () => {
    const accepted = event("EV_ACCEPTED", {
      upcomingSessions: ["2026-11-20", "2026-10-20"],
    });
    const recommended = event("EV_RECOMMENDED", {
      upcomingSessions: ["2026-12-01", "2026-10-09", "2026-11-01"],
    });
    const calendar = unfold(
      buildPersonalPlanCalendar({
        dataset: dataset([accepted, recommended]),
        acceptedPathSteps: [{ activityId: accepted.id }, recommended.id],
        recommendedActivityIds: [recommended.id, accepted.id],
      }),
    );

    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(calendar).toContain("DTSTART;VALUE=DATE:20261020");
    expect(calendar).toContain("DTSTART;VALUE=DATE:20261009");
    expect(calendar).not.toContain("DTSTART;VALUE=DATE:20261120");
    expect(calendar).not.toContain("DTSTART;VALUE=DATE:20261201");
    expect(calendar.match(/X-CAREER-QUEST-PLAN-KIND:ACCEPTED_PATH/g)).toHaveLength(
      2,
    );
    expect(calendar).not.toContain("X-CAREER-QUEST-PLAN-KIND:RECOMMENDATION");
  });

  it("uses a deadline or snapshot for a deterministic self-paced calendar entry", () => {
    const activity = event("EV_SELF", {
      format: "self_paced",
      upcomingSessions: [],
      durationHours: 2.5,
    });
    const withDeadline = unfold(
      buildActivityCalendar({
        activity,
        snapshotDate: "2026-10-01",
        enrollmentDeadline: "2026-10-15",
      }),
    );
    const withoutDeadline = unfold(
      buildActivityCalendar({ activity, snapshotDate: "2026-10-01" }),
    );

    expect(withDeadline).toContain("DTSTART;VALUE=DATE:20261015");
    expect(withDeadline).toContain("X-CAREER-QUEST-DURATION-HOURS:2.5");
    expect(withoutDeadline).toContain("DTSTART;VALUE=DATE:20261001");
    expect(withoutDeadline).toContain("DTSTAMP:20261001T000000Z");
  });

  it("keeps exact duration as metadata and RFC duration for timed sessions", () => {
    const calendar = unfold(
      buildActivityCalendar({
        activity: event("EV_TIMED", {
          durationHours: 1.5,
          upcomingSessions: ["2026-10-12T09:30:00Z"],
        }),
        snapshotDate: "2026-10-01",
      }),
    );

    expect(calendar).toContain("DTSTART:20261012T093000Z");
    expect(calendar).toContain("DURATION:PT1H30M");
    expect(calendar).toContain("X-CAREER-QUEST-DURATION-HOURS:1.5");
  });

  it("rejects scheduled activities without a future session", () => {
    expect(() =>
      buildActivityCalendar({
        activity: event("EV_PAST", {
          upcomingSessions: ["2026-09-30"],
        }),
        snapshotDate: "2026-10-01",
      }),
    ).toThrow("no session on or after the dataset snapshot");
  });

  it("builds a safe .ics file name", () => {
    expect(calendarFileName(" Career Quest: My Plan ")).toBe(
      "career-quest-my-plan.ics",
    );
    expect(calendarFileName("***")).toBe("career-quest.ics");
  });
});
