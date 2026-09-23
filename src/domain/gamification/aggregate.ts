import type { GamificationState, Reward } from "./types";

/**
 * HR видит только агрегаты. Ни одного поля с идентификатором сотрудника здесь нет
 * и быть не должно: публичные рейтинги и персональные баллы запрещены ТЗ.
 */
export interface GamificationAggregate {
  participants: number;
  optedOutCount: number;
  redemptionsTotal: number;
  pointsSpent: number;
  redemptionsByKind: Record<string, number>;
  challengesAccepted: number;
}

export function aggregateGamification(
  state: GamificationState,
  rewards: readonly Reward[],
): GamificationAggregate {
  const visible = state.redemptions.filter(
    (redemption) => !state.optedOut.includes(redemption.employeeId),
  );
  const byKind: Record<string, number> = {};
  for (const redemption of visible) {
    const kind = rewards.find((reward) => reward.id === redemption.rewardId)?.kind ?? "unknown";
    byKind[kind] = (byKind[kind] ?? 0) + 1;
  }
  const participants = new Set(
    [
      ...visible.map((redemption) => redemption.employeeId),
      ...state.challenges.map((challenge) => challenge.employeeId),
    ].filter((id) => !state.optedOut.includes(id)),
  ).size;

  return {
    participants,
    optedOutCount: state.optedOut.length,
    redemptionsTotal: visible.length,
    pointsSpent: visible.reduce((sum, redemption) => sum + redemption.cost, 0),
    redemptionsByKind: byKind,
    challengesAccepted: state.challenges.filter(
      (challenge) => !state.optedOut.includes(challenge.employeeId),
    ).length,
  };
}
