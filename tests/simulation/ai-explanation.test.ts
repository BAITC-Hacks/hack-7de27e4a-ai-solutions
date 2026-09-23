import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AIExplanationResult,
  ReviewRequest,
} from "@/lib/evaluation/ai-contracts";
import { deterministicReasons } from "@/lib/evaluation/explanations";
import type { Recommendation } from "@/state/intelligenceAdapter";
import {
  employeeReviewRequest,
  recommendationExplanation,
  startEmployeeExplanation,
} from "@/components/employee/ai-explanation";

const recommendation = (activityId: string): Recommendation => ({
  activityId,
  rank: 1,
  totalScore: 0.8,
  projectedReadiness: 0.9,
  factorScores: {
    targetGapImpact: 0.8,
    engagementFit: 0.6,
    feasibility: 1,
    goalAlignment: 0.7,
    pathDiversity: 0.9,
  },
  evidence: [{ id: "private", label: "Raw history", value: "private history" }],
  expectedGains: { SK_PRIVATE: 2 },
  deterministicExplanation: "Детерминированное объяснение движка",
});

function responseFor(
  request: ReviewRequest,
  status: AIExplanationResult["status"] = "verified",
) {
  const reasons = deterministicReasons(request);
  return {
    status,
    language: request.language,
    candidateIds: reasons.map((r) => r.candidateId),
    reasons,
    text: "ignored server prose",
  };
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
});

describe("Employee optional AI explanation integration", () => {
  it("uses the selected UI language and never displays a verified response from the previous language", async () => {
    const rec = recommendation("EV_A");
    const currentRequest = employeeReviewRequest([rec], "en");
    const priorResponse = responseFor(employeeReviewRequest([rec], "kk"));
    const englishFallback =
      "Relevant skills, participation and feasibility support this step.";
    expect(
      recommendationExplanation(rec, priorResponse, englishFallback, "en"),
    ).toBe(englishFallback);
    expect(recommendationExplanation(rec, null, englishFallback, "en")).toBe(
      englishFallback,
    );
    const receive = vi.fn();
    cleanups.push(
      startEmployeeExplanation(currentRequest, receive, async (_url, init) => {
        expect(JSON.parse(String(init?.body)).language).toBe("en");
        return Response.json(priorResponse);
      }),
    );
    await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
    expect(receive.mock.calls[0][0].status).toBe("blocked");
    expect(
      recommendationExplanation(
        rec,
        receive.mock.calls[0][0],
        englishFallback,
        "en",
      ),
    ).toBe(englishFallback);
    const current = responseFor(currentRequest);
    expect(recommendationExplanation(rec, current, englishFallback, "en")).toBe(
      current.reasons[0].explanation,
    );
  });
  it("sends only numeric evidence for the displayed top three in unchanged order", async () => {
    const recommendations = ["EV_B", "EV_A", "EV_C", "EV_D"].map(
      recommendation,
    );
    const request = employeeReviewRequest(recommendations, "kk");
    const receive = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const sent = JSON.parse(String(init?.body));
      expect(Object.keys(sent)).toEqual(["language", "candidates"]);
      expect(
        sent.candidates.map((candidate: { id: string }) => candidate.id),
      ).toEqual(["EV_B", "EV_A", "EV_C"]);
      expect(
        sent.candidates.every(
          (candidate: { facts: { kind: string }[] }) =>
            candidate.facts.length === 5 &&
            candidate.facts.every((fact) => fact.kind === "score"),
        ),
      ).toBe(true);
      expect(String(init?.body)).not.toMatch(
        /private|history|employee|description|SK_PRIVATE|EV_D/i,
      );
      return Response.json(responseFor(request));
    });
    expect(recommendationExplanation(recommendations[0], null)).toBe(
      recommendations[0].deterministicExplanation,
    );
    cleanups.push(startEmployeeExplanation(request, receive, fetcher));
    await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
    const result = receive.mock.calls[0][0] as AIExplanationResult;
    expect(result.status).toBe("verified");
    expect(result.candidateIds).toEqual(["EV_B", "EV_A", "EV_C"]);
    expect(recommendationExplanation(recommendations[1], result)).toBe(
      result.reasons.find((reason) => reason.candidateId === "EV_A")!
        .explanation,
    );
    expect(recommendations.map((rec) => rec.activityId)).toEqual([
      "EV_B",
      "EV_A",
      "EV_C",
      "EV_D",
    ]);
  });

  it.each(["unknown ID", "changed number"])(
    "rejects %s from the route and retains the engine explanation",
    async (tamper) => {
      const rec = recommendation("EV_A");
      const request = employeeReviewRequest([rec], "ru");
      const body = responseFor(request);
      if (tamper === "unknown ID") body.candidateIds = ["EV_INVENTED"];
      else
        body.reasons[0].explanation = body.reasons[0].explanation.replace(
          "0.8",
          "5",
        );
      const receive = vi.fn();
      cleanups.push(
        startEmployeeExplanation(request, receive, async () =>
          Response.json(body),
        ),
      );
      await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
      const result = receive.mock.calls[0][0] as AIExplanationResult;
      expect(result.status).toBe("blocked");
      expect(result.candidateIds).toEqual([rec.activityId]);
      expect(recommendationExplanation(rec, result)).toBe(
        rec.deterministicExplanation,
      );
    },
  );

  it("handles a missing API key and network outage without changing recommendation text", async () => {
    const rec = recommendation("EV_A");
    const request = employeeReviewRequest([rec], "en");
    const noKey = vi.fn();
    const outage = vi.fn();
    cleanups.push(
      startEmployeeExplanation(request, noKey, async () =>
        Response.json(responseFor(request, "no_key")),
      ),
    );
    cleanups.push(
      startEmployeeExplanation(request, outage, async () => {
        throw new Error("offline");
      }),
    );
    await vi.waitFor(() => {
      expect(noKey).toHaveBeenCalledOnce();
      expect(outage).toHaveBeenCalledOnce();
    });
    expect(noKey.mock.calls[0][0].status).toBe("no_key");
    expect(outage.mock.calls[0][0].status).toBe("blocked");
    expect(recommendationExplanation(rec, noKey.mock.calls[0][0])).toBe(
      rec.deterministicExplanation,
    );
    expect(recommendationExplanation(rec, outage.mock.calls[0][0])).toBe(
      rec.deterministicExplanation,
    );
  });

  it("aborts and ignores a late old response when profile, import, or completion replaces the context", async () => {
    const first = employeeReviewRequest([recommendation("EV_OLD")], "ru");
    const second = employeeReviewRequest([recommendation("EV_NEW")], "kk");
    let finishOld!: (response: Response) => void;
    let signal: AbortSignal | null | undefined;
    const oldReceive = vi.fn();
    const newReceive = vi.fn();
    const cancel = startEmployeeExplanation(
      first,
      oldReceive,
      async (_url, init) => {
        signal = init?.signal;
        // Deliberately ignores abort to model a response already in transit.
        return new Promise<Response>((resolve) => {
          finishOld = resolve;
        });
      },
    );
    cancel();
    expect(signal!.aborted).toBe(true);
    cleanups.push(
      startEmployeeExplanation(second, newReceive, async () =>
        Response.json(responseFor(second)),
      ),
    );
    finishOld(Response.json(responseFor(first)));
    await vi.waitFor(() => expect(newReceive).toHaveBeenCalledOnce());
    expect(oldReceive).not.toHaveBeenCalled();
    expect(newReceive.mock.calls[0][0].candidateIds).toEqual(["EV_NEW"]);
  });

  it("falls back after the client timeout with the original ranking", async () => {
    vi.useFakeTimers();
    const request = employeeReviewRequest([recommendation("EV_A")], "ru");
    const receive = vi.fn();
    cleanups.push(
      startEmployeeExplanation(
        request,
        receive,
        async (_url, init) =>
          new Promise((_resolve, reject) => {
            init!.signal!.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            );
          }),
      ),
    );
    await vi.advanceTimersByTimeAsync(10000);
    expect(receive).toHaveBeenCalledOnce();
    expect(receive.mock.calls[0][0].status).toBe("timeout");
    expect(receive.mock.calls[0][0].candidateIds).toEqual(["EV_A"]);
  });
});
