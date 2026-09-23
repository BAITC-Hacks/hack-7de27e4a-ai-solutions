import Papa from "papaparse";

import type { CareerQuestFiles } from "@/lib/contracts";

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

export const DATASET_SLOTS = ["employees", "events", "skills", "history"] as const;
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

function rowsOf(value: unknown, key: string, idField: string): Record<string, unknown>[] | null {
  const candidate = isRecord(value) ? value[key] : value;
  if (!Array.isArray(candidate)) return null;
  if (!candidate.length) return [];
  return candidate.every((row) => isRecord(row) && typeof row[idField] === "string")
    ? (candidate as Record<string, unknown>[])
    : null;
}

/**
 * Имя файла — подсказка, а не источник правды: judge_profiles.json обязан быть распознан.
 * Неоднозначный файл не угадывается — вызывающий код спрашивает пользователя.
 */
export function detectDatasetSlot(fileName: string, content: string): SlotDetection {
  const byName = FILE_NAMES[fileName.trim().toLowerCase()];
  if (byName) return { slot: byName, confidence: "name" };

  const json = tryJson(content);
  if (json !== undefined) {
    const matches: DatasetSlot[] = [];
    if (isRecord(json) && Array.isArray(json.skills) && Array.isArray(json.role_profiles)) {
      matches.push("skills");
    }
    if (rowsOf(json, "employees", "employee_id")) matches.push("employees");
    if (rowsOf(json, "events", "event_id")) matches.push("events");
    if (matches.length === 1) return { slot: matches[0], confidence: "content" };
    return { slot: null, reason: matches.length ? "ambiguous" : "unreadable" };
  }

  const header = stripBom(content).split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
  const columns = header.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
  const hasHistoryColumns =
    columns.includes("employee_id") && columns.includes("event_id") && columns.includes("status");
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
    throw new JudgeImportError(`Файл ${key} не является корректным JSON`, "BAD_JSON", slot);
  }
  const rows = rowsOf(json, key, idField);
  if (!rows) {
    throw new JudgeImportError(
      `В файле ${key} не найден массив записей с полем ${idField}`,
      "BAD_SHAPE",
      slot,
    );
  }
  const envelope = isRecord(json) && Array.isArray(json[key]) ? { ...json } : { [key]: rows };
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
  const index = new Map(base.map((row, position) => [String(row[idField]), position]));
  const counter: Counter = { added: 0, updated: 0, newIds: [] };

  for (const row of incoming) {
    const id = String(row[idField]);
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
  return parsed.data.filter((row) => row && Object.keys(row).length > 0);
}

/** Пустой CSV импортёр не разбирает, поэтому заголовок сохраняем всегда. */
function serializeHistory(rows: Record<string, string>[], columns: string[]): string {
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
export function mergeDatasetTexts({ base, incoming, mode }: MergeInput): MergeResult {
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
  const result: BundleTexts = { ...resolved };
  const current = base;

  if (mode === "replace") {
    return { bundle: pruneHistory(result, summary, null), summary };
  }

  if (incoming.employees && current) {
    const baseSide = readCollection(current.employees, "employees", "employees", "employee_id");
    const newSide = readCollection(incoming.employees, "employees", "employees", "employee_id");
    const { rows, counter } = mergeById(baseSide.rows, newSide.rows, "employee_id");
    summary.addedEmployees = counter.added;
    summary.updatedEmployees = counter.updated;
    summary.newEmployeeIds = counter.newIds;
    result.employees = JSON.stringify({ ...baseSide.envelope, employees: rows }, null, 2);
  }

  if (incoming.events && current) {
    const baseSide = readCollection(current.events, "events", "events", "event_id");
    const newSide = readCollection(incoming.events, "events", "events", "event_id");
    const { rows, counter } = mergeById(baseSide.rows, newSide.rows, "event_id");
    summary.addedEvents = counter.added;
    summary.updatedEvents = counter.updated;
    result.events = JSON.stringify({ ...baseSide.envelope, events: rows }, null, 2);
  }

  if (incoming.skills && current) {
    const baseSide = readCollection(current.skills, "skills", "skills", "skill_id");
    const newSide = readCollection(incoming.skills, "skills", "skills", "skill_id");
    const { rows, counter } = mergeById(baseSide.rows, newSide.rows, "skill_id");
    summary.addedSkills = counter.added;
    summary.updatedSkills = counter.updated;
    const baseProfiles = (baseSide.envelope.role_profiles as Record<string, unknown>[]) ?? [];
    const newProfiles = (newSide.envelope.role_profiles as Record<string, unknown>[]) ?? [];
    const profileKey = (row: Record<string, unknown>) => `${String(row.role)}::${String(row.grade)}`;
    const profiles = [...baseProfiles];
    const profileIndex = new Map(profiles.map((row, position) => [profileKey(row), position]));
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
    const index = new Map(baseRows.map((row, position) => [row.record_id, position]));
    const merged = [...baseRows];
    for (const row of parseHistoryRows(incoming.history)) {
      const position = index.get(row.record_id);
      if (position === undefined) {
        index.set(row.record_id, merged.length);
        merged.push(row);
        summary.addedHistory += 1;
      } else {
        merged[position] = row;
        summary.updatedHistory += 1;
      }
    }
    result.history = serializeHistory(merged, Object.keys(baseRows[0] ?? merged[0] ?? {}));
    return { bundle: pruneHistory(result, summary, baseRows.length), summary };
  }

  return { bundle: pruneHistory(result, summary, null), summary };
}

/**
 * Строка истории, ссылающаяся на неизвестного сотрудника или событие, отклоняется с номером
 * строки — остальное импортируется. Проверка идёт по УЖЕ собранным профилям и событиям,
 * поэтому одинаково ловит и мусор из файла жюри, и записи, осиротевшие после замены набора.
 */
function pruneHistory(
  bundle: BundleTexts,
  summary: MergeSummary,
  baseRowCount: number | null,
): BundleTexts {
  const employeeIds = new Set(
    readCollection(bundle.employees, "employees", "employees", "employee_id").rows.map((row) =>
      String(row.employee_id),
    ),
  );
  const eventIds = new Set(
    readCollection(bundle.events, "events", "events", "event_id").rows.map((row) =>
      String(row.event_id),
    ),
  );

  const rows = parseHistoryRows(bundle.history);
  const kept: Record<string, string>[] = [];

  rows.forEach((row, offset) => {
    const fromIncoming = baseRowCount !== null && offset >= baseRowCount;
    const reject = (reason: string) => {
      summary.rejectedTotal += 1;
      if (summary.rejectedRows.length < REJECTED_SAMPLE_LIMIT) {
        summary.rejectedRows.push({
          row: (fromIncoming ? offset - (baseRowCount ?? 0) : offset) + 2,
          source: fromIncoming ? "incoming" : "current",
          recordId: row.record_id ?? null,
          reason,
        });
      }
      if (fromIncoming) summary.addedHistory = Math.max(0, summary.addedHistory - 1);
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
    history: serializeHistory(kept, Object.keys(rows[0] ?? kept[0] ?? {})),
  };
}
