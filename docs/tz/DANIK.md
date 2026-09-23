# Персональное ТЗ — Даник · Поток C: HR Intelligence и AI Trust

**Доля: 33.3%** · ветка `feat/danik-hr-trust`
**Миссия:** создать HR-ценность и доказать жюри, что AI-решения системы контролируемы,
grounded и устойчивы.

```
HR analytics -> operational insights -> bounded LLM critic -> fact verifier
   -> deterministic fallback -> live Trust evaluation
```

| Параметр | Значение |
|---|---|
| Каталоги | `src/app/hr/**`, `src/app/trust/**`, `src/components/hr/**`, `src/components/trust/**`, `src/domain/analytics/**`, `src/app/api/ai/**`, `src/lib/evaluation/**`, `tests/evaluation/**` |
| Первый merge | не позже **02:20** |
| Feature freeze | **03:00** |

**Не делаю:** не меняю scoring weights и eligibility filters напрямую; не строю Employee
profile и simulation planner; не отправляю в LLM raw profile/history; не называю метрику
accuracy без размеченных правильных рекомендаций; не создаю публичный рейтинг сотрудников.

## Deliverables

| # | Результат | Приёмка |
|---|---|---|
| 1 | Analytics selectors | Critical gaps, coverage, no-step, статусы, engagement, catalog gaps |
| 2 | HR Command Center | Не только графики: у каждого блока есть operational action |
| 3 | Weakest-skill baseline | Честное сравнение с движком |
| 4 | Evaluation harness | Adversarial fixtures и измеримые constraint/grounding метрики |
| 5 | Bounded LLM route | Только allowlisted candidates/evidence, structured Zod output |
| 6 | Fact verifier | Блокирует неизвестные ID, навыки, уровни, gains и неподтверждённые утверждения |
| 7 | Fallback explanation | Работает без API key на ru/kk/en по `preferred_language` |
| 8 | AI Trust Center | Baseline, eligibility, grounding, replay correctness, latency, fallback |
| 9 | Tests | Минимум **7**, включая injection и LLM outage |

## Порядок реализации

**Шаг 1 — analytics domain.** Считать агрегаты только из `NormalizedDataset` / store B.
Показывать weighted critical gaps, coverage и сотрудников без следующего шага. Разделять
self / manager / HR assigned участие. Найти навыки, для которых каталог **не даёт** прироста
до требования грейда — это готовая рекомендация для HR.

**Шаг 2 — HR Command Center.** Heatmap skills × roles/grades без публичного сравнения людей.
Participation funnel: completed / in_progress / dropped / no_show / declined. Operational
cards: создать событие, изменить формат, предложить manager intervention.

**Шаг 3 — bounded LLM.** Вход: candidate IDs, evidence IDs, язык. Текст датасета — **всегда
untrusted data**. Выход: Zod-схема с выбранными ID + ссылками на evidence + объяснением.
Verifier сверяет все ID и числовые утверждения; timeout → template fallback. Модель не может
добавить активность или изменить score.

**Шаг 4 — Trust evaluation.** Baseline против движка на E0028 и дополнительных adversarial
кейсах. Метрики: eligibility violations, factual grounding, replay correctness, latency,
fallback status. Evaluation запускается **из UI** и сохраняет summary для README.

## Поминутный план

| Время | Что | Контрольный результат |
|---|---|---|
| 00:00–00:20 | Contracts, mock dataset, определения Trust-метрик | routes HR/Trust открываются |
| 00:20–01:00 | Analytics selectors и HR summary | агрегаты на demo fixture |
| 01:00–01:40 | LLM schema, verifier, fallback | route безопасно отвечает |
| 01:40–02:20 | Trust Center, baseline, тесты | live eval работает на моке |
| 02:20–03:00 | Подключить результаты A и store B | HR/Trust на реальном state |
| 03:00–04:00 | Injection, outage, polish метрик | adversarial suite зелёный |
| 04:00–04:35 | Evaluation summary и evidence для README | скриншот Trust готов |
| 04:35–05:00 | Только critical fixes | fallback проверен без ключа |

## Обязательные тесты

- HR-агрегаты совпадают с прямым подсчётом строк датасета;
- нет leaderboard и выдачи чужих individual details;
- неизвестный candidate ID в выходе LLM блокируется;
- изменённый level/gain или неподтверждённое число блокируются verifier;
- prompt injection в `description` события остаётся данными;
- отсутствие API key возвращает grounded template explanation;
- `preferred_language` выбирает ru/kk/en fallback;
- baseline на E0028 отличается от движка по объяснимой причине;
- Trust-метрики не используют ложную accuracy без labels.

## Handoff

| Кому | Что | Когда |
|---|---|---|
| A → C | candidates, factor scores, `EvidenceReceipt` | 01:40 |
| B → C | нормализованные Zustand selectors и ledger events | 02:20 |
| C → A | failing adversarial cases как тесты/issues | 02:20 |
| C → B | AI explanation, статус verifier/fallback | 02:20 |

## Definition of Done

- Работает на фактическом dataset v1.0, без hardcoded ID кроме демо-фикстура.
- Минимум пять зелёных тестов своей domain-логики.
- Empty, missing history и invalid import не роняют страницу.
- Обе поверхности читают единый store; логика не продублирована.
- Outage LLM не влияет на ranking.
- E0028 виден в baseline comparison после общего merge.

**Prompt для Codex:** `docs/WORKSTREAMS.md` → раздел C.
