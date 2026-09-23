import { FACTORS, reviewRequestSchema, type CandidateEvidence, type EvidenceFact, type Factor, type Language, type ReviewRequest } from './ai-contracts';

const labels: Record<Language, Record<Factor, string>> = {
  ru: { targetGapImpact: 'Вклад в закрытие дефицита навыков', engagementFit: 'Соответствие истории участия', feasibility: 'Выполнимость', goalAlignment: 'Соответствие карьерной цели', pathDiversity: 'Разнообразие траектории' },
  kk: { targetGapImpact: 'Дағды тапшылығын азайту', engagementFit: 'Қатысу тарихына сәйкестік', feasibility: 'Орындалу мүмкіндігі', goalAlignment: 'Мансап мақсатына сәйкестік', pathDiversity: 'Даму жолының әртүрлілігі' },
  en: { targetGapImpact: 'Target gap impact', engagementFit: 'Engagement fit', feasibility: 'Feasibility', goalAlignment: 'Goal alignment', pathDiversity: 'Path diversity' },
};
const number = (n: number) => String(Math.round(n * 10000) / 10000);
/** Only known templates render facts; neither dataset descriptions nor model prose is executed/displayed. */
export function renderFact(fact: EvidenceFact, language: Language): string {
  const label = labels[language][fact.factor];
  if (fact.kind === 'score') return `${label}: ${number(fact.value)} / 1.`;
  if (fact.kind === 'readiness') {
    const term = { ru: 'Готовность', kk: 'Дайындық', en: 'Readiness' }[language];
    return `${label}. ${term}: ${number(fact.before * 100)}% → ${number(fact.after * 100)}%.`;
  }
  const words = {
    ru: ['уровень', 'требуется', 'прирост', 'максимум активности', 'критичный'],
    kk: ['деңгей', 'қажетті деңгей', 'өсім', 'белсенділік шегі', 'маңызды'],
    en: ['level', 'required', 'gain', 'activity cap', 'critical'],
  }[language];
  return `${label}. ${fact.skillId}: ${words[0]} ${number(fact.current)}, ${words[1]} ${number(fact.required)}, ${words[2]} +${number(fact.gain)}, ${words[3]} ${number(fact.maxLevel)}${fact.critical ? ` (${words[4]})` : ''}.`;
}
export function renderExplanation(candidate: CandidateEvidence, evidenceIds: readonly string[], language: Language): string {
  return evidenceIds.map(id => {
    const fact = candidate.facts.find(f => f.id === id);
    if (!fact) throw new Error('Unknown evidence reference');
    return renderFact(fact, language);
  }).join(' ');
}
export function deterministicReasons(request: ReviewRequest) {
  return request.candidates.slice(0, 3).map(candidate => ({ candidateId: candidate.id, evidenceIds: candidate.facts.map(f => f.id), explanation: renderExplanation(candidate, candidate.facts.map(f => f.id), request.language) }));
}
/** Projection helper strips titles, descriptions, profiles and history before the browser sends anything. */
export function buildReviewRequest(
  recommendations: readonly { activityId: string; factorScores: Record<Factor, number> }[],
  language: Language,
  additionalFacts: Readonly<Record<string, readonly EvidenceFact[]>> = {},
): ReviewRequest {
  return reviewRequestSchema.parse({ language, candidates: recommendations.slice(0, 5).map(rec => ({ id: rec.activityId, facts: [
    ...FACTORS.map(factor => ({ id: `score:${rec.activityId}:${factor}`, factor, kind: 'score' as const, value: rec.factorScores[factor] })),
    ...(additionalFacts[rec.activityId] ?? []),
  ] })) });
}
