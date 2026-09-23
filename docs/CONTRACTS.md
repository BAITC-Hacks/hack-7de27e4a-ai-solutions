# Общие контракты

> **Источник правды — код:** `src/lib/contracts/` (владелец — поток A, Алихан).
> Этот файл описывает, что там уже есть, и фиксирует то, чего ещё нет, чтобы B и C не
> изобрели несовместимые типы. **Контракты заморожены после 00:20.** Любое изменение —
> сначала сообщение в командный чат и запись в `docs/DECISIONS.md`, только потом commit.

> **Актуально на 2026-09-23 (решения 18–19):** Employee/HR/Trust используют
> `sharedEmployeeStore` под signed demo identity. Demo Employee получает с сервера
> только свой профиль/историю; HR — полный bundled dataset для аналитики.
> Demo snapshots и отдельный ledger импорта — in-memory, переписка `/chat` — server JSON;
> личные треды доступны только участникам, HR summary содержит только счётчики.
> Общие типы чата — `src/server/messaging/types.ts`. Demo persona не является SSO.
> Текущий UI вызывает `/api/ai/explain`:
> `ReviewRequest` из `src/lib/evaluation/ai-contracts.ts` содержит `language` и
> `candidates` с ID и структурированными числовыми facts. Описанный ниже `AIReviewRequest`
> относится только к сохранённому `/api/ai/review` и не взаимозаменяем с ним.
> `/api/ai/review` разрешён для собственного профиля или HR. Private Employee projection
> применяется сервером; IndexedDB не подключён к активным страницам. См. `INTEGRATION.md`.

> Дополнения PR #10/#11 (`main f287b406`) используют `src/domain/external` и
> `src/domain/data/judge-import.ts`; общие recommendation-контракты и scoring не меняются.
> Внешние курсы не являются внутренними рекомендациями или подтверждёнными completion;
> частичный импорт проходит общую валидацию A и сохраняет границу текущего доступа.

> Дополнение `main 0d068536`: `src/domain/gamification` читает normalized dataset/ledger,
> не меняя recommendation-контракты. `/api/ai/agent` использует собственный контракт
> `src/lib/evaluation/agent-contracts.ts`, требует signed HR role и работает с шестью
> read-only tools. Его projected facts нельзя считать server-reconstructed evidence
> из `/api/ai/review`. Ограничения и проверка — `REQUIREMENTS_AUDIT.md`.

## 0. Статус на момент написания

| Блок | Файл | Статус |
|---|---|---|
| Dataset-типы, `NormalizedDataset`, `ValidationIssue` | `src/lib/contracts/dataset.ts` | ✅ есть |
| Recommendation, Evidence, FactorScores | `src/lib/contracts/recommendation.ts` | ✅ есть |
| Simulation, Ledger, Planner | `src/domain/simulation`, `src/state/progress-ledger.ts` | ✅ есть |
| AIReview, Verifier, Trust-метрики | `src/lib/evaluation`, `src/state/ai-review.ts` | ✅ есть |
| Demo identity, mentorship, messages | `src/lib/identity`, `src/domain/mentorship`, `src/server/messaging/types.ts` | ✅ есть |

Импорт всегда через алиас: `import type { ... } from "@/lib/contracts";`

## 1. Публичный API потока A (то, что вызывают B и C)

```ts
// src/domain/data
importCareerQuestDataset(files: CareerQuestFiles): NormalizedDataset

// src/domain/recommendation
recommendForEmployee(
  dataset: NormalizedDataset,
  employeeId: string,
  limit = 3,
): RecommendationResult

recommend(dataset, employeeId, limit = 3): RecommendationResult // стабильный adapter alias

buildEffectiveEmployeeProfile(dataset, employeeId): EffectiveEmployeeProfile
resolveTarget(dataset, effectiveProfile): TargetResolution | null
analyzeGaps(effectiveProfile, target): GapAnalysis
evaluateEligibility(dataset, effectiveProfile, gapAnalysis, event): EligibilityResult

SCORE_WEIGHTS   // { targetGapImpact .45, engagementFit .20, feasibility .15, goalAlignment .10, pathDiversity .10 }
ENGINE_VERSION  // "career-quest-engine/1.0.0"
```

Все функции **чистые**. Никаких обращений к сети, `Date.now()` и глобального состояния:
одинаковый вход → одинаковый выход. На этом держится и тестируемость, и Trust Center.

`CareerQuestFiles` принимает и распарсенный объект, и строку — UI может отдать сырой текст файла:

```ts
interface CareerQuestFiles {
  employees: unknown | string;
  events: unknown | string;
  skills: unknown | string;
  activityHistoryCsv: string;   // всегда строка CSV
}
```

## 2. Ключевые структуры

```ts
interface RecommendationResult {
  employeeId: string;
  effectiveProfile: EffectiveEmployeeProfile;   // + replayEvidence: откуда взялись effective-уровни
  gapAnalysis: GapAnalysis;                     // target может быть null (честный abstain)
  recommendations: Recommendation[];            // 0..3
  excluded: ExcludedCandidate[];                // почему остальные не прошли -> "Почему не альтернатива?"
  consideredCandidates: number;
  engineVersion: string;
}

interface Recommendation {
  activityId: string;
  title: string;
  rank: number;
  baseScore: number;
  totalScore: number;            // после diversity-штрафа
  projectedReadiness: number;    // readiness ПОСЛЕ выполнения
  factorScores: FactorScores;    // каждый в 0..1
  factorContributions: FactorScores; // score × weight, сумма = baseScore
  effectiveGains: Record<string, number>;
  evidenceReceipt: EvidenceReceipt;
  deterministicExplanation: string;   // работает без LLM
}

interface EvidenceReceipt {
  engineVersion: string;
  targetRole: string;
  targetGrade: Grade;
  scoringWeights: FactorScores;
  factorScores: FactorScores;
  factorContributions: FactorScores;
  evidence: EvidenceItem[];
  diversityPenalty: number;
}

interface FactorScores {
  targetGapImpact: number; engagementFit: number; feasibility: number;
  goalAlignment: number;   pathDiversity: number;
}

type IneligibilityReason =
  | "MANDATORY_EVENT" | "ROLE_MISMATCH" | "GRADE_MISMATCH"
  | "PREREQUISITES_NOT_MET" | "ALREADY_COMPLETED" | "ALREADY_IN_PROGRESS"
  | "NO_UPCOMING_SESSION" | "NO_TARGET_GAP_IMPACT";
```

`GapAnalysis.target === null` — это **не ошибка**, а честный «цели нет» (Lead без
`career_goal`). UI обязан показать нормальный empty state, а не краш.

`excluded[]` — не мусор, а продукт: именно из него делается кнопка «Почему не альтернатива?».

## 3. Контракты B и C

**B — simulation / ledger** (ранний эскиз; актуальные типы — в `src/state/intelligenceAdapter.ts`
и `src/domain/simulation`, ledger активного UI — в `employeeStore.ts`):

```ts
interface LedgerEvent {
  id: string; employeeId: string; activityId: string;
  before: Record<string, number>; delta: Record<string, number>; after: Record<string, number>;
  readinessBefore: number; readinessAfter: number; at: string;
}
interface SimulationResult {
  effectiveSkillsAfter: Record<string, number>;
  readinessBefore: number; readinessAfter: number;
  closedGaps: string[]; remainingCriticalGaps: string[];
}
interface PathStep { activityId: string; simulation: SimulationResult; }
interface CareerPath { strategy: "fastest" | "balanced" | "stretch"; steps: PathStep[]; readinessAfter: number; }
```

**C — AI review** (сохранённый IDs-only `/api/ai/review`):

```ts
interface AIReview {
  selectedCandidateIds: string[];
  reasons: { candidateId: string; evidenceIds: string[] }[]; // model output: IDs only
}
type VerifierStatus = "verified" | "blocked" | "timeout" | "no_key";
interface AIExplanationResult {
  status: VerifierStatus;
  language: "kk" | "ru" | "en";
  text: string;                 // при любом status — валидный текст (fallback)
  blockedReasons?: string[];
  latencyMs?: number;
}

// Browser -> server. Evidence text с клиента не принимается.
interface AIReviewRequest {
  employeeId: string;
  language: "kk" | "ru" | "en";
  candidateIds: string[];       // 1..3 из текущего deterministic shortlist
  completedActivityIds: string[]; // 0..32; сервер повторно проверяет eligibility/order
}
```

## 4. Правила, которые нельзя нарушать

1. **UI не копирует бизнес-логику.** Компоненты берут числа из `evidence` и
   `SimulationResult`, а не считают их сами. Дублирование скоринга во фронте = P0-дефект.
2. **Один активный `NormalizedDataset` в общей сессии.** Employee, HR и Trust читают
   `sharedEmployeeStore` под AppProviders; `/` и `/demo` ведут на `/employee`.
   Сервер ограничивает demo dataset ролью identity; импорт не смешивается с demo ledger.
3. **Симуляция не мутирует загруженные объекты.** Только новое состояние + ledger.
4. **Уровни всегда `0..5`, факторы всегда `0..1`.**
5. **Никаких hardcoded `E0028` / `EV_006`** в продуктовом коде — только в тестах и в отдельном
   демо-фикстуре.
6. **В LLM уходит только ограниченный evidence-allowlist.** `/api/ai/review` восстанавливает
   его сервером по ID; `/api/ai/explain` проверяет структурированные числовые facts от UI.
   Raw-профиль, полная история и произвольные описания не передаются.
7. **Один adapter между UI и ядром.** B вызывает A через единственный `intelligenceAdapter`,
   чтобы моки снимались одной правкой на интеграции в 02:20.

## 5. Порядок изменения контракта

```
заметил проблему -> пишешь в командный чат ДО правки
                 -> правит владелец файла (A для core, B для simulation, C для AI)
                 -> запись в docs/DECISIONS.md одной строкой
                 -> commit -> сообщение "контракт обновлён, сделайте pull"
```

Молчаливая правка общего типа — главная причина merge-ада в последний час.
