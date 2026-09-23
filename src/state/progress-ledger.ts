import type { NormalizedDataset } from "@/lib/contracts";

export interface PersistedCompletion {
  id: string;
  datasetFingerprint: string;
  employeeId: string;
  activityId: string;
  completedAt: string;
}

const DATABASE_NAME = "career-quest";
const DATABASE_VERSION = 1;
const STORE_NAME = "completion-ledger";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function hashCanonicalDataset(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  let primary = 0x811c9dc5;
  let secondary = 0x9e3779b9;

  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    primary = Math.imul(primary ^ code, 0x01000193);
    secondary = Math.imul(secondary ^ code, 0x85ebca6b);
  }

  return [primary, secondary]
    .map((part) => (part >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

/**
 * Identifies the immutable imported snapshot, not the mutable in-session dataset. Callers keep
 * this value in the shared store while local completion records are appended.
 */
export function createDatasetFingerprint(dataset: NormalizedDataset): string {
  const contentHash = hashCanonicalDataset({
    meta: dataset.meta,
    proficiencyScale: dataset.proficiencyScale,
    skillsById: dataset.skillsById,
    roleProfilesByKey: dataset.roleProfilesByKey,
    employeesById: dataset.employeesById,
    eventsById: dataset.eventsById,
    history: dataset.history,
  });
  return `cq:${dataset.meta.dataset}:${dataset.meta.version}:${dataset.meta.asOfDate}:${contentHash}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Cannot open progress database"));
  });
}

export async function loadCompletionLedger(): Promise<PersistedCompletion[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () =>
        resolve(
          (request.result as PersistedCompletion[]).sort(
            (left, right) =>
              left.completedAt.localeCompare(right.completedAt) || left.id.localeCompare(right.id),
          ),
        );
      request.onerror = () => reject(request.error ?? new Error("Cannot read progress ledger"));
    });
  } finally {
    database.close();
  }
}

export async function persistCompletion(entry: PersistedCompletion): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Cannot save progress"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Progress save aborted"));
    });
  } finally {
    database.close();
  }
}
