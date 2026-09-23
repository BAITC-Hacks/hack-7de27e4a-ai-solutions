import type { PreferredLanguage, Recommendation } from "@/lib/contracts";
import type { DatasetSource } from "@/state/career-quest-store";

export type AiReviewStatus = "verified" | "blocked" | "timeout" | "no_key";

export interface AiReviewReason {
  candidateId: string;
  evidenceIds: string[];
  explanation: string;
}

export interface AiReviewResult {
  status: AiReviewStatus;
  language: PreferredLanguage;
  selectedCandidateIds: string[];
  reasons: AiReviewReason[];
  text: string;
  fallbackUsed: boolean;
  blockedReasons?: string[];
  latencyMs?: number;
}

const REVIEW_STATUSES = new Set<AiReviewStatus>([
  "verified",
  "blocked",
  "timeout",
  "no_key",
]);
const REVIEW_LANGUAGES = new Set<PreferredLanguage>(["kk", "ru", "en"]);

function parseReviewResult(value: unknown): AiReviewResult {
  if (!value || typeof value !== "object") throw new Error("AI review returned an invalid payload");
  const result = value as Partial<AiReviewResult>;
  if (
    !result.status ||
    !REVIEW_STATUSES.has(result.status) ||
    !result.language ||
    !REVIEW_LANGUAGES.has(result.language) ||
    !Array.isArray(result.selectedCandidateIds) ||
    !Array.isArray(result.reasons) ||
    typeof result.text !== "string" ||
    typeof result.fallbackUsed !== "boolean"
  ) {
    throw new Error("AI review returned an invalid payload");
  }
  if (
    !result.selectedCandidateIds.every((candidateId) => typeof candidateId === "string") ||
    !result.reasons.every(
      (reason) =>
        reason &&
        typeof reason.candidateId === "string" &&
        Array.isArray(reason.evidenceIds) &&
        reason.evidenceIds.every((evidenceId) => typeof evidenceId === "string") &&
        typeof reason.explanation === "string",
    )
  ) {
    throw new Error("AI review returned an invalid payload");
  }
  return result as AiReviewResult;
}

export async function requestBoundedAiReview(
  employeeId: string,
  recommendations: Recommendation[],
  language: PreferredLanguage,
  completedActivityIds: string[] = [],
  datasetSourceKind: DatasetSource["kind"] = "bundled",
  signal?: AbortSignal,
): Promise<AiReviewResult> {
  if (datasetSourceKind === "imported") {
    throw new Error(
      "External AI review is disabled for browser-import datasets without server provenance",
    );
  }
  const candidates = recommendations.slice(0, 5);
  if (!candidates.length) throw new Error("AI review requires at least one candidate");
  const outboundCandidates = candidates.slice(0, 3);
  const response = await fetch("/api/ai/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      employeeId,
      language,
      candidateIds: outboundCandidates.map((candidate) => candidate.activityId),
      completedActivityIds: completedActivityIds.slice(0, 32),
    }),
    signal,
  });

  if (!response.ok) throw new Error(`AI review is unavailable (${response.status})`);
  const result = parseReviewResult(await response.json());
  const evidenceByCandidate = new Map(
    outboundCandidates.map((candidate) => [
      candidate.activityId,
      new Set(
        candidate.evidenceReceipt.evidence
          .slice(0, 32)
          .map((_item, index) => `${candidate.activityId}:e${index + 1}`),
      ),
    ]),
  );
  if (
    result.selectedCandidateIds.some((candidateId) => !evidenceByCandidate.has(candidateId)) ||
    result.reasons.some(
      (reason) =>
        !evidenceByCandidate.has(reason.candidateId) ||
        reason.evidenceIds.some(
          (evidenceId) => !evidenceByCandidate.get(reason.candidateId)?.has(evidenceId),
        ),
    )
  ) {
    throw new Error("AI review escaped the candidate evidence allowlist");
  }
  return result;
}
