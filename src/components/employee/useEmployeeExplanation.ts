"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AIExplanationResult,
  Language,
} from "@/lib/evaluation/ai-contracts";
import type { EmployeeView } from "@/state/intelligenceAdapter";
import {
  employeeReviewRequest,
  startEmployeeExplanation,
  type EmployeeExplanationStatus,
} from "./ai-explanation";

export function useEmployeeExplanation(
  view: EmployeeView | null | undefined,
  language: Language | undefined,
  contextKey: string,
  ready: boolean,
) {
  const context = useMemo(() => {
    if (!ready || !language || !view?.recommendations.length) return null;
    try {
      return {
        key: contextKey,
        request: employeeReviewRequest(view.recommendations, language),
      };
    } catch {
      // A failed optional projection must never hide deterministic recommendations.
      return null;
    }
  }, [view, language, contextKey, ready]);
  const [completed, setCompleted] = useState<{
    context: NonNullable<typeof context>;
    result: AIExplanationResult;
  } | null>(null);

  useEffect(() => {
    if (!context) return;
    return startEmployeeExplanation(context.request, (result) =>
      setCompleted({ context, result }),
    );
  }, [context]);

  // Also hide stale results during render, before the previous effect is cleaned up.
  const result =
    context && completed?.context === context ? completed.result : null;
  const status: EmployeeExplanationStatus =
    result?.status ?? (context ? "loading" : "deterministic");
  return { result, status };
}
