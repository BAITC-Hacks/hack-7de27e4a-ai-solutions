import {
  FACTORS,
  type AIExplanationResult,
  type Language,
  type ReviewRequest,
} from "@/lib/evaluation/ai-contracts";
import { requestAIExplanation } from "@/lib/evaluation/client";
import { buildReviewRequest } from "@/lib/evaluation/explanations";
import type { Recommendation } from "@/state/intelligenceAdapter";

/** Only the already ranked top three and their numeric evidence leave the browser. */
export function employeeReviewRequest(
  recommendations: readonly Recommendation[],
  language: Language,
): ReviewRequest {
  return buildReviewRequest(
    recommendations.slice(0, 3).map((recommendation) => ({
      activityId: recommendation.activityId,
      factorScores: Object.fromEntries(
        FACTORS.map((factor) => [factor, recommendation.factorScores[factor]]),
      ) as Record<(typeof FACTORS)[number], number>,
    })),
    language,
  );
}

/** Cancel on profile/import/progress changes, even if a transport ignores AbortSignal. */
export function startEmployeeExplanation(
  request: ReviewRequest,
  receive: (result: AIExplanationResult) => void,
  fetcher: typeof fetch = fetch,
): () => void {
  let active = true;
  const controller = new AbortController();
  const cancellableFetch: typeof fetch = (input, init) =>
    fetcher(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([controller.signal, init.signal])
        : controller.signal,
    });
  void requestAIExplanation(request, cancellableFetch).then((result) => {
    if (active) receive(result);
  });
  return () => {
    active = false;
    controller.abort();
  };
}

export type EmployeeExplanationStatus =
  "deterministic" | "loading" | AIExplanationResult["status"];

export const explanationStatusLabels: Record<
  EmployeeExplanationStatus,
  string
> = {
  deterministic: "Расчёт движка",
  loading: "AI · проверяем объяснение",
  verified: "AI · факты проверены",
  no_key: "Локальное объяснение · без AI",
  timeout: "AI не ответил · расчёт движка",
  blocked: "Резервный режим · расчёт движка",
};

export function explanationStatusLabel(
  status: EmployeeExplanationStatus,
  language: Language,
): string {
  const translated: Record<
    Language,
    Record<EmployeeExplanationStatus, string>
  > = {
    ru: explanationStatusLabels,
    kk: {
      deterministic: "Есептеу нәтижесі",
      loading: "AI · түсіндірме тексерілуде",
      verified: "AI · деректер тексерілді",
      no_key: "Жергілікті түсіндірме · AI-сыз",
      timeout: "AI жауап бермеді · есептеу нәтижесі",
      blocked: "Резервтік режим · есептеу нәтижесі",
    },
    en: {
      deterministic: "Engine calculation",
      loading: "AI · checking explanation",
      verified: "AI · facts verified",
      no_key: "Local explanation · without AI",
      timeout: "AI timed out · engine calculation",
      blocked: "Fallback · engine calculation",
    },
  };
  return translated[language][status];
}

/** Results are matched by stable candidate ID; model output never changes the ranking. */
export function recommendationExplanation(
  recommendation: Recommendation,
  result: AIExplanationResult | null,
  fallback = recommendation.deterministicExplanation,
  language?: Language,
): string {
  return (
    (result?.status === "verified" &&
    (!language || result.language === language)
      ? result.reasons.find(
          (reason) => reason.candidateId === recommendation.activityId,
        )?.explanation
      : null) ?? fallback
  );
}
