import type { GamificationState, Redemption, Reward } from "./types";

export class RedemptionError extends Error {
  constructor(
    message: string,
    readonly code: "UNKNOWN_REWARD" | "INSUFFICIENT_BALANCE" | "OPTED_OUT",
  ) {
    super(message);
    this.name = "RedemptionError";
  }
}

export interface RedeemInput {
  state: GamificationState;
  employeeId: string;
  rewardId: string;
  rewards: readonly Reward[];
  balance: number;
  /** Дата среза датасета, не системные часы. */
  at: string;
  /** Тот же requestId применяется один раз — защита от двойного списания. */
  requestId: string;
}

export interface RedeemResult {
  state: GamificationState;
  redemption: Redemption;
  alreadyApplied: boolean;
}

/** Списание неизменяемо и хранит баланс до и после — как журнал выполнения активностей. */
export function redeemReward({
  state,
  employeeId,
  rewardId,
  rewards,
  balance,
  at,
  requestId,
}: RedeemInput): RedeemResult {
  const existing = state.redemptions.find((item) => item.id === requestId);
  if (existing) return { state, redemption: existing, alreadyApplied: true };

  if (state.optedOut.includes(employeeId)) {
    throw new RedemptionError("Геймификация отключена для этого сотрудника", "OPTED_OUT");
  }

  const reward = rewards.find((item) => item.id === rewardId);
  if (!reward) throw new RedemptionError(`Неизвестная награда ${rewardId}`, "UNKNOWN_REWARD");

  if (reward.cost > balance) {
    throw new RedemptionError(
      `Недостаточно баллов: нужно ${reward.cost}, доступно ${balance}`,
      "INSUFFICIENT_BALANCE",
    );
  }

  const redemption: Redemption = Object.freeze({
    id: requestId,
    employeeId,
    rewardId,
    cost: reward.cost,
    balanceBefore: balance,
    balanceAfter: balance - reward.cost,
    at,
  });

  return {
    state: { ...state, redemptions: [...state.redemptions, redemption] },
    redemption,
    alreadyApplied: false,
  };
}

export function setOptedOut(
  state: GamificationState,
  employeeId: string,
  optedOut: boolean,
): GamificationState {
  const without = state.optedOut.filter((id) => id !== employeeId);
  return { ...state, optedOut: optedOut ? [...without, employeeId] : without };
}
