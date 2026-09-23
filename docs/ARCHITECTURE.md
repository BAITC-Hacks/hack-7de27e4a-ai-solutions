# Career Quest — архитектура

> Этот файл Codex читает **первым** в каждой задаче. Он и `docs/CONTRACTS.md` — единая
> техническая модель продукта. Данные — в `docs/DATASET.md`.

> **Актуальная интеграция 2026-09-23, решения 18–19:** UI на RU/KK/EN сохранён;
> `/` и `/demo` → `/employee`, Skill Exchange доступен на `/chat`. `AppProviders`
> связывает `IdentityProvider` и один `sharedEmployeeStore`. Сервер выдаёт Employee
> только его профиль/историю, HR — полный bundled dataset; чужой чат HR получает
> только как агрегаты. Синтетическая demo persona не заменяет SSO.
> Demo snapshots и отдельный ledger импорта живут в памяти и сбрасываются при reload;
> чат и production session-secret сохраняются в исключённом из Git/Docker build context
> `data/runtime`. IndexedDB и прежний XP-модуль не используются активным UI. UI вызывает `/api/ai/explain`
> с числовым evidence; IDs-only `/api/ai/review` разрешён для собственного профиля или HR.
> Точные границы и итог проверки — в [`INTEGRATION.md`](INTEGRATION.md).

> Дополнение из `main f287b406`: PR #10 подключает отдельный offline-каталог внешнего
> обучения без изменения ranking/readiness/ledger; PR #11 — частичный judge import
> с режимами append/replace на текущем доступном normalized dataset. Исторический gate этой версии:
> 268/268 тестов в 32 файлах и production build с полной проверкой TypeScript — PASS.

> `main 0d068536` добавляет активные DevelopmentEconomy, HR participation и HR Agent.
> Economy читает текущий normalized dataset/ledger, mandatory даёт 0; обмен/вызовы/opt-out
> локальны странице и не являются реальной выдачей наград. HR Agent имеет серверный HR guard,
> шесть read-only tools и bounded model loop; participation показывает факты 6/12 месяцев,
> не ML-прогноз увольнения. Текущий общий gate: `REQUIREMENTS_AUDIT.md`.

## 1. Что мы строим

Career Quest — не обёртка над LLM и не набор HR-графиков. Это **проверяемая система принятия
решений**: она вычисляет карьерный разрыв, предлагает следующий лучший шаг и показывает
доказательства каждого решения.

Три тезиса для жюри:

| | |
|---|---|
| **Intelligence** | Многофакторный детерминированный выбор и расчёт траектории, а не один prompt. |
| **Experience** | Digital Twin показывает карьерный эффект **до** выполнения активности. |
| **Trust** | У каждого решения есть Evidence Receipt и автоматическая проверка. |

Одна фраза для README: *Career Quest recommends not the weakest skill, but the next best career move.*

## 2. Стек

| Слой | Выбор | Почему |
|---|---|---|
| Приложение | Next.js (App Router) + TypeScript | Один проект, server route для LLM, сильный UI. |
| UI | React + CSS Modules, SVG/таблицы | Согласованный бело-зелёный интерфейс RU/KK/EN; ранний план Tailwind/shadcn/Recharts не является зависимостью активного UI. |
| Контракты | Zod | Валидация файлов жюри и единый источник типов. |
| CSV | PapaParse | Импорт `activity_history.csv` в браузере. |
| Состояние | Zustand | Датасет, симуляция и progress ledger без БД. |
| Тесты | Vitest (+1 Playwright flow, если останется время) | Проверка engine и главного сценария. |
| Поставка | Docker, один контейнер | Запуск одной командой. |

Пакетный менеджер — **pnpm** (`packageManager` в `package.json`), Node **22**.

**Хранение без SQL.** Импортированный датасет живёт в Zustand, изменения — в локальном
immutable progress ledger. Импортированные исходные файлы остаются в браузере;
ограниченное evidence может передаваться сервису объяснений. Подтверждённый demo-прогресс
восстанавливается из snapshots при выборе персоны в той же вкладке. Перезагрузка сбрасывает
карьерный ledger; переписка Skill Exchange сохраняется отдельно в серверном JSON-файле.

## 3. Карта системы

```
                 employees.json  skills.json  events.json  activity_history.csv
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │  Schema Adapter (Zod)         │  A
                        │  refs, statuses, issue report │
                        └───────────────┬───────────────┘
                                        ▼
                        ┌───────────────────────────────┐
                        │  NormalizedDataset            │  A
                        └───────────────┬───────────────┘
                                        ▼
        ┌──────────────┬────────────────┼────────────────┬──────────────┐
        ▼              ▼                ▼                ▼              │
  History replay   Target resolver   Gap analyzer   Candidate gen       │  A
  (after review)   (goal|next grade) (critical ×2)  (hard filters)      │
        └──────────────┴────────────────┼────────────────┘              │
                                        ▼                               │
                        ┌───────────────────────────────┐               │
                        │  Multi-factor ranker -> top-5 │  A            │
                        │  stable tie-break, diversity  │               │
                        └───────────────┬───────────────┘               │
                                        ▼                               │
                        ┌───────────────────────────────┐               │
                        │  Evidence Receipt             │  A            │
                        └───────┬───────────────┬───────┘               │
                                │               │                       │
              ┌─────────────────┘               └──────────────┐        │
              ▼                                                ▼        ▼
   ┌────────────────────┐                        ┌──────────────────────────┐
   │ Path planner       │ B                      │ Bounded LLM critic       │ C
   │ What-if simulator  │ B                      │ Fact verifier + fallback │ C
   │ Completion ledger  │ B                      └────────────┬─────────────┘
   └─────────┬──────────┘                                     │
             ▼                                                ▼
   ┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
   │ Employee Digital   │ B │ HR Command Center  │ C │ AI Trust Center    │ C
   │ Twin               │   │                    │   │                    │
   └────────────────────┘   └────────────────────┘   └────────────────────┘
```

Единый `NormalizedDataset` + один Zustand store читают **все три** поверхности. Копий датасета
и копий бизнес-логики в UI не существует.

## 4. Recommendation Engine (поток A)

### 4.1 Порядок вычислений

```
import -> validate -> normalize
       -> replay(completed after last_review_date)   => effective_skills
       -> resolveTarget(career_goal | next grade)    => target | null
       -> gaps(target, effective_skills)
       -> hardFilters(events)                        => eligible candidates
       -> score(candidate)                           => top-5
       -> diversityRerank                            => top-3
       -> evidence(top-3)
```

### 4.2 Hard filters (до скоринга, не через веса)

- `mandatory === false`;
- событие соответствует `target_roles` / `target_grades` текущей или целевой траектории;
- `prerequisites` выполнены по **effective** skills;
- событие не завершено ранее (исключение — `EV_036`);
- хотя бы один навык получает **положительный effective gain**;
- для scheduled формата есть `upcoming_session ≥ 2026-10-01`; `self_paced` доступен всегда.

Кандидат, не прошедший фильтр, не должен «вытягиваться» высоким score. Это разные механизмы.

### 4.3 Базовые величины

```
effective_skills   = replay(completed events where date > last_review_date)
gap(skill)         = max(required_at_target - effective_level, 0)
effective_gain(a,s)= max(0, min(effective + gain, max_level, 5) - effective)
critical_weight    = 2.0 if skill in target.critical_skills else 1.0
readiness          = 1 - weighted_remaining_gap / weighted_requirements
```

Уровни всегда остаются в `0..5`. Каждый фактор score нормирован в `0..1`.

### 4.4 Формула ранжирования

| Фактор | Вес | Смысл |
|---|---|---|
| Target gap impact | **45%** | Effective gain по gaps, critical ×2. |
| Engagement fit | **20%** | completed / no_show / dropped / declined / feedback_rating / assigned_by. |
| Feasibility | **15%** | Prerequisites, duration, work_format, ближайшая сессия. |
| Goal alignment | **10%** | Текущая или cross-role career_goal траектория. |
| Path / diversity | **10%** | Сокращение пути и разнообразие итогового top-3. |

Веса лежат в конфиге и версионируются (`weights-v1`). При равенстве — стабильный tie-break по
`event_id`. Для engagement применяется **нейтральный prior**: сотрудник без истории не
штрафуется.

Объяснение обязано опираться минимум на **три** фактора — это прямое требование ТЗ
организаторов, а не наше пожелание.

### 4.5 Evidence Receipt

| Поле | Пример |
|---|---|
| Target | Backend Engineer: Middle → Senior |
| Gap evidence | SK_SYSTEM_DESIGN: effective 3, required 4, critical |
| Impact | effective gain +1, readiness 61% → 74% |
| History | 2 completed похожих, 0 no_show |
| Score | 0.82 = gap 0.49 + history 0.18 + path 0.08 + novelty 0.07 |
| Version | engine-v1, weights-v1, опционально model ID |

Evidence содержит **факты, а не маркетинговый текст**. Текст генерируется поверх них.

## 5. Digital Twin и Path Planner (поток B)

Planner работает поверх тех же детерминированных переходов. Состояние — вектор уровней навыков,
переход — применение активности с учётом `gain`/`max_level`. Beam search: **width 10, depth 4**.

| Стратегия | Целевая функция | Что видит пользователь |
|---|---|---|
| Fastest | минимум шагов до readiness threshold | самый короткий путь к грейду |
| Balanced | gap closure + history fit + diversity | реалистичный план |
| Stretch | максимальный impact при допустимом риске | путь с большей отдачей |

**What-if ничего не сохраняет.** На `confirm`:

1. создать immutable ledger event `{employee_id, activity_id, before, delta, after, ts}`;
2. применить `min(current + gain, max_level, 5)`;
3. пересчитать gaps, readiness, траекторию и top-3;
4. обновить HR-агрегаты из нового состояния;
5. **не модифицировать исходные загруженные объекты**;
6. защита от повторного confirm (идемпотентность).

## 6. Bounded LLM: critic, verifier, fallback (поток C)

Ниже описан сохранённый IDs-only `/api/ai/review`. Активный UI использует
`/api/ai/explain`: принимает ограниченное evidence импортированного набора и проверяет
ответ относительно этих фактов; серверное происхождение фактов не подтверждается.
Для обоих контрактов язык задаётся запросом; активный UI берёт его из общего переключателя.

LLM — **ограниченный критик, а не источник истины**. Браузер передаёт route только
`employeeId`, язык, до трёх `candidate_id` и ограниченный список локальных completion ID.
Сервер валидно переигрывает completion-последовательность, повторно запускает deterministic engine,
восстанавливает Evidence Bundle из доверенного dataset и только затем вызывает модель.
Модель может выбрать ID из allowlist и обязана сослаться на `evidence_id`.

```ts
type AIReview = {
  selectedCandidateIds: string[];
  reasons: { candidateId: string; evidenceIds: string[] }[];
};
```

Verifier **блокирует** ответ, если:

- появился неизвестный `activity_id` или `evidence_id`;
- ответ содержит свободный model-authored prose;
- выбор не опирается минимум на три подтверждённых evidence-факта;
- выход не проходит Zod-схему;
- превышен timeout;
- текст датасета пытается дать модели инструкции (prompt injection).

**Fallback.** Без API-ключа или при любой ошибке пользователь получает **тот же ranking** и
корректное шаблонное объяснение на языке запроса (ru/kk/en). Живое демо не зависит от
внешнего сервиса — это отдельный release gate.

Приватность: из браузера в server route уходят только ID. Raw-профиль, клиентский evidence-текст
и полная история — никогда. Пользовательское объяснение строится сервером из cited evidence;
модель не контролирует prose или числа. Route имеет body cap, rate/concurrency limit и timeout.

## 7. Поверхности продукта

**Employee Digital Twin (B)** — профиль, current/target grade, readiness ring, gaps matrix,
top-3 quest cards с ожидаемым приростом, кнопки «Почему это?» / «Почему не альтернатива?»,
Decision Lab (baseline vs Career Quest), career map, what-if, confirm completion и мгновенный rerank.

**HR Command Center (C)** — heatmap частых grade gaps **без публичного рейтинга людей**,
recommendation coverage, сотрудники без следующего шага, completed/no_show/declined по
активностям, навыки без достаточного каталога, impact preview программ.

**AI Trust Center (C)** — baseline vs multi-factor на adversarial-профилях, eligibility
violations (цель 0), Evidence Receipt completeness (цель 100%), p50/p95 latency,
статус fallback, версии engine/weights/adapter.

## 8. Структура репозитория и владение

```
src/
  app/employee/            # B
  app/hr/                  # C
  app/trust/               # C
  app/api/ai/review/       # C
  components/employee/     # B
  components/hr/           # C
  components/trust/        # C
  domain/data/             # A   importer, schemas, normalize
  domain/recommendation/   # A   gaps, candidates, scoring, evidence
  domain/simulation/       # B   simulator, planner, ledger
  domain/analytics/        # C
  lib/contracts/           # A   общие типы (заморожены после 00:20)
  lib/evaluation/          # C
  state/                   # B
tests/recommendation/      # A
tests/simulation/          # B
tests/evaluation/          # C
data/source/               # датасет организаторов, не редактировать
docs/                      # общая документация
public/demo/               # скриншоты, GIF для README
```

| Поток | Доля | Самостоятельный сложный результат |
|---|---|---|
| **A — Intelligence** (Алихан) | 33.3% | Exact adapter + history replay + multi-factor recommendation + evidence |
| **B — Experience** (Манахнбет) | 33.3% | Digital Twin UI + state + planner + simulation + completion |
| **C — Trust** (Даник) | 33.3% | HR analytics + bounded LLM + verifier + live evaluation + Trust Center |

## 9. Release gates

- Импортирует исходный **и новый проверочный** профиль без hardcoded ID.
- Показывает 1–3 рекомендации минимум по трём факторам с evidence.
- Completion меняет навыки строго по `gain`/`max_level` и запускает rerank.
- Employee, HR и Trust используют один normalized store.
- Режим **без LLM-ключа полностью работоспособен**.
- Главный сценарий проходит три раза подряд без ручного вмешательства.
- Docker поднимается с чистого clone одной командой.
- README за 30 секунд объясняет ценность, запуск и доказательство качества.

**Scope rule:** сначала полный сквозной сценарий, затем Digital Twin и Trust Center.
Бейджи, валюта, OAuth, PostgreSQL и социальные механики в пятичасовой релиз не входят.

## 10. Adversarial-кейсы (минимум)

| Кейс | Ожидание |
|---|---|
| Самый слабый навык не нужен целевому грейду | Побеждает career-critical навык |
| Три no_show по похожим активностям | History fit снижает rank, но не ломает критичный путь |
| Активность упирается в `max_level` | effective gain = 0, кандидат исключён |
| Нет истории | Нейтральный prior, система не падает |
| Ничего не подходит | Честный abstain + HR no-step alert |
| Одинаковые scores | Стабильный tie-break |
| LLM недоступна | Полный deterministic fallback |
| Prompt injection в `description` | Текст остаётся данными, allowlist не нарушен |
| Lead без `career_goal` | Честный «no target» |
| `EV_006` уже завершён (E0028) | Не рекомендуется повторно |

---

Основание: ТЗ HackAlem AI — Career Quest (разделы must-have, ограничения, артефакты, критерии
оценки) + фактический стартовый набор v1.0.
