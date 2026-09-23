import type { LedgerEvent } from "@/state/intelligenceAdapter";
import type { NormalizedDataset } from "@/lib/contracts";

import {
  analyzeGaps,
  buildEffectiveEmployeeProfile,
  resolveTarget,
} from "../recommendation/profile";
import type {
  AcceptedChallenge,
  ChallengeProposal,
  GamificationRules,
  GamificationState,
} from "./types";
import { emptyGamificationState } from "./types";
import { completedActivities } from "./completions";

/** Срок считается от даты среза датасета: системные часы сломали бы воспроизводимость. */
export function deadlineFrom(snapshotDate: string, windowDays: number): string {
  const start = new Date(`${snapshotDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + windowDays);
  return start.toISOString().slice(0, 10);
}

export function proposeChallenges(
  dataset: NormalizedDataset,
  employeeId: string,
  rules: GamificationRules,
): ChallengeProposal[] {
  const profile = buildEffectiveEmployeeProfile(dataset, employeeId);
  const target = resolveTarget(dataset, profile);
  const analysis = analyzeGaps(profile, target);
  const proposals: ChallengeProposal[] = [];

  const criticalGap = analysis.gaps.find((gap) => gap.critical && gap.gap > 0);
  if (criticalGap) {
    proposals.push({
      id: `close_critical_gap:${criticalGap.skillId}`,
      kind: "close_critical_gap",
      skillId: criticalGap.skillId,
      target: criticalGap.requiredLevel,
      title: `Закрыть критичный разрыв: ${criticalGap.skillId}`,
    });
  }

  proposals.push({
    id: `complete_voluntary:${rules.challenge.voluntaryTarget}`,
    kind: "complete_voluntary",
    target: rules.challenge.voluntaryTarget,
    title: `Завершить ${rules.challenge.voluntaryTarget} добровольные активности`,
  });

  proposals.push({
    id: "mentor_once",
    kind: "mentor_once",
    target: 1,
    title: "Помочь коллеге как ментор",
  });

  return proposals;
}

export function acceptChallenge(
  state: GamificationState,
  employeeId: string,
  proposal: ChallengeProposal,
  snapshotDate: string,
  rules: GamificationRules,
): GamificationState {
  const already = state.challenges.some(
    (item) => item.employeeId === employeeId && item.id === proposal.id,
  );
  if (already) return state;
  const accepted: AcceptedChallenge = {
    ...proposal,
    employeeId,
    acceptedAt: snapshotDate,
    deadline: deadlineFrom(snapshotDate, rules.challenge.windowDays),
  };
  return { ...state, challenges: [...state.challenges, accepted] };
}

export interface ChallengeProgress {
  challenge: AcceptedChallenge;
  current: number;
  target: number;
  completed: boolean;
}

/**
 * Выполнение выводится из тех же фактов, что и баллы, поэтому его нельзя «проставить».
 * Провал ничего не отнимает: в модели просто нет отрицательного исхода.
 */
export function challengeProgress(
  dataset: NormalizedDataset,
  employeeId: string,
  state: GamificationState = emptyGamificationState,
  ledger: readonly LedgerEvent[] = [],
): ChallengeProgress[] {
  const profile = buildEffectiveEmployeeProfile(dataset, employeeId);
  const mine = state.challenges.filter(
    (item) => item.employeeId === employeeId,
  );

  return mine.map((challenge) => {
    let current = 0;
    if (challenge.kind === "close_critical_gap" && challenge.skillId) {
      current = profile.effectiveSkills[challenge.skillId] ?? 0;
    } else if (challenge.kind === "complete_voluntary") {
      current = completedActivities(dataset, employeeId, ledger).filter(
        (record) =>
          record.at >= challenge.acceptedAt &&
          record.at <= challenge.deadline &&
          dataset.eventsById[record.activityId]?.mandatory === false,
      ).length;
    } else {
      current = state.mentorships.filter(
        (item) =>
          item.mentorId === employeeId &&
          item.closedAt >= challenge.acceptedAt &&
          item.closedAt <= challenge.deadline &&
          item.closedAt <= dataset.meta.asOfDate,
      ).length;
    }
    return {
      challenge,
      current,
      target: challenge.target,
      completed: current >= challenge.target,
    };
  });
}
