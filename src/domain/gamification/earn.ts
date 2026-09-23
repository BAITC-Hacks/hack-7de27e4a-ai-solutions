import type { LedgerEvent } from "@/state/intelligenceAdapter";
import type { NormalizedDataset } from "@/lib/contracts";

import {
  buildEffectiveEmployeeProfile,
  resolveTarget,
} from "../recommendation/profile";
import type {
  GamificationRules,
  GamificationState,
  PointsEntry,
  PointsFact,
} from "./types";
import { emptyGamificationState } from "./types";
import { completedActivities } from "./completions";

export interface EarnInput {
  dataset: NormalizedDataset;
  employeeId: string;
  ledger?: readonly LedgerEvent[];
  state?: GamificationState;
  rules: GamificationRules;
}

export interface EarnResult {
  employeeId: string;
  rulesVersion: string;
  total: number;
  entries: readonly PointsEntry[];
  /** Обязательные события начисления не дают — считаем их отдельно, чтобы это было видно. */
  skippedMandatory: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Релевантность считается по ТРЕБОВАНИЯМ целевого грейда, а не по остатку разрыва:
 * иначе закрытый разрыв обнулял бы награду за то, что его закрыли.
 */
function targetSkills(dataset: NormalizedDataset, employeeId: string) {
  const profile = buildEffectiveEmployeeProfile(dataset, employeeId);
  const target = resolveTarget(dataset, profile);
  if (!target)
    return { required: new Set<string>(), critical: new Set<string>() };
  return {
    required: new Set(Object.keys(target.profile.requiredSkills)),
    critical: new Set(target.profile.criticalSkills),
  };
}

export function earnedPoints({
  dataset,
  employeeId,
  ledger = [],
  state = emptyGamificationState,
  rules,
}: EarnInput): EarnResult {
  const { required, critical } = targetSkills(dataset, employeeId);
  const entries: PointsEntry[] = [];
  let skippedMandatory = 0;

  const completions = completedActivities(dataset, employeeId, ledger);

  for (const completion of completions) {
    const event = dataset.eventsById[completion.activityId];
    if (!event) continue;
    if (event.mandatory) {
      // Механика вокруг обязательных процессов прямо запрещена ТЗ организаторов.
      skippedMandatory += 1;
      continue;
    }
    const skills = event.developsSkills.map((effect) => effect.skillId);
    const hitsCritical = skills.some((skillId) => critical.has(skillId));
    const hitsTarget = skills.some((skillId) => required.has(skillId));
    const multiplier = hitsCritical ? rules.activity.criticalMultiplier : 1;
    const relevance = hitsTarget ? 1 : rules.activity.offTargetFactor;
    const points = round(rules.activity.base * multiplier * relevance);

    const facts: PointsFact[] = [
      { code: "activity", label: "Активность", value: event.title },
      { code: "completed_at", label: "Завершена", value: completion.at },
      { code: "base", label: "Базовые баллы", value: rules.activity.base },
      {
        code: "critical_multiplier",
        label: "Критичный множитель",
        value: multiplier,
      },
      { code: "relevance", label: "Релевантность цели", value: relevance },
    ];
    if (hitsCritical) {
      const skillId = skills.find((id) => critical.has(id))!;
      facts.push({
        code: "critical_skill",
        label: "Критичный навык",
        value: skillId,
      });
    }
    entries.push({
      id: `activity:${completion.id}`,
      kind: "activity",
      points,
      at: completion.at,
      facts,
    });
  }

  for (const record of state.mentorships.filter(
    (item) => item.mentorId === employeeId,
  )) {
    entries.push({
      id: `mentorship:${record.id}`,
      kind: "mentorship",
      points: rules.mentorship.threadClosed,
      at: record.closedAt,
      facts: [
        {
          code: "thread",
          label: "Менторский тред закрыт",
          value: record.threadId,
        },
        {
          code: "base",
          label: "Начисление за менторство",
          value: rules.mentorship.threadClosed,
        },
      ],
    });
  }

  // Потолок защищает от накрутки благодарностями.
  const thanks = state.thanks
    .filter((record) => record.toEmployeeId === employeeId)
    .slice(0, rules.mentorship.thanksPerPeriodCap);
  for (const record of thanks) {
    entries.push({
      id: `thanks:${record.id}`,
      kind: "thanks",
      points: rules.mentorship.thanksReceived,
      at: record.at,
      facts: [
        {
          code: "thread",
          label: "Благодарность в треде",
          value: record.threadId,
        },
        { code: "from", label: "От коллеги", value: record.fromEmployeeId },
      ],
    });
  }

  const total = round(entries.reduce((sum, entry) => sum + entry.points, 0));
  return {
    employeeId,
    rulesVersion: rules.meta.version,
    total,
    entries,
    skippedMandatory,
  };
}

export function spentPoints(
  state: GamificationState,
  employeeId: string,
): number {
  return state.redemptions
    .filter((redemption) => redemption.employeeId === employeeId)
    .reduce((sum, redemption) => sum + redemption.cost, 0);
}

export interface BalanceView extends EarnResult {
  spent: number;
  balance: number;
}

/**
 * Считает баланс ТОЛЬКО для одного сотрудника — того, кто смотрит.
 * Функции, возвращающей чужие или все балансы сразу, в модуле нет намеренно:
 * публичные рейтинги сотрудников запрещены ТЗ.
 */
export function balanceForViewer(input: EarnInput): BalanceView {
  const earned = earnedPoints(input);
  const spent = spentPoints(
    input.state ?? emptyGamificationState,
    input.employeeId,
  );
  return { ...earned, spent, balance: round(earned.total - spent) };
}
