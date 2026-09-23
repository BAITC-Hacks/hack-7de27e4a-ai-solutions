import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import rawRules from "../../data/gamification_rules.json";
import { DevelopmentEconomy } from "@/components/gamification/DevelopmentEconomy";
import {
  acceptChallenge,
  challengeProgress,
  earnedPoints,
  emptyGamificationState,
  loadGamificationRules,
  proposeChallenges,
} from "@/domain/gamification";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { createEmployeeStore } from "@/state/employeeStore";
import {
  createRealIntelligenceAdapter,
  projectDataset,
} from "@/state/realIntelligenceAdapter";
import { loadChallengeDataset } from "../recommendation/test-utils";

const rules = loadGamificationRules(rawRules);

describe("gamification in the active workspace", () => {
  it("counts one confirmed completion once when both normalized history and ledger contain it", () => {
    const dataset = loadChallengeDataset();
    const store = createEmployeeStore(createRealIntelligenceAdapter());
    expect(store.getState().loadDataset(projectDataset(dataset))).toBe(true);
    const employeeId = "E0028";
    store.getState().selectEmployee(employeeId);
    const proposal = proposeChallenges(dataset, employeeId, rules).find(
      (item) => item.kind === "complete_voluntary",
    )!;
    const state = acceptChallenge(
      emptyGamificationState,
      employeeId,
      proposal,
      dataset.meta.asOfDate,
      rules,
    );
    const before = earnedPoints({ dataset, employeeId, rules });
    const activityId =
      store.getState().views[employeeId].recommendations[0].activityId;
    store.getState().previewActivity(activityId);
    expect(store.getState().simulation).not.toBeNull();
    expect(
      store
        .getState()
        .confirmCompletion(store.getState().simulation!.requestId),
    ).toBe(true);
    const snapshot = store.getState();
    const normalized = snapshot.normalizedDataset!;
    expect(
      normalized.history.some(
        (row) => row.id === `session:${snapshot.ledger[0].id}`,
      ),
    ).toBe(true);
    const fromNormalized = earnedPoints({
      dataset: normalized,
      employeeId,
      rules,
    });
    const withLedger = earnedPoints({
      dataset: normalized,
      employeeId,
      ledger: snapshot.ledger,
      rules,
    });
    expect(withLedger.total).toBe(fromNormalized.total);
    expect(withLedger.entries).toHaveLength(before.entries.length + 1);
    expect(
      challengeProgress(normalized, employeeId, state, snapshot.ledger)[0]
        .current,
    ).toBe(1);
    expect(
      earnedPoints({ dataset, employeeId, ledger: snapshot.ledger, rules })
        .total,
    ).toBe(withLedger.total);
  });

  it("counts mentorship challenge progress only inside the accepted window and snapshot", () => {
    const dataset = loadChallengeDataset();
    const employeeId = "E0028";
    const proposal = proposeChallenges(dataset, employeeId, rules).find(
      (item) => item.kind === "mentor_once",
    )!;
    const accepted = acceptChallenge(
      emptyGamificationState,
      employeeId,
      proposal,
      "2026-06-01",
      rules,
    );
    const state = {
      ...accepted,
      mentorships: [
        {
          id: "before",
          threadId: "a",
          mentorId: employeeId,
          closedAt: "2026-05-31",
        },
        {
          id: "during",
          threadId: "b",
          mentorId: employeeId,
          closedAt: "2026-06-10",
        },
        {
          id: "after",
          threadId: "c",
          mentorId: employeeId,
          closedAt: "2026-09-30",
        },
        {
          id: "future",
          threadId: "d",
          mentorId: employeeId,
          closedAt: "2026-12-01",
        },
      ],
    };
    expect(challengeProgress(dataset, employeeId, state)[0].current).toBe(1);
  });

  it.each([
    [
      "ru",
      "Баллы развития",
      "Обменять в демо",
      "Закрыть критичный разрыв",
      "Оплата внешнего курса",
    ],
    [
      "kk",
      "Даму ұпайлары",
      "Демода айырбастау",
      "Маңызды алшақтықты жабу",
      "Сыртқы курс ақысын төлеу",
    ],
    [
      "en",
      "Development points",
      "Redeem in demo",
      "Close a critical gap",
      "External course funding",
    ],
  ] as const)(
    "localizes active rewards, facts and challenges in %s and identifies demo-only redemption",
    (locale, heading, action, challenge, reward) => {
      const dataset = loadChallengeDataset();
      const html = renderToStaticMarkup(
        createElement(I18nProvider, {
          initialLocale: locale,
          children: createElement(DevelopmentEconomy, {
            dataset,
            employeeId: "E0028",
            ledger: [],
          }),
        }),
      );
      expect(html).toContain(heading);
      expect(html).toContain(action);
      expect(html).toContain(challenge);
      expect(html).toContain(reward);
      expect(html).toContain("rules-v1");
      expect(html).not.toMatch(/<details\b[^>]*\sopen(?:=|[\s>])/);
      if (locale !== "ru") {
        expect(html).not.toContain("Базовые баллы");
        expect(html).not.toContain("Закрыть критичный разрыв");
        expect(html).not.toContain("Оплата внешнего курса");
      }
    },
  );
});
