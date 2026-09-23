import { z, type ZodIssue } from "zod";

import { developmentEventInputSchema, isoDateSchema } from "@/domain/data/schemas";
import type {
  DevelopmentEvent,
  Grade,
  NormalizedDataset,
  ProficiencyLevel,
} from "@/lib/contracts";

const skillEffectSchema = developmentEventInputSchema.shape.develops_skills.element.extend({
  gain: z.number().int().min(1).max(2),
});

/**
 * An HR draft deliberately starts from the canonical events.json schema. The
 * only additions are builder-specific policy and session-only metadata.
 */
export const hrEventDraftSchema = developmentEventInputSchema
  .omit({ event_id: true })
  .extend({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    type: z.string().trim().min(1),
    mandatory: z.literal(false).default(false),
    target_roles: developmentEventInputSchema.shape.target_roles.min(1),
    target_grades: developmentEventInputSchema.shape.target_grades.min(1),
    develops_skills: z.array(skillEffectSchema).min(1),
    enrollment_deadline: z
      .union([isoDateSchema, z.literal("")])
      .optional()
      .transform((value) => value || undefined),
  });

export type HrEventDraft = z.input<typeof hrEventDraftSchema>;

export interface HrEventMetadata {
  createdBy: "hr";
  createdAtSnapshot: string;
  enrollmentDeadline?: string;
}

export interface HrCreatedEvent {
  event: DevelopmentEvent;
  metadata: HrEventMetadata;
}

export interface HrEventValidationIssue {
  path: string;
  message: string;
}

export class HrEventValidationError extends Error {
  constructor(public readonly issues: readonly HrEventValidationIssue[]) {
    super(`HR event validation failed with ${issues.length} issue(s)`);
    this.name = "HrEventValidationError";
  }
}

export type SafeHrEventValidationResult =
  | { success: true; data: HrCreatedEvent }
  | { success: false; error: HrEventValidationError };

function issuePath(path: PropertyKey[]): string {
  return path.length ? path.map(String).join(".") : "$";
}

function fromZodIssues(issues: readonly ZodIssue[]): HrEventValidationIssue[] {
  return issues.map((issue) => ({
    path: issuePath(issue.path),
    message: issue.message,
  }));
}

function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Generates a deterministic, collision-free session identifier. */
export function nextHrEventId(dataset: Pick<NormalizedDataset, "eventsById">): string {
  for (let sequence = 1; sequence <= Number.MAX_SAFE_INTEGER; sequence += 1) {
    const id = `EV_HR_${String(sequence).padStart(3, "0")}`;
    if (!hasOwn(dataset.eventsById, id)) return id;
  }
  throw new Error("Unable to allocate an HR event identifier");
}

function validateReferences(
  dataset: NormalizedDataset,
  draft: z.output<typeof hrEventDraftSchema>,
): HrEventValidationIssue[] {
  const issues: HrEventValidationIssue[] = [];
  const eventTypes = new Set(Object.values(dataset.eventsById).map((event) => event.type));
  const roles = new Set(Object.values(dataset.roleProfilesByKey).map((profile) => profile.role));
  const grades = new Set(Object.values(dataset.roleProfilesByKey).map((profile) => profile.grade));

  if (!eventTypes.has(draft.type)) {
    issues.push({ path: "type", message: `Unknown catalog event type: ${draft.type}` });
  }

  draft.target_roles.forEach((role, index) => {
    if (!roles.has(role)) {
      issues.push({ path: `target_roles.${index}`, message: `Unknown role: ${role}` });
    }
  });
  draft.target_grades.forEach((grade, index) => {
    if (!grades.has(grade)) {
      issues.push({ path: `target_grades.${index}`, message: `Unknown grade: ${grade}` });
    }
  });
  draft.develops_skills.forEach((effect, index) => {
    if (!hasOwn(dataset.skillsById, effect.skill_id)) {
      issues.push({
        path: `develops_skills.${index}.skill_id`,
        message: `Unknown skill: ${effect.skill_id}`,
      });
    }
  });
  Object.keys(draft.prerequisites).forEach((skillId) => {
    if (!hasOwn(dataset.skillsById, skillId)) {
      issues.push({
        path: `prerequisites.${skillId}`,
        message: `Unknown skill: ${skillId}`,
      });
    }
  });

  const futureSessions = draft.upcoming_sessions.filter(
    (session) => session >= dataset.meta.asOfDate,
  );
  if (draft.format === "self_paced" && draft.upcoming_sessions.length > 0) {
    issues.push({
      path: "upcoming_sessions",
      message: "Self-paced events cannot have scheduled sessions",
    });
  }
  if (draft.format !== "self_paced" && futureSessions.length === 0) {
    issues.push({
      path: "upcoming_sessions",
      message: `At least one session must be on or after snapshot date ${dataset.meta.asOfDate}`,
    });
  }

  if (draft.enrollment_deadline) {
    if (draft.enrollment_deadline < dataset.meta.asOfDate) {
      issues.push({
        path: "enrollment_deadline",
        message: `Enrollment deadline cannot be before snapshot date ${dataset.meta.asOfDate}`,
      });
    }
    const firstSession = [...draft.upcoming_sessions].sort()[0];
    if (firstSession && draft.enrollment_deadline > firstSession) {
      issues.push({
        path: "enrollment_deadline",
        message: `Enrollment deadline cannot be after first session ${firstSession}`,
      });
    }
  }

  return issues;
}

/**
 * Validates an HR draft against the canonical event shape and the currently
 * loaded dataset, then returns the normalized event plus separate metadata.
 */
export function validateHrEventDraft(
  dataset: NormalizedDataset,
  input: HrEventDraft,
): HrCreatedEvent {
  const parsed = hrEventDraftSchema.safeParse(input);
  if (!parsed.success) {
    throw new HrEventValidationError(fromZodIssues(parsed.error.issues));
  }

  const relationIssues = validateReferences(dataset, parsed.data);
  if (relationIssues.length) throw new HrEventValidationError(relationIssues);

  const id = nextHrEventId(dataset);
  // Keep the guard beside construction as well as in the allocator: a caller
  // must never receive a colliding identifier even if the allocator changes.
  if (hasOwn(dataset.eventsById, id)) {
    throw new HrEventValidationError([
      { path: "event_id", message: `Duplicate event identifier: ${id}` },
    ]);
  }

  const event: DevelopmentEvent = {
    id,
    title: parsed.data.title,
    description: parsed.data.description,
    type: parsed.data.type,
    format: parsed.data.format,
    durationHours: parsed.data.duration_hours,
    mandatory: false,
    targetRoles: [...parsed.data.target_roles],
    targetGrades: [...parsed.data.target_grades] as Grade[],
    developsSkills: parsed.data.develops_skills.map((effect) => ({
      skillId: effect.skill_id,
      gain: effect.gain,
      maxLevel: effect.max_level as ProficiencyLevel,
    })),
    prerequisites: parsed.data.prerequisites as Record<string, ProficiencyLevel>,
    upcomingSessions: [...parsed.data.upcoming_sessions].sort(),
  };

  return {
    event,
    metadata: {
      createdBy: "hr",
      createdAtSnapshot: dataset.meta.asOfDate,
      ...(parsed.data.enrollment_deadline
        ? { enrollmentDeadline: parsed.data.enrollment_deadline }
        : {}),
    },
  };
}

export function safeValidateHrEventDraft(
  dataset: NormalizedDataset,
  input: HrEventDraft,
): SafeHrEventValidationResult {
  try {
    return { success: true, data: validateHrEventDraft(dataset, input) };
  } catch (error) {
    if (error instanceof HrEventValidationError) {
      return { success: false, error };
    }
    throw error;
  }
}

function parseIsoDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid ISO date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

// Gregorian civil date -> monotonically increasing day number. This keeps
// snapshot-relative calculations deterministic and deliberately avoids system
// clocks and Date's timezone parsing.
function civilDay(date: string): number {
  const parsed = parseIsoDate(date);
  const adjustedYear = parsed.year - Number(parsed.month <= 2);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const shiftedMonth = parsed.month + (parsed.month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + parsed.day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146097 + dayOfEra;
}

/** Remaining whole calendar days, always relative to the supplied snapshot. */
export function daysUntilEnrollmentDeadline(
  snapshotDate: string,
  enrollmentDeadline: string,
): number {
  return civilDay(enrollmentDeadline) - civilDay(snapshotDate);
}
