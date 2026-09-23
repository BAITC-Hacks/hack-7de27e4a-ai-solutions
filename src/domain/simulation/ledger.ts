import type { LedgerEvent } from "../../state/intelligenceAdapter";
import type { SimulationStep } from "./simulator";

export function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function appendCompletion(
  ledger: readonly LedgerEvent[],
  step: SimulationStep,
  meta: Pick<
    LedgerEvent,
    "datasetId" | "employeeId" | "requestId" | "completedAt" | "effectiveDate"
  >,
): readonly LedgerEvent[] {
  if (ledger.some((event) => event.requestId === meta.requestId)) return ledger;
  const event: LedgerEvent = freezeDeep({
    ...meta,
    id: meta.requestId,
    activityId: step.activityId,
    before: { ...step.before },
    delta: { ...step.delta },
    after: { ...step.after },
  });
  return freezeDeep([...ledger, event]);
}
