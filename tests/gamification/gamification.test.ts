import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { importCareerQuestDataset } from "@/domain/data";
import * as gamification from "@/domain/gamification";
import {
  acceptChallenge,
  aggregateGamification,
  balanceForViewer,
  challengeProgress,
  deadlineFrom,
  earnedPoints,
  emptyGamificationState,
  loadGamificationRules,
  loadRewards,
  proposeChallenges,
  recordMentorship,
  recordThanks,
  redeemReward,
  RecognitionError,
  RedemptionError,
  setOptedOut,
  type GamificationRules,
  type GamificationState,
  type Reward,
} from "@/domain/gamification";
import { recommendForEmployee } from "@/domain/recommendation";
import type { NormalizedDataset } from "@/lib/contracts";

const read = (...segments: string[]) => readFile(path.join(process.cwd(), ...segments), "utf8");

let dataset: NormalizedDataset;
let rules: GamificationRules;
let rewards: Reward[];
const SNAPSHOT = "2026-10-01";

async function buildDataset(): Promise<NormalizedDataset> {
  const [employees, events, skills, activityHistoryCsv] = await Promise.all([
    read("data", "source", "employees.json"),
    read("data", "source", "events.json"),
    read("data", "source", "skills.json"),
    read("data", "source", "activity_history.csv"),
  ]);
  return importCareerQuestDataset({ employees, events, skills, activityHistoryCsv });
}

beforeAll(async () => {
  dataset = await buildDataset();
  rules = loadGamificationRules(JSON.parse(await read("data", "gamification_rules.json")));
  rewards = loadRewards(JSON.parse(await read("data", "rewards.json")));
});

describe("начисление", () => {
  it("за обязательные события не начисляет ничего", () => {
    const mandatory = Object.values(dataset.eventsById).filter((event) => event.mandatory);
    expect(mandatory.length).toBeGreaterThan(0);
    const mandatoryIds = new Set(mandatory.map((event) => event.id));

    const employeeId = Object.keys(dataset.employeesById).find((id) =>
      (dataset.historyByEmployeeId[id] ?? []).some(
        (record) => record.status === "completed" && mandatoryIds.has(record.eventId),
      ),
    )!;
    const result = earnedPoints({ dataset, employeeId, rules });
    expect(result.skippedMandatory).toBeGreaterThan(0);
    for (const entry of result.entries) {
      expect(entry.id.startsWith("activity:")).toBe(true);
    }
    const activityIds = new Set(
      (dataset.historyByEmployeeId[employeeId] ?? [])
        .filter((record) => record.status === "completed")
        .map((record) => record.eventId),
    );
    expect([...activityIds].some((id) => mandatoryIds.has(id))).toBe(true);
    expect(result.entries.length).toBeLessThan(activityIds.size + result.skippedMandatory + 1);
  });

  it("критичный навык даёт множитель, указанный в правилах", () => {
    const result = earnedPoints({ dataset, employeeId: "E0028", rules });
    const critical = result.entries.find((entry) =>
      entry.facts.some((fact) => fact.code === "critical_skill"),
    );
    expect(critical).toBeDefined();
    expect(critical!.points).toBe(rules.activity.base * rules.activity.criticalMultiplier);
  });

  it("активность вне требований цели начисляет по пониженному коэффициенту", () => {
    const result = earnedPoints({ dataset, employeeId: "E0028", rules });
    const offTarget = result.entries.find(
      (entry) => entry.points === rules.activity.base * rules.activity.offTargetFactor,
    );
    expect(offTarget).toBeDefined();
  });

  it("квитанция раскладывает начисление на факты", () => {
    const result = earnedPoints({ dataset, employeeId: "E0028", rules });
    const codes = result.entries[0].facts.map((fact) => fact.code);
    expect(codes).toEqual(
      expect.arrayContaining(["activity", "completed_at", "base", "critical_multiplier", "relevance"]),
    );
    expect(result.rulesVersion).toBe("rules-v1");
  });

  it("работает без Skill Exchange: менторских начислений просто нет", () => {
    const result = earnedPoints({ dataset, employeeId: "E0028", rules });
    expect(result.entries.every((entry) => entry.kind === "activity")).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });

  it("повторный импорт того же набора воспроизводит баланс", async () => {
    const again = await buildDataset();
    expect(earnedPoints({ dataset: again, employeeId: "E0028", rules }).total).toBe(
      earnedPoints({ dataset, employeeId: "E0028", rules }).total,
    );
  });
});

describe("изоляция от движка", () => {
  it("рекомендации не меняются от состояния геймификации", () => {
    const before = JSON.stringify(recommendForEmployee(dataset, "E0028"));
    let state: GamificationState = emptyGamificationState;
    state = recordMentorship(state, { id: "m1", threadId: "t1", mentorId: "E0028", closedAt: SNAPSHOT });
    state = recordThanks(state, {
      threadId: "t1",
      fromEmployeeId: "E0001",
      toEmployeeId: "E0028",
      at: SNAPSHOT,
    });
    const balance = balanceForViewer({ dataset, employeeId: "E0028", state, rules });
    expect(balance.balance).toBeGreaterThan(0);
    expect(JSON.stringify(recommendForEmployee(dataset, "E0028"))).toBe(before);
  });
});

describe("трата", () => {
  const base = { employeeId: "E0028", rewardId: "RW_MENTOR_HOUR", at: SNAPSHOT };

  it("повторное списание с тем же requestId не применяется дважды", () => {
    const first = redeemReward({ ...base, state: emptyGamificationState, rewards, balance: 500, requestId: "r1" });
    expect(first.alreadyApplied).toBe(false);
    const second = redeemReward({ ...base, state: first.state, rewards, balance: 500, requestId: "r1" });
    expect(second.alreadyApplied).toBe(true);
    expect(second.state.redemptions).toHaveLength(1);
  });

  it("баланс не уходит в минус", () => {
    expect(() =>
      redeemReward({ ...base, state: emptyGamificationState, rewards, balance: 10, requestId: "r2" }),
    ).toThrow(RedemptionError);
  });

  it("неизвестная награда отклоняется", () => {
    expect(() =>
      redeemReward({
        ...base,
        rewardId: "RW_NOPE",
        state: emptyGamificationState,
        rewards,
        balance: 999,
        requestId: "r3",
      }),
    ).toThrow(/Неизвестная награда/);
  });

  it("списание хранит баланс до и после", () => {
    const { redemption } = redeemReward({
      ...base,
      state: emptyGamificationState,
      rewards,
      balance: 100,
      requestId: "r4",
    });
    expect(redemption.balanceBefore).toBe(100);
    expect(redemption.balanceAfter).toBe(100 - redemption.cost);
  });
});

describe("признание", () => {
  it("благодарность самому себе невозможна", () => {
    expect(() =>
      recordThanks(emptyGamificationState, {
        threadId: "t1",
        fromEmployeeId: "E0028",
        toEmployeeId: "E0028",
        at: SNAPSHOT,
      }),
    ).toThrow(RecognitionError);
  });

  it("на один тред засчитывается одна благодарность", () => {
    const once = recordThanks(emptyGamificationState, {
      threadId: "t1",
      fromEmployeeId: "E0001",
      toEmployeeId: "E0028",
      at: SNAPSHOT,
    });
    expect(() =>
      recordThanks(once, {
        threadId: "t1",
        fromEmployeeId: "E0001",
        toEmployeeId: "E0028",
        at: SNAPSHOT,
      }),
    ).toThrow(/уже отправлена/);
  });

  it("потолок благодарностей ограничивает начисление", () => {
    let state: GamificationState = emptyGamificationState;
    for (let index = 0; index < rules.mentorship.thanksPerPeriodCap + 4; index += 1) {
      state = recordThanks(state, {
        threadId: `t${index}`,
        fromEmployeeId: "E0001",
        toEmployeeId: "E0028",
        at: SNAPSHOT,
      });
    }
    const thanksEntries = earnedPoints({ dataset, employeeId: "E0028", state, rules }).entries.filter(
      (entry) => entry.kind === "thanks",
    );
    expect(thanksEntries).toHaveLength(rules.mentorship.thanksPerPeriodCap);
  });
});

describe("личные вызовы", () => {
  it("срок считается от даты среза, а не от системных часов", () => {
    expect(deadlineFrom(SNAPSHOT, 90)).toBe("2026-12-30");
    const state = acceptChallenge(
      emptyGamificationState,
      "E0028",
      proposeChallenges(dataset, "E0028", rules)[0],
      SNAPSHOT,
      rules,
    );
    expect(state.challenges[0].deadline).toBe(deadlineFrom(SNAPSHOT, rules.challenge.windowDays));
  });

  it("предлагает закрыть критичный разрыв и выводит прогресс из фактов", () => {
    const proposals = proposeChallenges(dataset, "E0028", rules);
    expect(proposals[0].kind).toBe("close_critical_gap");
    const state = acceptChallenge(emptyGamificationState, "E0028", proposals[0], SNAPSHOT, rules);
    const progress = challengeProgress(dataset, "E0028", state);
    expect(progress[0].current).toBeLessThan(progress[0].target);
    expect(progress[0].completed).toBe(false);
  });

  it("повторное принятие того же вызова ничего не дублирует", () => {
    const proposal = proposeChallenges(dataset, "E0028", rules)[0];
    const once = acceptChallenge(emptyGamificationState, "E0028", proposal, SNAPSHOT, rules);
    const twice = acceptChallenge(once, "E0028", proposal, SNAPSHOT, rules);
    expect(twice.challenges).toHaveLength(1);
  });
});

describe("приватность", () => {
  it("в модуле нет функции, возвращающей чужие или все балансы", () => {
    const forbidden = /leaderboard|ranking|allbalances|balances|topemployees/i;
    expect(Object.keys(gamification).filter((name) => forbidden.test(name))).toEqual([]);
  });

  it("агрегат для HR не содержит ни одного идентификатора сотрудника", () => {
    let state = redeemReward({
      state: emptyGamificationState,
      employeeId: "E0028",
      rewardId: "RW_MENTOR_HOUR",
      rewards,
      balance: 500,
      at: SNAPSHOT,
      requestId: "r9",
    }).state;
    state = acceptChallenge(state, "E0001", proposeChallenges(dataset, "E0001", rules)[0], SNAPSHOT, rules);
    const aggregate = aggregateGamification(state, rewards);
    expect(JSON.stringify(aggregate)).not.toMatch(/E0\d{3}/);
    expect(aggregate.participants).toBe(2);
  });

  it("отказ от геймификации исключает сотрудника из агрегатов", () => {
    let state = redeemReward({
      state: emptyGamificationState,
      employeeId: "E0028",
      rewardId: "RW_MENTOR_HOUR",
      rewards,
      balance: 500,
      at: SNAPSHOT,
      requestId: "r10",
    }).state;
    state = setOptedOut(state, "E0028", true);
    const aggregate = aggregateGamification(state, rewards);
    expect(aggregate.redemptionsTotal).toBe(0);
    expect(aggregate.optedOutCount).toBe(1);
  });
});
