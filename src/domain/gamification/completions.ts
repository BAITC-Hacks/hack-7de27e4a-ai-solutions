import type { NormalizedDataset } from "@/lib/contracts";
import type { LedgerEvent } from "@/state/intelligenceAdapter";

/** The active normalized history already contains committed session records. */
export function completedActivities(
  dataset: NormalizedDataset,
  employeeId: string,
  ledger: readonly LedgerEvent[] = [],
) {
  const history = (dataset.historyByEmployeeId[employeeId] ?? [])
    .filter(
      (record) =>
        record.status === "completed" && record.date <= dataset.meta.asOfDate,
    )
    .map((record) => ({
      activityId: record.eventId,
      at: record.date,
      id: record.id,
    }));
  const seen = new Set(history.map((record) => record.id));
  const result = [...history];
  for (const event of ledger) {
    if (
      event.employeeId !== employeeId ||
      event.effectiveDate > dataset.meta.asOfDate
    )
      continue;
    if (seen.has(event.id) || seen.has(`session:${event.id}`)) continue;
    seen.add(event.id);
    result.push({
      activityId: event.activityId,
      at: event.effectiveDate,
      id: event.id,
    });
  }
  return result;
}
