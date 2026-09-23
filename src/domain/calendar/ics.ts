import type { DevelopmentEvent, NormalizedDataset } from "@/lib/contracts";

export const CAREER_QUEST_ICS_PRODID =
  "-//Career Quest//Career Development Calendar//EN";

type CalendarDataset = Pick<NormalizedDataset, "meta" | "eventsById">;

export type ActivityCalendarInput = Readonly<{
  activity: DevelopmentEvent;
  snapshotDate: string;
  /** Optional deterministic instant. Defaults to midnight UTC on snapshotDate. */
  dtstamp?: string;
  calendarName?: string;
  enrollmentDeadline?: string;
  extraDescription?: string;
}>;

export type PersonalPlanStep = string | Readonly<{ activityId: string }>;

export type PersonalPlanCalendarInput = Readonly<{
  dataset: CalendarDataset;
  acceptedPathSteps: readonly PersonalPlanStep[];
  recommendedActivityIds: readonly string[];
  /** Optional deterministic instant. Defaults to midnight UTC on dataset.meta.asOfDate. */
  dtstamp?: string;
  calendarName?: string;
  enrollmentDeadlines?: Readonly<Record<string, string | undefined>>;
}>;

type ParsedCalendarDate = Readonly<{
  dateKey: string;
  dateValue: string;
  dateTimeValue: string | null;
}>;

type CalendarOccurrence = Readonly<{
  activity: DevelopmentEvent;
  start: ParsedCalendarDate;
  enrollmentDeadline?: string;
  extraDescription?: string;
  planKind?: "accepted_path" | "recommendation";
  planOrder?: number;
}>;

const encoder = new TextEncoder();

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  const monthLengths = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return Number.isInteger(day) && day >= 1 && day <= monthLengths[month - 1]!;
}

function parseCalendarDate(value: string, field: string): ParsedCalendarDate {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, yearText, monthText, dayText] = dateOnly;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    invariant(isValidDate(year, month, day), `${field} must be a valid ISO date`);
    return {
      dateKey: value,
      dateValue: `${yearText}${monthText}${dayText}`,
      dateTimeValue: null,
    };
  }

  const utcDateTime =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?Z$/.exec(
      value,
    );
  invariant(
    utcDateTime,
    `${field} must be YYYY-MM-DD or a UTC ISO timestamp ending in Z`,
  );
  const [, yearText, monthText, dayText, hourText, minuteText, second = "00"] =
    utcDateTime;
  invariant(
    isValidDate(Number(yearText), Number(monthText), Number(dayText)),
    `${field} must contain a valid date`,
  );
  invariant(
    Number(hourText) >= 0 &&
      Number(hourText) <= 23 &&
      Number(minuteText) >= 0 &&
      Number(minuteText) <= 59 &&
      Number(second) >= 0 &&
      Number(second) <= 59,
    `${field} must contain a valid UTC time`,
  );
  return {
    dateKey: `${yearText}-${monthText}-${dayText}`,
    dateValue: `${yearText}${monthText}${dayText}`,
    dateTimeValue: `${yearText}${monthText}${dayText}T${hourText}${minuteText}${second}Z`,
  };
}

function formatDtstamp(value: string, field = "dtstamp"): string {
  const parsed = parseCalendarDate(value, field);
  return parsed.dateTimeValue ?? `${parsed.dateValue}T000000Z`;
}

function normalizeSnapshotDate(snapshotDate: string): ParsedCalendarDate {
  const parsed = parseCalendarDate(snapshotDate, "snapshotDate");
  invariant(
    parsed.dateTimeValue === null,
    "snapshotDate must be a YYYY-MM-DD dataset snapshot",
  );
  return parsed;
}

function futureSessions(
  activity: DevelopmentEvent,
  snapshotDate: string,
): ParsedCalendarDate[] {
  const snapshot = normalizeSnapshotDate(snapshotDate);
  const byStart = new Map<string, ParsedCalendarDate>();
  for (const [index, value] of activity.upcomingSessions.entries()) {
    const parsed = parseCalendarDate(
      value,
      `activity ${activity.id} upcomingSessions[${index}]`,
    );
    if (parsed.dateKey >= snapshot.dateKey) {
      const occurrenceKey = parsed.dateTimeValue ?? parsed.dateValue;
      byStart.set(occurrenceKey, parsed);
    }
  }
  return [...byStart.values()].sort((left, right) => {
    const leftKey = left.dateTimeValue ?? `${left.dateValue}T000000Z`;
    const rightKey = right.dateTimeValue ?? `${right.dateValue}T000000Z`;
    return leftKey.localeCompare(rightKey);
  });
}

function selfPacedStart(
  snapshotDate: string,
  enrollmentDeadline?: string,
): ParsedCalendarDate {
  const snapshot = normalizeSnapshotDate(snapshotDate);
  if (!enrollmentDeadline) return snapshot;
  const deadline = parseCalendarDate(
    enrollmentDeadline,
    "enrollmentDeadline",
  );
  return deadline.dateKey >= snapshot.dateKey ? deadline : snapshot;
}

function activityOccurrences(
  activity: DevelopmentEvent,
  snapshotDate: string,
  enrollmentDeadline?: string,
): ParsedCalendarDate[] {
  if (activity.format === "self_paced") {
    return [selfPacedStart(snapshotDate, enrollmentDeadline)];
  }
  const sessions = futureSessions(activity, snapshotDate);
  invariant(
    sessions.length > 0,
    `Activity ${activity.id} has no session on or after the dataset snapshot`,
  );
  return sessions;
}

function nearestOccurrence(
  activity: DevelopmentEvent,
  snapshotDate: string,
  enrollmentDeadline?: string,
): ParsedCalendarDate {
  return activityOccurrences(activity, snapshotDate, enrollmentDeadline)[0]!;
}

/** Escape an RFC 5545 TEXT value and neutralize content-line injection. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * Fold one content line to at most 75 UTF-8 octets per physical line.
 * Continuation lines include the mandatory one-octet leading space.
 */
export function foldIcsLine(line: string): string {
  invariant(
    !line.includes("\r") && !line.includes("\n"),
    "ICS content lines must not contain raw newlines",
  );
  const folded: string[] = [];
  let current = "";
  for (const character of line) {
    if (encoder.encode(current + character).byteLength > 75) {
      invariant(current.length > 0, "Unable to fold ICS content line");
      folded.push(current);
      current = ` ${character}`;
    } else {
      current += character;
    }
  }
  folded.push(current);
  return folded.join("\r\n");
}

function hexUtf8(value: string): string {
  return [...encoder.encode(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Collision-free for distinct UTF-8 activity/session input pairs. */
export function createStableIcsUid(
  activityId: string,
  occurrenceKey: string,
): string {
  invariant(activityId.length > 0, "activityId must not be empty");
  invariant(occurrenceKey.length > 0, "occurrenceKey must not be empty");
  return `cq-${hexUtf8(activityId)}-${hexUtf8(occurrenceKey)}@career-quest.local`;
}

function durationLabel(hours: number): string {
  invariant(
    Number.isFinite(hours) && hours > 0,
    "Activity durationHours must be greater than zero",
  );
  return Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
}

function durationValue(hours: number): string {
  const totalSeconds = Math.round(hours * 60 * 60);
  invariant(totalSeconds > 0, "Activity duration must be at least one second");
  const hoursPart = Math.floor(totalSeconds / 3600);
  const minutesPart = Math.floor((totalSeconds % 3600) / 60);
  const secondsPart = totalSeconds % 60;
  return `PT${hoursPart > 0 ? `${hoursPart}H` : ""}${minutesPart > 0 ? `${minutesPart}M` : ""}${secondsPart > 0 ? `${secondsPart}S` : ""}`;
}

function occurrenceKey(start: ParsedCalendarDate): string {
  return start.dateTimeValue ?? start.dateValue;
}

function buildDescription(occurrence: CalendarOccurrence): string {
  const parts = [occurrence.activity.description.trim()];
  if (occurrence.extraDescription?.trim()) {
    parts.push(occurrence.extraDescription.trim());
  }
  parts.push(`Duration: ${durationLabel(occurrence.activity.durationHours)} hours`);
  if (occurrence.enrollmentDeadline) {
    parts.push(`Enrollment deadline: ${occurrence.enrollmentDeadline}`);
  }
  if (occurrence.planKind === "accepted_path") {
    parts.push(`Career Quest path step: ${occurrence.planOrder ?? 1}`);
  } else if (occurrence.planKind === "recommendation") {
    parts.push("Career Quest recommended activity");
  }
  return parts.filter(Boolean).join("\n");
}

function componentLines(
  occurrence: CalendarOccurrence,
  dtstamp: string,
): string[] {
  const { activity, start } = occurrence;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${createStableIcsUid(activity.id, occurrenceKey(start))}`,
    `DTSTAMP:${dtstamp}`,
    start.dateTimeValue
      ? `DTSTART:${start.dateTimeValue}`
      : `DTSTART;VALUE=DATE:${start.dateValue}`,
  ];
  if (start.dateTimeValue) lines.push(`DURATION:${durationValue(activity.durationHours)}`);
  lines.push(
    `SUMMARY:${escapeIcsText(activity.title)}`,
    `DESCRIPTION:${escapeIcsText(buildDescription(occurrence))}`,
    `X-CAREER-QUEST-ACTIVITY-ID:${escapeIcsText(activity.id)}`,
    `X-CAREER-QUEST-DURATION-HOURS:${durationLabel(activity.durationHours)}`,
  );
  if (occurrence.enrollmentDeadline) {
    lines.push(
      `X-CAREER-QUEST-ENROLLMENT-DEADLINE:${escapeIcsText(occurrence.enrollmentDeadline)}`,
    );
  }
  if (occurrence.planKind) {
    lines.push(`X-CAREER-QUEST-PLAN-KIND:${occurrence.planKind.toUpperCase()}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

function buildCalendar(
  occurrences: readonly CalendarOccurrence[],
  options: Readonly<{
    snapshotDate: string;
    dtstamp?: string;
    calendarName: string;
  }>,
): string {
  invariant(occurrences.length > 0, "Calendar must contain at least one activity");
  normalizeSnapshotDate(options.snapshotDate);
  const dtstamp = formatDtstamp(options.dtstamp ?? options.snapshotDate);
  const lines = [
    "BEGIN:VCALENDAR",
    `PRODID:${CAREER_QUEST_ICS_PRODID}`,
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
    ...occurrences.flatMap((occurrence) => componentLines(occurrence, dtstamp)),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/** Export an activity with every session on/after the immutable dataset snapshot. */
export function buildActivityCalendar(input: ActivityCalendarInput): string {
  const occurrences = activityOccurrences(
    input.activity,
    input.snapshotDate,
    input.enrollmentDeadline,
  ).map((start) => ({
    activity: input.activity,
    start,
    enrollmentDeadline: input.enrollmentDeadline,
    extraDescription: input.extraDescription,
  }));
  return buildCalendar(occurrences, {
    snapshotDate: input.snapshotDate,
    dtstamp: input.dtstamp,
    calendarName: input.calendarName ?? input.activity.title,
  });
}

function stepActivityId(step: PersonalPlanStep): string {
  return typeof step === "string" ? step : step.activityId;
}

/**
 * Export accepted trajectory steps and the nearest occurrence of each current
 * recommendation. Activities already present in the accepted path win over the
 * same recommendation so the resulting calendar never duplicates a session.
 */
export function buildPersonalPlanCalendar(
  input: PersonalPlanCalendarInput,
): string {
  const snapshotDate = input.dataset.meta.asOfDate;
  normalizeSnapshotDate(snapshotDate);
  const occurrences = new Map<string, CalendarOccurrence>();

  const add = (
    activityId: string,
    planKind: CalendarOccurrence["planKind"],
    planOrder?: number,
  ) => {
    const activity = input.dataset.eventsById[activityId];
    invariant(activity, `Unknown activity ${activityId} in personal calendar plan`);
    const enrollmentDeadline = input.enrollmentDeadlines?.[activityId];
    const start = nearestOccurrence(activity, snapshotDate, enrollmentDeadline);
    const key = `${activity.id}\u0000${occurrenceKey(start)}`;
    if (!occurrences.has(key)) {
      occurrences.set(key, {
        activity,
        start,
        enrollmentDeadline,
        planKind,
        planOrder,
      });
    }
  };

  input.acceptedPathSteps.forEach((step, index) => {
    add(stepActivityId(step), "accepted_path", index + 1);
  });
  input.recommendedActivityIds.forEach((activityId) => {
    add(activityId, "recommendation");
  });

  return buildCalendar([...occurrences.values()], {
    snapshotDate,
    dtstamp: input.dtstamp,
    calendarName: input.calendarName ?? "Career Quest personal plan",
  });
}

/** Conservative ASCII file name for a browser download attribute. */
export function calendarFileName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${normalized || "career-quest"}.ics`;
}
