# Playbook: 5 часов, 3 разработчика, 3 потока Codex

> AI ускоряет написание кода, но не ускоряет согласование несовместимых решений.
> Первые 20 минут инвестируются в контракт, каталоги и demo-story. После этого три потока
> работают независимо.

## 1. Единая история продукта

```
IMPORT -> EMPLOYEE PROFILE -> GAPS -> TOP-3 -> WHY A / WHY NOT B
       -> WHAT-IF -> CONFIRM -> RERANK -> HR -> TRUST CENTER
```

Критерий успеха через пять часов:

- главный сценарий работает end-to-end без ручной правки данных;
- скрытый профиль жюри импортируется через UI;
- Decision Lab наглядно побеждает weakest-skill baseline;
- поведение без LLM-ключа понятно и проверяемо;
- репозиторий продаёт продукт, даже если команду не допустят к live demo.

## 2. Зафиксировано, не обсуждаем после старта

| Вопрос | Решение |
|---|---|
| Stack | Next.js, TypeScript, Zod, Zustand, Recharts, Vitest, pnpm, Node 22 |
| Persistence | Browser store + immutable session ledger. Без БД. |
| LLM | Bounded critic + verifier + deterministic fallback |
| Общий контракт | `NormalizedDataset`, `EffectiveEmployeeProfile`, `Recommendation`, `EvidenceReceipt` |
| Главный wow | Decision Lab + Digital Twin + Trust Center |
| Snapshot date | `2026-10-01` |

## 3. Роли — по 33.3%

| Поток | Кто | Сложный результат | Каталоги |
|---|---|---|---|
| **A — Intelligence** | Алихан | adapter, history replay, gaps, ranker, evidence | `domain/data`, `domain/recommendation`, `lib/contracts` |
| **B — Experience** | Манахнбет | Digital Twin, state, planner, simulation, completion | `app/employee`, `components/employee`, `domain/simulation`, `state` |
| **C — Trust** | Даник | HR analytics, bounded LLM, verifier, Trust Center, evals | `app/hr`, `app/trust`, `components/hr`, `components/trust`, `domain/analytics`, `app/api/ai`, `lib/evaluation` |

Равенство = одна сложная domain-задача + одна demo-visible поверхность + минимум 5 тестов +
собственные error/empty states у каждого.

Обязанности каждого:

- прочитать `docs/ARCHITECTURE.md` и `docs/CONTRACTS.md` **до** запуска Codex;
- дать Codex точный allowlist каталогов и Definition of Done;
- рабочий commit не реже раза в 40 минут;
- не менять чужие каталоги без согласования;
- сообщать об изменении общих типов **до** commit, а не после merge conflict;
- иметь локальный demo state и graceful empty/error state.

## 4. Поминутный план

| Время | Общий результат | A | B | C |
|---|---|---|---|---|
| 00:00–00:20 | Contract freeze и каркас | типы, demo schema | routes и layout | HR/Trust routes, mock eval |
| 00:20–01:00 | Первый видимый slice | exact import + replay | profile + state + skills | HR summary + baseline |
| 01:00–01:40 | Рабочее решение | gaps + candidates + score | planner + top-3 + why | LLM schema + analytics |
| 01:40–02:20 | Три поверхности | evidence + adversarial tests | Decision Lab + what-if + ledger | verifier + Trust + heatmap |
| **02:20** | **Integration checkpoint** | подключает engine | убирает моки | подключает live metrics |
| **03:00** | **FEATURE FREEZE** | только fixes | только polish | только fixes/evals |
| 03:00–03:40 | Hardening | adversarial cases | responsive/errors | fallback/injection |
| 03:40–04:10 | Release candidate | Vitest | demo flow | eval report |
| 04:10–04:35 | Repository sells itself | tech README | GIF/screens | trust results |
| 04:35–05:00 | Submission buffer | fresh run | demo rehearsal | final audit |

> Если интеграция в 02:20 не началась — **P1 немедленно сокращается**.
> Первую end-to-end проверку нельзя переносить на последний час.

## 5. Первые 20 минут: протокол

**00:00–00:05 — demo story.** Выбрать challenge profile (по умолчанию `E0028`), зафиксировать
ожидаемый top-1 и проигрывающий baseline, зафиксировать одно before/after изменение readiness.

**00:05–00:12 — contracts.** `NormalizedDataset` и ошибки импорта; `EffectiveEmployeeProfile`
и требования грейда; `Recommendation`, `factorScores`, `EvidenceItem`; `SimulationResult` и
ledger event. См. `docs/CONTRACTS.md`.

**00:12–00:20 — scaffold и branch point.** Routes `employee`/`hr`/`trust`; подключить реальные
схемы (200/60/40/2743); добавить `E0028` как challenge fixture, formatter и theme tokens;
создать три ветки из **одного** commit SHA; проверить `pnpm install`, `pnpm test`, `pnpm dev`.

```
main
├── feat/alihan-intelligence
├── feat/manahnbet-digital-twin
└── feat/danik-hr-trust
```

## 6. Feature gates

| Уровень | Функции | Условие |
|---|---|---|
| **P0** | Import, history replay, profile, gaps, top-3, explanation, complete, HR summary | Должно работать к 02:20 |
| **P1** | Decision Lab, what-if, Evidence Receipt, Trust Center | Только при рабочем P0 |
| **P2** | Path strategies, RU/KZ polish, анимации | Только до 03:00 и без риска для P0/P1 |
| **OUT** | OAuth, SQL DB, валюта, reward shop, публичный leaderboard, churn ML | Не делаем |

**Kill switches:**

- нет реального датасета к 00:30 → adapter aliases + demo fixture, не ждать;
- LLM нестабильна → отключить critic, оставить deterministic explanation;
- Path Planner не готов к 02:20 → оставить one-step what-if и top-3;
- график ломает UI → компактная таблица; логика важнее визуализации;
- Docker дольше 15 минут → оставить проверенный `pnpm start`, задокументировать, доделывать фоном.

**Нельзя сокращать никогда:** импорт профиля жюри, многофакторную рекомендацию, объяснение
минимум по трём факторам, completion + пересчёт, HR-view.

## 7. Финальный checklist перед сдачей

| Gate | Проверка |
|---|---|
| Build | `pnpm build` проходит |
| Fresh run | проект запускается из чистого clone строго по README |
| Import | загружается новый профиль и история |
| Decision | top-3 использует минимум три фактора и показывает evidence |
| Progress | completion применяет `gain`/`max_level` и запускает rerank |
| Fallback | без LLM-ключа интерфейс полностью работоспособен |
| Privacy | raw employee data не уходит в модель |
| HR | нет публичного рейтинга, видны aggregate gaps и no-step alerts |
| Trust | baseline и evaluation доступны из приложения |
| Demo | сценарий пройден три раза без ручного вмешательства |
| Repository | README понятен за 30 секунд |

**После 04:35 команда не улучшает продукт — команда защищает submission от поломок.**
