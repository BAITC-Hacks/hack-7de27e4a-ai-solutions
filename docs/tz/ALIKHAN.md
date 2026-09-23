# Персональное ТЗ — Алихан · Поток A: Intelligence Engine

**Доля: 33.3%** · ветка `feat/alihan-intelligence`
**Миссия:** построить корректное и объяснимое рекомендательное ядро на точной схеме
выданного датасета. Эта цепочка — источник правды для двух других потоков.

```
exact dataset adapter -> history replay -> target gaps -> eligible candidates
   -> multi-factor top-3 -> Evidence Receipt
```

| Параметр | Значение |
|---|---|
| Каталоги | `src/domain/data/**`, `src/domain/recommendation/**`, `src/lib/contracts/**`, `tests/recommendation/**` |
| Первый merge | не позже **02:20** от старта |
| Feature freeze | **03:00**, дальше только fixes, tests и polish |

**Не делаю:** Employee UI, HR dashboard, Trust Center; Zustand, what-if ledger, LLM route.
Не прячу score внутрь prompt и не разрешаю LLM выбирать произвольное событие.
Не меняю design system и root layout после scaffold.

## Deliverables

| # | Результат | Приёмка |
|---|---|---|
| 1 | Zod schemas и importer | Все четыре файла проходят; ошибка содержит файл и поле |
| 2 | `NormalizedDataset` | Все foreign keys валидированы; missing skill = 0 |
| 3 | Effective skill replay | Completed после `last_review_date` применяет `gain`/`max_level` ровно один раз |
| 4 | Target resolver | `career_goal` приоритетнее; иначе next grade; Lead без цели → no target |
| 5 | Eligibility filters | mandatory / prerequisites / completed / session / max_level — **до** скоринга |
| 6 | Multi-factor ranking | Top-3 детерминирован, critical skills весят ×2 |
| 7 | Evidence Receipt | На каждый item: gap, effective gain, history, вклад факторов |
| 8 | Tests | Минимум **7**, включая E0028 и «нет подходящих кандидатов» |

## Порядок реализации

**Шаг 1 — контракты и импорт.** meta, proficiency scale, skills, role profiles, employees,
career_goal, events, history rows. Проверить уникальность ID и ссылки employee/event/skill/role-grade.
Экспортировать `NormalizedDataset` и `ValidationIssue`.

**Шаг 2 — effective profile.** Старт с `employee.skills` на `last_review_date`. Отсортировать
completed после review date по `date`, затем `record_id`. Применить `develops_skills` через
`min(current + gain, max_level, 5)`. Сохранить evidence: какие записи изменили какой навык.

**Шаг 3 — target gaps.** Cross-role `career_goal` резолвить через соответствующий
`role_profile`. `critical_skills` — коэффициент **2.0**. Вернуть readiness, remaining gaps и
promotion blockers.

**Шаг 4 — candidates и ranking.** Сначала hard filters, затем effective gains только по target
gaps. Факторы: impact 45%, engagement 20%, feasibility 15%, goal 10%, path/diversity 10%.
History fit разделяет voluntary и assigned поведение; `overdue` по mandatory **не** трактуется
как отсутствие добровольного интереса. Стабильный tie-break по `event_id` + diversity rerank top-3.

## Поминутный план

| Время | Что | Контрольный результат |
|---|---|---|
| 00:00–00:20 | Совместно зафиксировать contracts и demo E0028 | scaffold commit и ветка |
| 00:20–01:00 | Zod import, references, history replay | effective skills E0028 корректны |
| 01:00–01:40 | Target gaps, filters, scoring | стабильный top-5 |
| 01:40–02:20 | Evidence, diversity, tests | pure `recommend()` и зелёные тесты |
| 02:20–03:00 | Интеграция с B и C | UI и Trust работают на реальных результатах |
| 03:00–04:00 | Edge cases и performance | P0/P1 закрыты |
| 04:00–04:35 | Документировать формулу | раздел architecture в README |
| 04:35–05:00 | Только critical fixes | финальный build стабилен |

> В 02:20 остановить локальное расширение scope и начать интеграцию.
> Если P0 не готов — немедленно удалить P2, а не переносить checkpoint.

## Обязательные тесты

- E0028: replay `EV_006` после review date, не рекомендовать `EV_006` повторно;
- самый слабый навык не нужен целевому грейду — побеждает critical gap;
- mandatory событие всегда исключено;
- prerequisite не выполнен — событие исключено;
- `max_level` не даёт прироста — событие исключено;
- completed исключено, `EV_036` допускается повторно;
- Lead без `career_goal` возвращает честный no target;
- одинаковый вход даёт одинаковый порядок top-3.

## Handoff

| Кому | Что | Когда |
|---|---|---|
| A → B | `NormalizedDataset`, `EffectiveEmployeeProfile`, `recommendForEmployee()`, `EvidenceReceipt` | 01:40 |
| A → C | candidates и evidence allowlist | 01:40 |
| B → A | simulation state для повторного `recommend()` | 02:20 |
| C → A | adversarial failures **как тесты**, не как правка score | 02:20 |

## Definition of Done

- Работает на фактическом dataset v1.0, без hardcoded ID кроме демо-фикстура.
- Минимум пять зелёных тестов своей domain-логики.
- Empty, missing history и invalid import не роняют страницу.
- Результат доступен через общий контракт и не дублирует чужую логику.
- Сценарий E0028 проходит после общего merge.
- Известные ограничения перечислены; отсутствующие функции не заявлены.

**Prompt для Codex:** `docs/WORKSTREAMS.md` → раздел A.
