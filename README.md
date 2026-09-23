# Career Quest

**Career Quest recommends not the weakest skill, but the next best career move.**

AI-навигатор развития сотрудника: по профилю, истории участия и требованиям следующего грейда
система подбирает 1–3 шага развития, объясняет каждый минимум по трём факторам и показывает,
как сдвинется карьерная готовность — до того, как человек потратит на это время.

> HackAlem AI · трек Halyk Bank · кейс **Career Quest**
> Команда: Алихан (Intelligence), Манахнбет (Experience), Даник (Trust)

<!-- FILL 04:10 — hero GIF Decision Lab: public/demo/hero.gif -->

## Почему наше решение другое

| | |
|---|---|
| **Decision Engine** | Многофакторный детерминированный выбор: разрыв по навыкам с приоритетом критичных, история участия, выполнимость, цель, разнообразие. Не один prompt и не «самый низкий навык». |
| **Digital Twin** | Карьерный эффект виден **до** выполнения активности: what-if по уровням и readiness, план на несколько шагов, подтверждение с пересчётом. |
| **Trust Center** | У каждого решения есть Evidence Receipt. Баг-репорт на сам AI: нарушения eligibility, подтверждённость чисел, корректность пересчёта истории, latency, поведение без LLM. |

## Быстрый старт

```bash
pnpm install
pnpm dev
```

Открыть http://localhost:3000 и загрузить четыре файла из `data/source/`.

Docker:

```bash
docker compose up --build
```

**LLM-ключ не обязателен.** Без него приложение работает полностью: тот же ranking и
детерминированные объяснения. Ключ включает только bounded-критика поверх готового решения.
Переменные — в `.env.example`.

Требуется Node 22 и pnpm (`corepack enable`).

## Демо-сценарий

<!-- FILL 04:10 — 2–3 предложения + ссылка на docs/DEMO.md и скриншоты -->

Полный скрипт: [`docs/DEMO.md`](docs/DEMO.md).

## Архитектура

Next.js + TypeScript, вся обработка данных — в браузере; в server route уходят только
минимальные evidence-факты по top-кандидатам.

```
Import (Zod) -> NormalizedDataset -> history replay -> target gaps
   -> hard filters -> multi-factor ranking -> Evidence Receipt
        ├─> Employee Digital Twin (what-if, planner, ledger)
        ├─> HR Command Center (агрегаты, no-step alerts)
        └─> AI Trust Center (baseline, evals, fallback)
```

Подробно: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · контракты:
[`docs/CONTRACTS.md`](docs/CONTRACTS.md) · данные: [`docs/DATASET.md`](docs/DATASET.md).

## Как считается рекомендация

Перед любым расчётом движок **доигрывает историю**: уровни в профиле актуальны на
`last_review_date`, а всё завершённое позже ещё не учтено. В стартовом наборе это 318 записей
у 114 из 200 сотрудников — то есть решение без replay ошибается на каждом втором профиле.

Hard-фильтры (до скоринга): mandatory, несоответствие роли/грейду, невыполненные
prerequisites, уже пройденное (кроме recurring `EV_036`), нулевой effective gain, отсутствие
будущей сессии.

Ранжирование:

| Фактор | Вес |
|---|---|
| Target gap impact (critical skills ×2) | 45% |
| Engagement fit (история, self vs assigned) | 20% |
| Feasibility (prerequisites, формат, сессия) | 15% |
| Goal alignment (в т.ч. cross-role цели) | 10% |
| Path / diversity | 10% |

`effective_gain = max(0, min(current + gain, max_level, 5) - current)` — правило роста задано
самим датасетом, не придумано нами.

## Результаты проверки

<!-- FILL 03:40–04:10 — фактический вывод evaluation harness, без выдуманных чисел -->

Метрики и adversarial-кейсы: [`docs/EVALUATION.md`](docs/EVALUATION.md).

## Приватность и отказоустойчивость

- Данные не покидают браузер: без БД, без внешнего хранилища.
- В LLM уходят только evidence-факты по top-кандидатам — **никогда** raw-профиль и история.
- Ответ модели проходит Zod-схему и fact verifier: неизвестный ID, изменённое число или
  неподтверждённое утверждение блокируются.
- Текст из датасета трактуется как данные, а не как инструкции (защита от prompt injection).
- Без ключа или при ошибке модели — полноценный детерминированный режим.
- Разграничение сотрудник / HR; публичных рейтингов сотрудников нет — это осознанный отказ:
  они мотивируют лидеров и демотивируют большинство.

## Ограничения

<!-- FILL 04:10 — честно перечислить, что не реализовано. Не заявлять того, чего нет в коде. -->

## Документация

| Файл | О чём |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Техническая модель, формула, release gates |
| [`docs/DATASET.md`](docs/DATASET.md) | Проверенные факты о данных и доменные правила |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md) | Общие типы и публичный API ядра |
| [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) | План на 5 часов, feature gates, checklist |
| [`docs/WORKSTREAMS.md`](docs/WORKSTREAMS.md) | Готовые Codex-задания по потокам |
| [`docs/EVALUATION.md`](docs/EVALUATION.md) | Метрики и adversarial-кейсы |
| [`docs/DEMO.md`](docs/DEMO.md) | Демо-скрипт на 90 секунд |
| [`AGENTS.md`](AGENTS.md) | Правила для AI-агентов |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Ветки, коммиты, merge, handshake |

---

Данные синтетические, предоставлены организаторами. Реальные персональные данные не
используются.
