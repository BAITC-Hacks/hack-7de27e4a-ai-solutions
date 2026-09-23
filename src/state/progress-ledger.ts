export interface PersistedCompletion {
  id: string;
  employeeId: string;
  activityId: string;
  completedAt: string;
}

const DATABASE_NAME = "career-quest";
const DATABASE_VERSION = 1;
const STORE_NAME = "completion-ledger";

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
