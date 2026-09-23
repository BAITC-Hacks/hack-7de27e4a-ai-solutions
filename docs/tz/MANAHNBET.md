# Персональное ТЗ — Манахнбет · Поток B: Employee Digital Twin

**Доля: 33.3%** · ветка `feat/manahnbet-digital-twin`
**Миссия:** создать главный пользовательский опыт и simulation-логику, которая превращает
ranking в понятную карьерную траекторию. Это главный wow-flow продукта.

```
загрузка набора -> профиль -> Decision Lab -> Evidence -> what-if path
   -> confirm completion -> immutable ledger -> rerank
```

| Параметр | Значение |
|---|---|
| Каталоги | `src/app/employee/**`, `src/components/employee/**`, `src/domain/simulation/**`, `src/state/**`, `tests/simulation/**` |
| Первый merge | не позже **02:20** |
| Feature freeze | **03:00** |

**Не делаю:** не копирую scoring, target resolver и history replay во фронтенд; не меняю
`Recommendation` и `EvidenceReceipt` без согласования; не строю HR-графики и LLM verifier;
не трачу время на валюту, reward shop, leaderboard и OAuth.

## Deliverables

| # | Результат | Приёмка |
|---|---|---|
| 1 | Dataset upload UX | Четыре файла, validation summary, понятные ошибки |
| 2 | Shared Zustand store | Один dataset/state, доступен HR и Trust |
| 3 | Employee profile | Роль, грейд, цель, язык, effective skills, active journey |
| 4 | Decision Lab | Weakest-skill baseline наглядно против Career Quest top-1 |
| 5 | Recommendation cards | Top-3, факторы, evidence, ближайшая сессия, ожидаемый прирост |
| 6 | Path Planner | Beam search до 4 шагов: Fastest / Balanced / Stretch |
| 7 | What-if Simulator | Before/after уровней и readiness **без изменения** исходного state |
| 8 | Completion ledger | Confirm применяет `gain`/`max_level`, пишет событие и вызывает rerank |
| 9 | Tests | Минимум **6**: planner, ledger, immutability, edge states |

## Порядок реализации

**Шаг 1 — store и adapters.** Один Zustand store: dataset, `selectedEmployeeId`, ledger,
simulation, UI status. UI вызывает функции A через **один** `intelligenceAdapter`, сначала с
типизированным моком. Не сохранять мутации в исходные загруженные объекты.

**Шаг 2 — профиль и Decision Lab.** Current/target grade, readiness, critical blockers.
Слева baseline, справа Career Quest top-1 с evidence. Отдельно — badge history replay, если
effective skills отличаются от review-снимка (у E0028 отличаются — это часть демо).

**Шаг 3 — planner и simulation.** Состояние поиска — effective skills, переход — применение
gains. Beam width 10, depth 4; не повторять событие кроме `EV_036`. Fastest минимизирует шаги,
Balanced использует score, Stretch максимизирует impact. What-if не трогает store до confirm.

**Шаг 4 — completion workflow.** На confirm записать ledger event с before/delta/after,
пересчитать профиль, top-3 и HR-derived state. Анимацию показывать **только после** успешного
пересчёта.

## Поминутный план

| Время | Что | Контрольный результат |
|---|---|---|
| 00:00–00:20 | Contracts, routes, типизированные моки | route `employee` открывается |
| 00:20–01:00 | Upload UI, Zustand, профиль, навыки | профиль из demo fixture виден |
| 01:00–01:40 | Top-3 cards, Evidence drawer, baseline | Decision Lab работает на моке |
| 01:40–02:20 | Planner, what-if, ledger, тесты | demo-flow E0028 работает |
| 02:20–03:00 | Подключить настоящий engine A | моки сняты через один adapter |
| 03:00–04:00 | Responsive, loading, errors, polish | главный сценарий стабилен |
| 04:00–04:35 | GIF/скриншоты и репетиция | hero для README готов |
| 04:35–05:00 | Только critical fixes | три прогона без сбоя |

## Обязательные тесты

- what-if не изменяет исходный Zustand dataset;
- confirm создаёт **один** ledger event и применяет `gain`/`max_level`;
- повторный confirm защищён от двойного применения;
- planner не повторяет completed событие, кроме `EV_036`;
- planner ограничен depth 4 и завершается детерминированно;
- missing history и no target показывают корректный empty state;
- невалидный upload показывает issues без падения route;
- после confirm вызывается rerank и меняется projected readiness.

## Handoff

| Кому | Что | Когда |
|---|---|---|
| A → B | `EmployeeView`, `recommendForEmployee()`, `EvidenceReceipt` | 01:40 |
| B → A | simulation state и completion payload | 02:20 |
| B → C | единые Zustand selectors для HR/Trust | 02:20 |
| C → B | AI explanation / fallback status для badge | 02:20 |

## Definition of Done

- Работает на фактическом dataset v1.0, без hardcoded ID кроме демо-фикстура.
- Минимум пять зелёных тестов своей domain-логики.
- Empty, missing history и invalid import не роняют страницу.
- HR читает тот же store; бизнес-логика не продублирована.
- E0028 проходит `profile → why → what-if → confirm → rerank` после общего merge.
- UI остаётся сильным без LLM.

**Prompt для Codex:** `docs/WORKSTREAMS.md` → раздел B.
