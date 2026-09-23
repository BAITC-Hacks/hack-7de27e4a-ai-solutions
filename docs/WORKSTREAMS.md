# Codex Workstreams — готовые задания

> Три AI-сессии → управляемая параллельная разработка. Каждый prompt задаёт продуктовый
> результат, ownership и запрет на несогласованные изменения.
> Перед вставкой дополнить актуальным commit SHA.

> **Статус 2026-09-23:** ниже сохранены исходные задания потоков. Текущая интеграция
> определена решением 18 и `docs/INTEGRATION.md`: RU/KK/EN UI, AppProviders/sharedEmployeeStore,
> in-memory ledger, `/` и `/demo` → `/employee`. UI вызывает bounded-evidence
> `/api/ai/explain` на языке общего переключателя; IDs-only `/api/ai/review` сохранён
> отдельным модулем. Указания ниже про endpoint и `preferred_language` относятся к раннему плану.

## 0. Универсальный префикс (в каждую задачу)

```
Ты работаешь над Career Quest в 5-часовом хакатоне.
Сначала прочитай docs/ARCHITECTURE.md, docs/CONTRACTS.md и docs/DATASET.md.
Не меняй файлы вне разрешённых каталогов.
Не добавляй крупные зависимости без необходимости.
Snapshot date датасета — 2026-10-01, используй её как "сегодня"; new Date() в домене запрещён.
Сохраняй детерминированный fallback для LLM.
В конце запусти релевантные tests/build и перечисли изменённые файлы.
```

Обязательная структура ответа Codex:

1. краткий план **до** редактирования;
2. реализация только своей зоны;
3. тесты или проверяемый demo state;
4. команды проверки и **фактический** результат;
5. known limitations, если часть scope не успел.

Что требовать в конце каждой задачи:

- перечислить все изменённые файлы;
- показать выполненные команды tests/build и результат;
- назвать незавершённые пункты **без маскировки**;
- не предлагать новые features после выполнения P0;
- подготовить короткое сообщение двум другим участникам: что импортировать и как вызвать.

---

## A — Intelligence Engine (Алихан) · ветка `feat/alihan-intelligence`

**Каталоги:** `src/domain/data/**`, `src/domain/recommendation/**`, `src/lib/contracts/**`, `tests/recommendation/**`

```
Построй детерминированное Intelligence-ядро на точной схеме dataset v1.0: 200 employees,
60 skills, 40 events, 2743 history rows. Реализуй Zod-схемы для meta, role_profiles,
critical_skills, career_goal, last_review_date, develops_skills, prerequisites,
upcoming_sessions и всех history statuses. Перед ranking сделай replay completed activities
после last_review_date. Target бери из career_goal, иначе next grade; Lead без цели -> честный
no target. Исключай mandatory events, completed events кроме EV_036, невыполненные
prerequisites, events без положительного effective gain и scheduled events без сессии
>= 2026-10-01. Реализуй gap calculation, effective gain, critical-skill weighting (x2),
multi-factor score (impact .45 / engagement .20 / feasibility .15 / goal .10 / path .10),
stable tie-break по event_id, diversity top-3 и EvidenceReceipt. Добавь минимум 7 adversarial
Vitest cases, включая E0028. Не добавляй UI, simulation и LLM.
Definition of Done: файлы из data/source импортируются без ошибок; pure recommendForEmployee
возвращает объяснимый top-3; replay проверен тестами; выход детерминирован.
```

**Code review A:**

- нет hardcoded employee/activity ID вне тестов;
- нет prompt внутри scoring logic;
- каждый фактор score в диапазоне `0..1`, уровни в `0..5`;
- evidence содержит факты, а не маркетинговый текст;
- ошибка импорта указывает файл, поле и строку/объект.

---

## B — Employee Digital Twin (Манахнбет) · ветка `feat/manahnbet-digital-twin`

**Каталоги:** `src/app/employee/**`, `src/components/employee/**`, `src/domain/simulation/**`, `src/state/**`, `tests/simulation/**`

```
Создай Employee Digital Twin и сложную simulation domain-логику. Реализуй Zustand store для
normalized dataset, immutable progress ledger, what-if simulator и beam-search path planner
(width 10, depth 4). Completion применяет gain/max_level и запускает rerank через функции A —
логику скоринга не копируй, вызывай recommendForEmployee через один intelligenceAdapter.
UI: загрузка четырёх реальных файлов с понятными ошибками валидации, выбор сотрудника,
current/target grade, preferred language, readiness ring, gaps matrix, top-3 карточки,
Evidence drawer, "Почему это?" и "Почему не альтернатива?" (из excluded[]), Decision Lab
baseline vs engine, career path, before/after и confirm completion. Покажи активные
in_progress записи и ближайшую upcoming_session. Добавь минимум 6 тестов simulation/store,
responsive UI и все loading/empty/import-error состояния.
Definition of Done: E0028 проходит profile -> recommendation -> what-if -> confirm -> rerank;
HR читает тот же store; UI остаётся сильным без LLM.
```

**Code review B:**

- ценность понятна без чтения README;
- top-1 визуально выделен, но альтернативы доступны;
- числа берутся из evidence и simulation result, а не считаются в компоненте;
- Decision Lab показывает конкретную причинную разницу, а не общий текст;
- confirm имеет явное before/after; повторный confirm не применяется дважды;
- нет публичного leaderboard и давления за обязательные процессы.

---

## C — HR Intelligence и AI Trust (Даник) · ветка `feat/danik-hr-trust`

**Каталоги:** `src/app/hr/**`, `src/app/trust/**`, `src/components/hr/**`, `src/components/trust/**`, `src/domain/analytics/**`, `src/app/api/ai/**`, `src/lib/evaluation/**`, `tests/evaluation/**`

```
Создай analytics domain, HR Command Center и AI Trust Center на dataset v1.0. HR считает
critical gaps, recommendation coverage, сотрудников без следующего шага, статусы истории,
self-vs-assigned engagement (assigned_by: hr 1381 / self 865 / manager 497), activity impact
и навыки без достаточного каталога. Публичных рейтингов сотрудников нет — это прямой запрет ТЗ.
Каждый блок HR содержит operational action, а не только график. Создай weakest-skill baseline
и evaluation harness. Реализуй bounded LLM critic через server route: browser передаёт только
employee/candidate IDs, server восстанавливает evidence, модель возвращает allowlisted IDs,
Zod-выход, verifier, timeout, защита от prompt injection и
детерминированный fallback на ru/kk/en по preferred_language. Trust Center показывает
eligibility violations, Evidence Receipt completeness, history replay correctness, latency p50/p95 и
статус fallback. Добавь минимум 7 тестов, включая injection и LLM outage.
Не меняй scoring и Employee UI.
Definition of Done: обе поверхности читают единый store; outage не влияет на ranking;
неизвестный ID или model-authored prose блокируются; E0028 виден в baseline comparison.
```

**Code review C:**

- HR показывает агрегаты и operational actions, а не только красивые графики;
- Trust-метрики имеют понятные определения и не называют accuracy без labels;
- LLM не получает raw employee history целиком;
- allowlist и schema validator выполняются **после** модели;
- fallback проверяется отключением API key;
- eval fixtures покрывают пример из задания и минимум пять edge cases.

---

## D — Интеграционный поток (после 02:20)

Запускается только после merge A → main, затем B → main, затем C → main.
Разрешено: минимальные glue-файлы, импорты, root scripts, исправление конфликтов.

```
Интегрируй три готовых потока Career Quest без переписывания их внутренней логики.
Сначала прочитай shared contracts и перечисли несовместимости. Подключи Employee UI к
настоящим pure functions ядра через один adapter. Подключи HR и Trust к тому же
NormalizedDataset store. Подключи optional /api/ai/review так, чтобы deterministic
recommendation отрисовывалась ДО результата LLM и оставалась при ошибке. Проверь импорт
challenge fixture, top-3, evidence, what-if, completion, rerank и обновление HR.
Удали только мёртвые моки, не меняй scoring weights и дизайн без необходимости.
Definition of Done: pnpm test и pnpm build успешны; главный сценарий проходит три раза;
режим без API key полноценен.
```

**Порядок диагностики интеграции:**

| Симптом | Проверить первым |
|---|---|
| UI пустой | `NormalizedDataset` adapter и Zustand hydration |
| Top-3 отличается | версию weights, сортировку и tie-break |
| После completion старые данные | ledger reducer и derived selectors |
| HR не обновился | единый store, отсутствие второй копии датасета |
| LLM ломает страницу | timeout, schema parse и fallback branch |
| Build падает | client/server boundaries и импорт Node-only SDK |

---

## E — Red-team перед feature freeze (03:00)

Отдельная короткая сессия. **Код не пишет**, возвращает дефекты по severity.
Исправления остаются у владельцев каталогов.

```
Проведи adversarial review Career Quest как технический судья. Не меняй код. Проверь:
рекомендация по одному фактору; утечка raw profile в LLM; галлюцинированные skills/levels;
отсутствие fallback; нестабильный tie-break; нарушение gain/max_level; уже завершённая
активность в рекомендациях; prompt injection в event description; доступ сотрудника к чужим
данным; публичный ranking; невозможность загрузить judge profile; отсутствие честного abstain.
Затем прогони главный сценарий и оцени, понятно ли за 30 секунд, почему выбран критичный
навык, а не самый слабый. Верни только: P0 blockers, P1 risks, точные файлы/функции и
минимальное исправление. Не предлагай новые features.
```

**Blockers, которые чиним немедленно:**

- проект не запускается с чистого clone;
- judge profile не проходит импорт;
- ranking использует только минимальный навык;
- completion нарушает `gain`/`max_level`;
- LLM-ответ может добавить неизвестный ID или число;
- нет fallback при отсутствии ключа;
- главный route падает на пустой/отсутствующей истории.

---

## F — Последние 40 минут

**README:**

```
Обнови README на основании фактически реализованного кода.
Верх страницы: value proposition, hero GIF, три differentiators, quick start.
Далее: architecture, scoring evidence, evaluation, privacy, fallback, limitations.
Не заявляй функции, которых нет. Проверь все команды на чистом clone.
```

**Release audit:**

```
Проведи read-only release audit. Сопоставь README, package scripts, .env.example, Dockerfile,
routes и tests. Верни только команды, которые не работают, расхождения документации и
P0 defects с точными файлами.
```

**Demo rehearsal:**

```
Составь 90-секундный demo script по реальному UI: проблема, challenge profile, baseline
failure, Career Quest decision, evidence, what-if, HR, Trust metrics.
Каждая реплика должна соответствовать видимому элементу интерфейса.
```

---

**Последний принцип:** Codex должен сокращать время реализации, а не увеличивать scope.
Любое предложение новой функции после feature freeze отклоняется, если оно не чинит P0 blocker.
