import {
  rewardsFileSchema,
  rulesSchema,
  type GamificationRules,
  type Reward,
} from "./types";

export class GamificationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GamificationConfigError";
  }
}

export function loadGamificationRules(input: unknown): GamificationRules {
  const parsed = rulesSchema.safeParse(input);
  if (!parsed.success) {
    throw new GamificationConfigError(
      `gamification_rules.json: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    );
  }
  return parsed.data;
}

export function loadRewards(input: unknown): Reward[] {
  const parsed = rewardsFileSchema.safeParse(input);
  if (!parsed.success) {
    throw new GamificationConfigError(
      `rewards.json: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    );
  }
  const ids = new Set<string>();
  for (const reward of parsed.data.rewards) {
    if (ids.has(reward.id)) {
      throw new GamificationConfigError(`rewards.json: дублирующийся id ${reward.id}`);
    }
    ids.add(reward.id);
  }
  return parsed.data.rewards;
}
