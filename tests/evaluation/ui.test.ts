import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { HrCommandCenter } from "@/components/hr/hr-command-center";
import { TrustCenter } from "@/components/trust/trust-center";
import { useCareerQuestStore } from "@/state/career-quest-store";

import { loadChallengeDataset } from "../recommendation/test-utils";

const dataset = loadChallengeDataset();

beforeEach(() => {
  useCareerQuestStore.setState({
    dataset: null,
    datasetFingerprint: null,
    source: null,
    ledgerHydrationStatus: "idle",
    appliedLedgerEntries: [],
    ignoredLedgerEntries: [],
  });
});

describe("HR and Trust surfaces", () => {
  it("renders organization aggregates without a public employee leaderboard", () => {
    const html = renderToStaticMarkup(
      createElement(HrCommandCenter, { initialDataset: dataset }),
    );

    expect(html).toContain("Где развитию нужна помощь");
    expect(html).toContain("Покрытие следующим шагом");
    expect(html).toContain("Явка и завершение программ");
    expect(html).toContain("Это рабочая очередь, не рейтинг");
    expect(html).not.toContain("Рейтинг сотрудников");
  });

  it("renders deterministic release gates and the no-key operating mode", () => {
    const html = renderToStaticMarkup(
      createElement(TrustCenter, { initialDataset: dataset, modelConfigured: false }),
    );

    expect(html).toContain("Не «поверьте AI»");
    expect(html).toContain("Deterministic fallback active");
    expect(html).toContain("Eligibility violations");
    expect(html).toContain("Deterministic rerun");
    expect(html).toContain("Bounded LLM protocol");
  });

  it("does not label release-gate failures as passing", () => {
    const html = renderToStaticMarkup(
      createElement(TrustCenter, { initialDataset: dataset, modelConfigured: true }),
    );
    const failedGates = html.match(/data-passed="false"/g) ?? [];
    const checkLabels = html.match(/>CHECK</g) ?? [];

    expect(checkLabels).toHaveLength(failedGates.length);
    expect(html).toContain("LLM critic configured");
  });
});
