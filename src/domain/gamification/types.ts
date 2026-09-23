import { z } from "zod";

/**
 * Экономика развития.
 *
 * Баланс не хранится: earned — чистая функция от датасета, журнала и правил,
 * spent — сумма хранимых списаний. Повторный импорт того же набора даёт тот же
 * баланс, дрейфа состояния не существует, и всё проверяется без интерфейса.
 */

export const rulesSchema = z
  .object({
    meta: z.object({ version: z.string().min(1) }).passthrough(),
    activity: z.object({
      base: z.number().positive(),
      criticalMultiplier: z.number().min(1),
      offTargetFactor: z.number().min(0).max(1),
      mandatoryPoints: z.literal(0),
    }),
    mentorship: z.object({
      threadClosed: z.number().min(0),
      thanksReceived: z.number().min(0),
      thanksPerPeriodCap: z.number().int().min(0),
    }),
    challenge: z.object({
      completionBonus: z.number().min(0),
      windowDays: z.number().int().positive(),
      voluntaryTarget: z.number().int().positive(),
    }),
  })
  .passthrough();

export const rewardSchema = z.object({
  id: z.string().regex(/^RW_[A-Z0-9_]+$/),
  title: z.string().min(1),
  description: z.string().min(1),
  kind: z.enum(["external_course", "mentor_hour", "learning_day", "conference"]),
  cost: z.number().int().positive(),
});

export const rewardsFileSchema = z.object({
  meta: z.object({ version: z.string().min(1) }).passthrough(),
  rewards: z.array(rewardSchema).min(1),
});

export type GamificationRules = z.infer<typeof rulesSchema>;
export type Reward = z.infer<typeof rewardSchema>;

export type PointsKind = "activity" | "mentorship" | "thanks" | "challenge";

/** Квитанция: каждое начисление раскладывается на факты, неразложимых чисел нет. */
export interface PointsFact {
  code: string;
  label: string;
  value: string | number | boolean;
}

export interface PointsEntry {
  id: string;
  kind: PointsKind;
  points: number;
  at: string;
  facts: readonly PointsFact[];
}

export interface Redemption {
  id: string;
  employeeId: string;
  rewardId: string;
  cost: number;
  balanceBefore: number;
  balanceAfter: number;
  at: string;
}

export type ChallengeKind = "close_critical_gap" | "complete_voluntary" | "mentor_once";

export interface ChallengeProposal {
  id: string;
  kind: ChallengeKind;
  skillId?: string;
  target: number;
  title: string;
}

export interface AcceptedChallenge extends ChallengeProposal {
  employeeId: string;
  acceptedAt: string;
  deadline: string;
}

/** Благодарность приходит из Skill Exchange; без него список просто пуст. */
export interface ThanksRecord {
  id: string;
  threadId: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  at: string;
}

export interface MentorshipRecord {
  id: string;
  threadId: string;
  mentorId: string;
  closedAt: string;
}

export interface GamificationState {
  redemptions: readonly Redemption[];
  challenges: readonly AcceptedChallenge[];
  thanks: readonly ThanksRecord[];
  mentorships: readonly MentorshipRecord[];
  optedOut: readonly string[];
}

export const emptyGamificationState: GamificationState = {
  redemptions: [],
  challenges: [],
  thanks: [],
  mentorships: [],
  optedOut: [],
};
