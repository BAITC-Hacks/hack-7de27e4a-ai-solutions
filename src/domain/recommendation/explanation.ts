import type {
  EffectiveEmployeeProfile,
  GapAnalysis,
  PreferredLanguage,
  ScoredCandidate,
} from "@/lib/contracts";

function topGain(candidate: ScoredCandidate, gapAnalysis: GapAnalysis) {
  return Object.entries(candidate.effectiveGains)
    .map(([skillId, gain]) => ({
      skillId,
      gain,
      gap: gapAnalysis.gaps.find((item) => item.skillId === skillId),
    }))
    .sort((a, b) => Number(b.gap?.critical) - Number(a.gap?.critical) || b.gain - a.gain)[0];
}

export function deterministicExplanation(
  profile: EffectiveEmployeeProfile,
  gapAnalysis: GapAnalysis,
  candidate: ScoredCandidate,
): string {
  const language: PreferredLanguage = profile.employee.preferredLanguage;
  const target = gapAnalysis.target;
  const primary = topGain(candidate, gapAnalysis);
  const current = primary?.gap?.currentLevel ?? 0;
  const required = primary?.gap?.requiredLevel ?? 0;
  const critical = primary?.gap?.critical ?? false;
  const readinessBefore = Math.round(gapAnalysis.readiness * 100);
  const readinessAfter = Math.round(candidate.projectedReadiness * 100);
  const historyPct = Math.round(candidate.factorScores.engagementFit * 100);

  if (language === "kk") {
    return `${candidate.event.title}: ${primary?.skillId ?? "дағды"} деңгейі ${current}, мақсат ${required}${critical ? " және бұл критикалық дағды" : ""}. Іс-шара +${primary?.gain ?? 0} тиімді өсім береді, дайындықты ${readinessBefore}%-дан ${readinessAfter}%-ға өзгертеді. Ұқсас белсенділіктер тарихына сәйкестік ${historyPct}%, формат пен қолжетімділік ескерілді. Мақсат: ${target?.role ?? "-"} ${target?.grade ?? "-"}.`;
  }
  if (language === "en") {
    return `${candidate.event.title}: ${primary?.skillId ?? "skill"} is ${current} versus ${required} required${critical ? " and is critical" : ""}. The activity provides +${primary?.gain ?? 0} effective gain and moves readiness from ${readinessBefore}% to ${readinessAfter}%. Similar-activity history fit is ${historyPct}%; format and availability are included. Target: ${target?.role ?? "-"} ${target?.grade ?? "-"}.`;
  }
  return `${candidate.event.title}: уровень ${primary?.skillId ?? "навыка"} - ${current} при требуемом ${required}${critical ? "; навык критичен" : ""}. Активность дает эффективный прирост +${primary?.gain ?? 0} и меняет готовность с ${readinessBefore}% до ${readinessAfter}%. Соответствие истории похожих активностей - ${historyPct}%; формат и доступность учтены. Цель: ${target?.role ?? "-"} ${target?.grade ?? "-"}.`;
}
