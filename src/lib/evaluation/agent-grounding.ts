import { agentAnswerSchema, agentClaimsSchema, type AgentClaim, type AgentHistoryEntry, type AgentMetric, type AgentStepRequest } from './agent-contracts';

type Language = AgentStepRequest['language'];
const labels: Record<Language, Record<AgentMetric, string>> = {
  ru: { currentLevel: 'Текущий уровень', requiredLevel: 'Целевой уровень', gap: 'Разрыв', criticalGap: 'Критический разрыв', readiness: 'Готовность', projectedReadiness: 'Готовность после симуляции', score: 'Оценка рекомендации', rank: 'Позиция активности в рекомендациях', employeeCount: 'Количество сотрудников', coverage: 'Покрытие', catalogGap: 'Разрыв без покрытия каталогом', gain: 'Прирост навыка', match: 'Соответствие фильтру', roleMatch: 'Соответствие роли', gradeMatch: 'Соответствие грейду', returnedCount: 'Количество показанных результатов', eligibleCount: 'Количество доступных активностей', requiredEmployeeCount: 'Сотрудников с требованием', noTargetCount: 'Количество сотрудников без цели', uncoveredCount: 'Количество без покрытия', coveredCount: 'Количество с покрытием', criticalCount: 'Количество критических разрывов', hasTarget: 'Наличие карьерной цели' },
  kk: { currentLevel: 'Ағымдағы деңгей', requiredLevel: 'Мақсатты деңгей', gap: 'Алшақтық', criticalGap: 'Сыни алшақтық', readiness: 'Дайындық', projectedReadiness: 'Симуляциядан кейінгі дайындық', score: 'Ұсыныс бағасы', rank: 'Іс-шараның ұсыныстағы орны', employeeCount: 'Қызметкерлер саны', coverage: 'Қамту', catalogGap: 'Каталог қамтымаған алшақтық', gain: 'Дағды өсімі', match: 'Сүзгіге сәйкестік', roleMatch: 'Рөлге сәйкестік', gradeMatch: 'Грейдке сәйкестік', returnedCount: 'Көрсетілген нәтижелер саны', eligibleCount: 'Қолжетімді іс-шаралар саны', requiredEmployeeCount: 'Талабы бар қызметкерлер саны', noTargetCount: 'Мақсаты жоқ қызметкерлер саны', uncoveredCount: 'Қамтылмағандар саны', coveredCount: 'Қамтылғандар саны', criticalCount: 'Сыни алшақтықтар саны', hasTarget: 'Мансаптық мақсаттың болуы' },
  en: { currentLevel: 'Current level', requiredLevel: 'Target level', gap: 'Gap', criticalGap: 'Critical gap', readiness: 'Readiness', projectedReadiness: 'Readiness after simulation', score: 'Recommendation score', rank: 'Activity position in recommendations', employeeCount: 'Employee count', coverage: 'Coverage', catalogGap: 'Gap not covered by the catalog', gain: 'Skill gain', match: 'Filter match', roleMatch: 'Role match', gradeMatch: 'Grade match', returnedCount: 'Results shown', eligibleCount: 'Eligible activity count', requiredEmployeeCount: 'Employees with a requirement', noTargetCount: 'Employees without a target', uncoveredCount: 'Uncovered count', coveredCount: 'Covered count', criticalCount: 'Critical gap count', hasTarget: 'Has a career target' },
};

/** Structured assertions must reproduce exact tuples from cited tool results. */
export function verifyGroundedAnswer(input: unknown, history: AgentHistoryEntry[]): { valid: true; claims: AgentClaim[] } | { valid: false; reasons: string[] } {
  const parsed = agentClaimsSchema.safeParse(input);
  if (!parsed.success) return { valid: false, reasons: ['INVALID_ANSWER'] };
  const results = new Map(history.map(entry => [entry.result.evidenceId, entry.result]));
  if (results.size !== history.length) return { valid: false, reasons: ['AMBIGUOUS_EVIDENCE'] };
  const seen = new Set<string>();
  for (const claim of parsed.data.claims) {
    const result = results.get(claim.evidenceId);
    const facts = result?.facts.filter(fact => fact.id === claim.factId) ?? [];
    if (facts.length !== 1) return { valid: false, reasons: ['UNKNOWN_EVIDENCE'] };
    const fact = facts[0];
    if (fact.subjectId !== claim.subjectId || fact.metric !== claim.metric || fact.value !== claim.value || fact.skillId !== claim.skillId || fact.activityId !== claim.activityId) return { valid: false, reasons: ['FACT_MISMATCH'] };
    const key = `${claim.evidenceId}/${claim.factId}`;
    if (seen.has(key)) return { valid: false, reasons: ['DUPLICATE_CLAIM'] };
    seen.add(key);
  }
  return { valid: true, claims: parsed.data.claims };
}

/**
 * Grounded prose checks observable numeric literals, ID-shaped tokens and citations.
 * It cannot establish the meaning of prose, causal assertions, numbers written as words,
 * or bind every sentence's number to its subject. Exact structured claims remain visible
 * as evidence; this mode is deliberately distinct from the strict template verifier.
 */
export function verifyAgentAnswer(input: unknown, history: AgentHistoryEntry[]): { valid: true; claims: AgentClaim[]; text: string } | { valid: false; reasons: string[] } {
  const parsed = agentAnswerSchema.safeParse(input);
  if (!parsed.success) return { valid: false, reasons: ['INVALID_ANSWER'] };
  const structured = verifyGroundedAnswer({ claims: parsed.data.claims }, history);
  if (!structured.valid) return structured;

  const values: number[] = [];
  const ratios: number[] = [];
  const knownIds = new Set<string>();
  const citations = new Set<string>();
  for (const { result } of history) {
    citations.add(result.evidenceId);
    knownIds.add(result.callId);
    for (const fact of result.facts) {
      values.push(fact.value);
      if (['readiness', 'projectedReadiness', 'score', 'coverage'].includes(fact.metric)) ratios.push(fact.value);
      knownIds.add(fact.id);
      knownIds.add(fact.subjectId);
      if (fact.skillId) knownIds.add(fact.skillId);
      if (fact.activityId) knownIds.add(fact.activityId);
      citations.add(`${result.evidenceId}/${fact.id}`);
    }
  }
  let invalidCitation = false;
  let remaining = parsed.data.text.replace(/\btool:\d+[:/][A-Za-z0-9_:/.-]+/g, reference => {
    // Sentence-ending punctuation is not part of a receipt reference.
    const canonical = citations.has(reference) ? reference : reference.replace(/[.:]+$/, '');
    if (!citations.has(canonical)) invalidCitation = true;
    return ' ';
  });
  if (invalidCitation) return { valid: false, reasons: ['UNKNOWN_TEXT_EVIDENCE'] };

  let invalidId = false;
  remaining = remaining.replace(/(?<![\p{L}\p{N}_])[A-Za-z][A-Za-z0-9_-]*/gu, token => {
    if (knownIds.has(token)) return ' ';
    // Imported IDs are not restricted to the original E/EV_/SK_ prefixes.
    if (/[_\d]/.test(token) || /^[A-Z]+(?:-[A-Z]+)+$/.test(token)) { invalidId = true; return ' '; }
    return token;
  });
  if (invalidId) return { valid: false, reasons: ['UNKNOWN_TEXT_ID'] };

  // Do not split an unsupported compound literal into smaller values that happen to be grounded.
  // IDs and receipt numbers have already been consumed. Remaining numerals belong to prose.
  const nonAsciiNumber = [...remaining.matchAll(/\p{N}/gu)].some(match => !/^[0-9]$/.test(match[0]));
  const groupedNumber = [...remaining.matchAll(/[1-9]\d*(?:[.,]\d{3})+(?!\d)/g)].some(match =>
    !/^\s*(?:%|percent(?:age)?\b|per\s+cent\b|процент(?:а|ов)?\b|пайыз(?:ы|ға|ды)?\b)/iu.test(remaining.slice(match.index + match[0].length)));
  if (nonAsciiNumber || groupedNumber || /\d[\s_'’]+\d/u.test(remaining)
    || /\d(?:[.,]\d+)?[eE][-+−]?\d/.test(remaining) || /(?<!\d)[.,]\d/.test(remaining)) {
    return { valid: false, reasons: ['UNSUPPORTED_NUMERIC_NOTATION'] };
  }

  let unsupportedNumber = false;
  // No word boundary: quantities attached to Cyrillic text must also be checked.
  const afterNumbers = remaining.replace(/[-+−]?\d+(?:[.,]\d+)?(?:\s*(%|percent(?:age)?|per\s+cent|процент(?:а|ов)?|пайыз(?:ы|ға|ды)?))?/giu, (token: string, unit: string | undefined) => {
    const literal = token.match(/^[-+−]?\d+(?:[.,]\d+)?/)![0].replace('−', '-').replace(',', '.');
    const value = Number(literal);
    const decimals = Math.min(12, literal.split('.')[1]?.length ?? 0);
    const supported = (unit ? ratios : values).some(source => {
      if (unit) return Math.abs(Number((source * 100).toFixed(decimals)) - value) < 1e-9;
      return Math.abs(source - value) < 1e-9;
    });
    if (!Number.isFinite(value) || !supported) unsupportedNumber = true;
    return ' ';
  });
  if (unsupportedNumber || /\p{N}/u.test(afterNumbers)) return { valid: false, reasons: ['UNSUPPORTED_TEXT_NUMBER'] };
  return { valid: true, claims: structured.claims, text: parsed.data.text };
}

/** Localized labels surround exact numeric data. Labels and names supplied by the model are forbidden. */
export function renderAgentClaims(claims: AgentClaim[], language: Language): string {
  if (!claims.length) return { ru: 'Недостаточно подтверждённых данных для ответа.', kk: 'Жауап беру үшін расталған деректер жеткіліксіз.', en: 'Insufficient verified data to answer.' }[language];
  return claims.map(claim => {
    const identifiers = [claim.subjectId, claim.skillId, claim.activityId].filter(Boolean).join(' · ');
    const isRatio = ['readiness', 'projectedReadiness', 'score', 'coverage'].includes(claim.metric);
    const value = isRatio ? `${Number((claim.value * 100).toFixed(3))}%` : String(claim.value);
    return `${identifiers}: ${labels[language][claim.metric]} — ${value}. [${claim.evidenceId}/${claim.factId}]`;
  }).join('\n');
}

