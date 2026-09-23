import {
  analyzeGaps,
  buildEffectiveEmployeeProfile,
  resolveTarget,
} from "@/domain/recommendation";
import type {
  Grade,
  NormalizedDataset,
  ProficiencyLevel,
} from "@/lib/contracts";

export interface MentorSearchQuery {
  employeeId: string;
  skillId: string;
  department?: string;
  role?: string;
  /** Restrict to one candidate before ranking/limit, e.g. server-side request validation. */
  mentorId?: string;
  availableOnly?: boolean;
  limit?: number;
}

export interface MentorSearchOptions {
  /** Explicit owner preferences override availability inferred from history. */
  availability?: Record<string, boolean>;
  /** Number of open/accepted requests per mentor, supplied by the server. */
  activeLoad?: Record<string, number>;
}

/** Private search response: never add history, engagement, other skills or scores. */
export interface MentorCandidate {
  employeeId: string;
  fullName: string;
  role: string;
  grade: Grade;
  skillLevel: ProficiencyLevel;
  available: boolean;
}

export interface MentorSearchResult {
  skillId: string;
  requiredLevel: ProficiencyLevel;
  mentors: MentorCandidate[];
}

export type MentorSearchErrorCode =
  | "UNKNOWN_EMPLOYEE"
  | "UNKNOWN_SKILL"
  | "NO_TARGET"
  | "SKILL_NOT_REQUIRED"
  | "INVALID_LIMIT";

export class MentorSearchError extends Error {
  constructor(readonly code: MentorSearchErrorCode) {
    super(code);
    this.name = "MentorSearchError";
  }
}

function assertEmployee(dataset: NormalizedDataset, employeeId: string) {
  if (!Object.hasOwn(dataset.employeesById, employeeId)) {
    throw new MentorSearchError("UNKNOWN_EMPLOYEE");
  }
}

/** Historical participation is a demo default; the owner's explicit choice wins. */
export function getDefaultMentorAvailability(
  dataset: NormalizedDataset,
  employeeId: string,
): boolean {
  assertEmployee(dataset, employeeId);
  return (dataset.historyByEmployeeId[employeeId] ?? []).some((record) => {
    if (
      record.date > dataset.meta.asOfDate ||
      (record.status !== "completed" && record.status !== "in_progress")
    ) {
      return false;
    }
    // Use catalog metadata so imported mentoring events work without special IDs.
    const kind = dataset.eventsById[record.eventId]?.type.trim().toLowerCase();
    return kind === "mentoring" || kind === "mentorship";
  });
}

/** Stable pair affinity spreads equally suitable mentors even before any thread exists. */
function pairAffinity(employeeId: string, skillId: string, mentorId: string) {
  const key = JSON.stringify([employeeId, skillId, mentorId]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

const compareId = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/** Pure deterministic search over the same canonical snapshot used by the core. */
export function searchMentors(
  dataset: NormalizedDataset,
  query: MentorSearchQuery,
  options: MentorSearchOptions = {},
): MentorSearchResult {
  assertEmployee(dataset, query.employeeId);
  if (!Object.hasOwn(dataset.skillsById, query.skillId)) {
    throw new MentorSearchError("UNKNOWN_SKILL");
  }
  const limit = query.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new MentorSearchError("INVALID_LIMIT");
  }

  const requester = buildEffectiveEmployeeProfile(dataset, query.employeeId);
  const target = resolveTarget(dataset, requester);
  if (!target) throw new MentorSearchError("NO_TARGET");
  const gap = analyzeGaps(requester, target).gaps.find(
    (item) => item.skillId === query.skillId,
  );
  if (!gap) throw new MentorSearchError("SKILL_NOT_REQUIRED");

  const ranked: Array<{ candidate: MentorCandidate; score: number }> = [];
  for (const employee of Object.values(dataset.employeesById)) {
    if (employee.id === query.employeeId) continue;
    if (query.mentorId !== undefined && employee.id !== query.mentorId)
      continue;
    if (
      query.department !== undefined &&
      employee.department !== query.department
    )
      continue;
    if (query.role !== undefined && employee.role !== query.role) continue;

    const profile = buildEffectiveEmployeeProfile(dataset, employee.id);
    const skillLevel = profile.effectiveSkills[query.skillId] ?? 0;
    if (skillLevel < gap.requiredLevel) continue;

    const demonstratedWillingness = getDefaultMentorAvailability(
      dataset,
      employee.id,
    );
    const explicitAvailability =
      options.availability && Object.hasOwn(options.availability, employee.id)
        ? options.availability[employee.id]
        : undefined;
    const available = explicitAvailability ?? demonstratedWillingness;
    if (query.availableOnly && !available) continue;

    const skill = skillLevel / 5;
    const proximity =
      (employee.department === requester.employee.department ? 0.65 : 0) +
      (employee.role === requester.employee.role ? 0.35 : 0);
    // Explicit unavailability never receives a willingness boost from old history.
    const willingness = available ? (demonstratedWillingness ? 1 : 0.8) : 0;
    const reportedLoad = options.activeLoad?.[employee.id] ?? 0;
    const load = Number.isFinite(reportedLoad) ? Math.max(0, reportedLoad) : 0;
    const distribution =
      0.7 / (1 + load) +
      0.3 * pairAffinity(query.employeeId, query.skillId, employee.id);
    const score =
      skill * 0.3 + proximity * 0.2 + willingness * 0.2 + distribution * 0.3;

    ranked.push({
      score,
      candidate: {
        employeeId: employee.id,
        fullName: employee.fullName,
        role: employee.role,
        grade: employee.grade,
        skillLevel,
        available,
      },
    });
  }

  ranked.sort(
    (left, right) =>
      right.score - left.score ||
      compareId(left.candidate.employeeId, right.candidate.employeeId),
  );
  return {
    skillId: query.skillId,
    requiredLevel: gap.requiredLevel,
    mentors: ranked.slice(0, limit).map(({ candidate }) => candidate),
  };
}
