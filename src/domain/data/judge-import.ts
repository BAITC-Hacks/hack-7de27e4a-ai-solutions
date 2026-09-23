import Papa from "papaparse";

import type { CareerQuestFiles, NormalizedDataset } from "@/lib/contracts";
import { DatasetValidationError } from "./importer";
import { activityHistoryRowSchema } from "./schemas";

/**
 * Загрузка проверочных профилей жюри.
 *
 * ТЗ организаторов требует принимать ДОПОЛНИТЕЛЬНЫЕ профили и историю в формате датасета.
 * Жюри приносит один-два файла с произвольными именами, а не полный комплект из четырёх,
 * поэтому тип определяется по содержимому, а недостающие части берутся из текущего набора.
 *
 * Модуль чистый: на вход тексты файлов, на выход тексты файлов и сводка. Результат затем
 * проходит обычный importCareerQuestDataset, то есть вся валидация остаётся одна и та же.
 */

export const DATASET_SLOTS = [
  "employees",
  "events",
  "skills",
  "history",
] as const;
export type DatasetSlot = (typeof DATASET_SLOTS)[number];

export type BundleTexts = Record<DatasetSlot, string>;

export type SlotDetection =
  | { slot: DatasetSlot; confidence: "name" | "content" }
  | { slot: null; reason: "unreadable" | "ambiguous" };

export type MergeMode = "replace" | "append";

export interface RejectedRow {
  /** Номер строки в том CSV, откуда строка пришла; 1 — заголовок. */
  row: number;
  /** incoming — файл жюри, current — уже загруженный набор. */
  source: "incoming" | "current";
  recordId: string | null;
  reason: string;
}

export interface MergeSummary {
  mode: MergeMode;
  addedEmployees: number;
  updatedEmployees: number;
  addedEvents: number;
  updatedEvents: number;
  addedSkills: number;
  updatedSkills: number;
  addedHistory: number;
  updatedHistory: number;
  /** Подробности ограничены REJECTED_SAMPLE_LIMIT, чтобы не тащить тысячи строк в состояние. */
  rejectedRows: RejectedRow[];
  rejectedTotal: number;
  newEmployeeIds: string[];
}

export interface MergeResult {
  bundle: BundleTexts;
  summary: MergeSummary;
}

/** Слоты названы по смыслу; importCareerQuestDataset ждёт свои имена полей. */
export function bundleToFiles(bundle: BundleTexts): CareerQuestFiles {
  return {
    employees: bundle.employees,
    events: bundle.events,
    skills: bundle.skills,
    activityHistoryCsv: bundle.history,
  };
}

const HISTORY_COLUMNS = [
  "record_id",
  "employee_id",
  "event_id",
  "date",
  "due_date",
  "status",
  "completion_pct",
  "score",
  "feedback_rating",
  "assigned_by",
];

/** Serialize the current authorized workspace, including already committed progress.
 * Never fetch an unscoped base or replay the session ledger a second time.
 */
export function normalizedDatasetToBundle(
  dataset: NormalizedDataset,
): BundleTexts {
  const meta = {
    dataset: dataset.meta.dataset,
    version: dataset.meta.version,
    as_of_date: dataset.meta.asOfDate,
  };
  return {
    employees: JSON.stringify({
      meta,
      employees: Object.values(dataset.employeesById).map((employee) => ({
        employee_id: employee.id,
        full_name: employee.fullName,
        department: employee.department,
        role: employee.role,
        grade: employee.grade,
        manager_id:
          employee.managerId &&
          Object.hasOwn(dataset.employeesById, employee.managerId)
            ? employee.managerId
            : null,
        hire_date: employee.hireDate,
        tenure_months: employee.tenureMonths,
        work_format: employee.workFormat,
        preferred_language: employee.preferredLanguage,
        career_goal: employee.careerGoal
          ? {
              target_role: employee.careerGoal.targetRole,
              target_grade: employee.careerGoal.targetGrade,
            }
          : null,
        skills: employee.skills,
        last_review_date: employee.lastReviewDate,
      })),
    }),
    events: JSON.stringify({
      meta,
      events: Object.values(dataset.eventsById).map((event) => ({
        event_id: event.id,
        title: event.title,
        description: event.description,
        type: event.type,
        format: event.format,
        duration_hours: event.durationHours,
        mandatory: event.mandatory,
        target_roles: event.targetRoles,
        target_grades: event.targetGrades,
        develops_skills: event.developsSkills.map((effect) => ({
          skill_id: effect.skillId,
          gain: effect.gain,
          max_level: effect.maxLevel,
        })),
        prerequisites: event.prerequisites,
        upcoming_sessions: event.upcomingSessions,
      })),
    }),
    skills: JSON.stringify({
      meta,
      proficiency_scale: dataset.proficiencyScale,
      skills: Object.values(dataset.skillsById).map((skill) => ({
        skill_id: skill.id,
        name: skill.name,
        type: skill.type,
        category: skill.category,
        description: skill.description,
      })),
      role_profiles: Object.values(dataset.roleProfilesByKey).map(
        (profile) => ({
          role: profile.role,
          grade: profile.grade,
          required_skills: profile.requiredSkills,
          critical_skills: profile.criticalSkills,
        }),
      ),
    }),
    history: Papa.unparse(
      {
        fields: HISTORY_COLUMNS,
        data: dataset.history.map((record) => [
          record.id,
          record.employeeId,
          record.eventId,
          record.date,
          record.dueDate ?? "",
          record.status,
          record.completionPct,
          record.score ?? "",
          record.feedbackRating ?? "",
          record.assignedBy,
        ]),
      },
      { newline: "\n" },
    ),
  };
}

export const REJECTED_SAMPLE_LIMIT = 50;

export class JudgeImportError extends Error {
  constructor(
    message: string,
    readonly code: "MISSING_BASE" | "MISSING_SLOT" | "BAD_JSON" | "BAD_SHAPE",
    readonly slot?: DatasetSlot,
  ) {
    super(message);
    this.name = "JudgeImportError";
  }
}

const FILE_NAMES: Record<string, DatasetSlot> = {
  "employees.json": "employees",
  "events.json": "events",
  "skills.json": "skills",
  "activity_history.csv": "history",
};

/** Жюри может прислать файл в UTF-8 с BOM; JSON.parse на нём падает. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function tryJson(text: string): unknown | undefined {
  try {
    return JSON.parse(stripBom(text)) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rowsOf(
  value: unknown,
  key: string,
  idField: string,
): Record<string, unknown>[] | null {
  const candidate = isRecord(value) ? value[key] : value;
  if (!Array.isArray(candidate)) return null;
  if (!candidate.length) return [];
  return candidate.every(
    (row) => isRecord(row) && typeof row[idField] === "string",
  )
    ? (candidate as Record<string, unknown>[])
    : null;
}

/**
 * Имя файла — подсказка, а не источник правды: judge_profiles.json обязан быть распознан.
 * Неоднозначный файл не угадывается — вызывающий код спрашивает пользователя.
 */
export function detectDatasetSlot(
  fileName: string,
  content: string,
): SlotDetection {
  const byName = FILE_NAMES[fileName.trim().toLowerCase()];
  if (byName) return { slot: byName, confidence: "name" };

  const json = tryJson(content);
  if (json !== undefined) {
    const matches: DatasetSlot[] = [];
    if (
      isRecord(json) &&
      Array.isArray(json.skills) &&
      Array.isArray(json.role_profiles)
    ) {
      matches.push("skills");
    }
    if (rowsOf(json, "employees", "employee_id")) matches.push("employees");
    if (rowsOf(json, "events", "event_id")) matches.push("events");
    if (matches.length === 1)
      return { slot: matches[0], confidence: "content" };
    return { slot: null, reason: matches.length ? "ambiguous" : "unreadable" };
  }

  const header = stripBom(content).split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
  const columns = header
    .split(",")
    .map((cell) => cell.trim().replace(/^"|"$/g, ""));
  const hasHistoryColumns =
    columns.includes("employee_id") &&
    columns.includes("event_id") &&
    columns.includes("status");
  return hasHistoryColumns
    ? { slot: "history", confidence: "content" }
    : { slot: null, reason: "unreadable" };
}

function readCollection(
  text: string,
  slot: DatasetSlot,
  key: string,
  idField: string,
): { envelope: Record<string, unknown>; rows: Record<string, unknown>[] } {
  const json = tryJson(text);
  if (json === undefined) {
    throw new JudgeImportError(
      `Файл ${key} не является корректным JSON`,
      "BAD_JSON",
      slot,
    );
  }
  const rows = rowsOf(json, key, idField);
  if (!rows) {
    throw new JudgeImportError(
      `В файле ${key} не найден массив записей с полем ${idField}`,
      "BAD_SHAPE",
      slot,
    );
  }
  const envelope =
    isRecord(json) && Array.isArray(json[key]) ? { ...json } : { [key]: rows };
  return { envelope, rows };
}

type Counter = { added: number; updated: number; newIds: string[] };

/** Слияние по идентификатору: новый добавляется, существующий заменяется. Порядок стабилен. */
function mergeById(
  base: Record<string, unknown>[],
  incoming: Record<string, unknown>[],
  idField: string,
): { rows: Record<string, unknown>[]; counter: Counter } {
  const merged = [...base];
  const index = new Map(
    base.map((row, position) => [String(row[idField]), position]),
  );
  const counter: Counter = { added: 0, updated: 0, newIds: [] };
  const seen = new Set<string>();

  for (const row of incoming) {
    const id = String(row[idField]);
    if (seen.has(id))
      throw new JudgeImportError(`Duplicate identifier: ${id}`, "BAD_SHAPE");
    seen.add(id);
    const position = index.get(id);
    if (position === undefined) {
      index.set(id, merged.length);
      merged.push(row);
      counter.added += 1;
      counter.newIds.push(id);
    } else {
      merged[position] = row;
      counter.updated += 1;
    }
  }
  return { rows: merged, counter };
}

function parseHistoryRows(text: string): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(stripBom(text), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  const issues = parsed.errors.map((error) => ({
    source: "activity_history.csv" as const,
    path: `row.${error.row === undefined ? "unknown" : error.row + 2}`,
    message: error.message,
  }));
  const seen = new Set<string>();
  parsed.data.forEach((row, index) => {
    const result = activityHistoryRowSchema.safeParse(row);
    if (!result.success)
      issues.push(
        ...result.error.issues.map((issue) => ({
          source: "activity_history.csv" as const,
          path: `row.${index + 2}.${issue.path.join(".")}`,
          message: issue.message,
        })),
      );
    if (seen.has(row.record_id))
      issues.push({
        source: "activity_history.csv",
        path: `row.${index + 2}.record_id`,
        message: `Duplicate identifier: ${row.record_id}`,
      });
    seen.add(row.record_id);
  });
  if (issues.length) throw new DatasetValidationError(issues);
  return parsed.data.filter((row) => row && Object.keys(row).length > 0);
}

/** Пустой CSV импортёр не разбирает, поэтому заголовок сохраняем всегда. */
function serializeHistory(
  rows: Record<string, string>[],
  columns: string[],
): string {
  if (!rows.length) return columns.join(",");
  return Papa.unparse(rows, { columns, newline: "\n" });
}

function ensureSlots(bundle: Partial<BundleTexts>): BundleTexts {
  for (const slot of DATASET_SLOTS) {
    if (!bundle[slot]) {
      throw new JudgeImportError(
        `Не хватает части набора: ${slot}. Загрузите её или сначала откройте демо-набор.`,
        "MISSING_SLOT",
        slot,
      );
    }
  }
  return bundle as BundleTexts;
}

export interface MergeInput {
  /** Текущий загруженный набор. Для режима append обязателен. */
  base: BundleTexts | null;
  incoming: Partial<Record<DatasetSlot, string>>;
  mode: MergeMode;
}

/**
 * Собирает полный набор из частичного. Строки истории, ссылающиеся на неизвестного сотрудника
 * или неизвестное событие, отклоняются с номером строки — остальное импортируется.
 */
export function mergeDatasetTexts({
  base,
  incoming,
  mode,
}: MergeInput): MergeResult {
  if (mode === "append" && !base) {
    throw new JudgeImportError(
      "Режим «дополнить» доступен только когда набор уже загружен.",
      "MISSING_BASE",
    );
  }

  const summary: MergeSummary = {
    mode,
    addedEmployees: 0,
    updatedEmployees: 0,
    addedEvents: 0,
    updatedEvents: 0,
    addedSkills: 0,
    updatedSkills: 0,
    addedHistory: 0,
    updatedHistory: 0,
    rejectedRows: [],
    rejectedTotal: 0,
    newEmployeeIds: [],
  };

  const resolved = ensureSlots({ ...(base ?? {}), ...incoming });
  const result: BundleTexts = Object.fromEntries(
    DATASET_SLOTS.map((slot) => [slot, stripBom(resolved[slot])]),
  ) as BundleTexts;
  const current = base;

  if (mode === "replace") {
    return {
      bundle: pruneHistory(
        result,
        summary,
        incoming.history ? "incoming" : "current",
      ),
      summary,
    };
  }

  if (incoming.employees && current) {
    const baseSide = readCollection(
      current.employees,
      "employees",
      "employees",
      "employee_id",
    );
    const newSide = readCollection(
      incoming.employees,
      "employees",
      "employees",
      "employee_id",
    );
    const { rows, counter } = mergeById(
      baseSide.rows,
      newSide.rows,
      "employee_id",
    );
    summary.addedEmployees = counter.added;
    summary.updatedEmployees = counter.updated;
    summary.newEmployeeIds = counter.newIds;
    result.employees = JSON.stringify(
      { ...baseSide.envelope, employees: rows },
      null,
      2,
    );
  }

  if (incoming.events && current) {
    const baseSide = readCollection(
      current.events,
      "events",
      "events",
      "event_id",
    );
    const newSide = readCollection(
      incoming.events,
      "events",
      "events",
      "event_id",
    );
    const { rows, counter } = mergeById(
      baseSide.rows,
      newSide.rows,
      "event_id",
    );
    summary.addedEvents = counter.added;
    summary.updatedEvents = counter.updated;
    result.events = JSON.stringify(
      { ...baseSide.envelope, events: rows },
      null,
      2,
    );
  }

  if (incoming.skills && current) {
    const baseSide = readCollection(
      current.skills,
      "skills",
      "skills",
      "skill_id",
    );
    const newSide = readCollection(
      incoming.skills,
      "skills",
      "skills",
      "skill_id",
    );
    const { rows, counter } = mergeById(
      baseSide.rows,
      newSide.rows,
      "skill_id",
    );
    summary.addedSkills = counter.added;
    summary.updatedSkills = counter.updated;
    const baseProfiles =
      (baseSide.envelope.role_profiles as Record<string, unknown>[]) ?? [];
    const newProfiles =
      (newSide.envelope.role_profiles as Record<string, unknown>[]) ?? [];
    const profileKey = (row: Record<string, unknown>) =>
      `${String(row.role)}::${String(row.grade)}`;
    const profiles = [...baseProfiles];
    const profileIndex = new Map(
      profiles.map((row, position) => [profileKey(row), position]),
    );
    for (const row of newProfiles) {
      const position = profileIndex.get(profileKey(row));
      if (position === undefined) {
        profileIndex.set(profileKey(row), profiles.length);
        profiles.push(row);
      } else {
        profiles[position] = row;
      }
    }
    result.skills = JSON.stringify(
      { ...baseSide.envelope, skills: rows, role_profiles: profiles },
      null,
      2,
    );
  }

  if (incoming.history && current) {
    const baseRows = parseHistoryRows(current.history);
    const employeeIds = new Set(
      readCollection(
        result.employees,
        "employees",
        "employees",
        "employee_id",
      ).rows.map((row) => String(row.employee_id)),
    );
    const eventIds = new Set(
      readCollection(result.events, "events", "events", "event_id").rows.map(
        (row) => String(row.event_id),
      ),
    );
    const index = new Map(
      baseRows.map((row, position) => [row.record_id, position]),
    );
    const merged = [...baseRows];
    const origins = baseRows.map((_, index) => ({
      source: "current" as "current" | "incoming",
      row: index + 2,
      added: false,
    }));
    for (const [offset, row] of parseHistoryRows(incoming.history).entries()) {
      const reason = !employeeIds.has(row.employee_id)
        ? `неизвестный employee_id ${row.employee_id}`
        : !eventIds.has(row.event_id)
          ? `неизвестный event_id ${row.event_id}`
          : null;
      if (reason) {
        summary.rejectedTotal++;
        if (summary.rejectedRows.length < REJECTED_SAMPLE_LIMIT)
          summary.rejectedRows.push({
            row: offset + 2,
            source: "incoming",
            recordId: row.record_id,
            reason,
          });
        continue;
      }
      const position = index.get(row.record_id);
      if (position === undefined) {
        index.set(row.record_id, merged.length);
        merged.push(row);
        origins.push({ source: "incoming", row: offset + 2, added: true });
        summary.addedHistory += 1;
      } else {
        merged[position] = row;
        origins[position] = {
          source: "incoming",
          row: offset + 2,
          added: false,
        };
        summary.updatedHistory += 1;
      }
    }
    result.history = serializeHistory(merged, HISTORY_COLUMNS);
    return {
      bundle: pruneHistory(result, summary, "current", origins),
      summary,
    };
  }

  return { bundle: pruneHistory(result, summary, "current"), summary };
}

/**
 * Строка истории, ссылающаяся на неизвестного сотрудника или событие, отклоняется с номером
 * строки — остальное импортируется. Проверка идёт по УЖЕ собранным профилям и событиям,
 * поэтому одинаково ловит и мусор из файла жюри, и записи, осиротевшие после замены набора.
 */
function pruneHistory(
  bundle: BundleTexts,
  summary: MergeSummary,
  defaultSource: "incoming" | "current",
  origins?: { source: "incoming" | "current"; row: number; added: boolean }[],
): BundleTexts {
  const employeeIds = new Set(
    readCollection(
      bundle.employees,
      "employees",
      "employees",
      "employee_id",
    ).rows.map((row) => String(row.employee_id)),
  );
  const eventIds = new Set(
    readCollection(bundle.events, "events", "events", "event_id").rows.map(
      (row) => String(row.event_id),
    ),
  );

  const rows = parseHistoryRows(bundle.history);
  const kept: Record<string, string>[] = [];

  rows.forEach((row, offset) => {
    const origin = origins?.[offset] ?? {
      source: defaultSource,
      row: offset + 2,
      added: false,
    };
    const reject = (reason: string) => {
      summary.rejectedTotal += 1;
      if (summary.rejectedRows.length < REJECTED_SAMPLE_LIMIT) {
        summary.rejectedRows.push({
          row: origin.row,
          source: origin.source,
          recordId: row.record_id ?? null,
          reason,
        });
      }
      if (origin.source === "incoming" && origins) {
        if (origin.added)
          summary.addedHistory = Math.max(0, summary.addedHistory - 1);
        else summary.updatedHistory = Math.max(0, summary.updatedHistory - 1);
      }
    };
    if (!employeeIds.has(row.employee_id)) {
      reject(`неизвестный employee_id ${row.employee_id || "(пусто)"}`);
      return;
    }
    if (!eventIds.has(row.event_id)) {
      reject(`неизвестный event_id ${row.event_id || "(пусто)"}`);
      return;
    }
    kept.push(row);
  });

  if (kept.length === rows.length) return bundle;
  return {
    ...bundle,
    history: serializeHistory(kept, HISTORY_COLUMNS),
  };
}
