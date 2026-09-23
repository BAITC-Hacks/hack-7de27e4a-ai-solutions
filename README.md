# Career Quest

**Career Quest recommends not the weakest skill, but the next best career move.**

Career Quest превращает профиль сотрудника, историю обучения и требования следующего грейда
в проверяемый план развития. Система предлагает 1–3 внутренних активности, объясняет выбор
конкретными фактами и показывает карьерный эффект ещё до прохождения курса.

> HackAlem AI · Halyk Bank · Career Quest<br>
> Алихан — Intelligence · Манахнбет — Experience · Даник — Trust

## Что отличает продукт

| Возможность | Что получает пользователь |
|---|---|
| **Decision Engine** | Многофакторный ranking: критичные skill gaps, история участия, выполнимость, карьерная цель и разнообразие — не просто «самый слабый навык». |
| **Career Digital Twin** | What-if показывает изменение навыков и readiness до подтверждения; completion сразу перестраивает рекомендации и карьерный путь. |
| **Evidence Receipt** | Все факторы, числа, источники и версия движка доступны в интерфейсе. |
| **Career Quest Path** | Детерминированная последовательность из 2–3 шагов до целевого грейда. |
| **Skill Buddy и private XP** | Подсказка, к кому обратиться за помощью, и личный прогресс без публичного рейтинга сотрудников. |
| **Bounded AI critic** | Браузер передаёт только employee/candidate/completion IDs; сервер сам восстанавливает evidence, а LLM возвращает только allowlisted ID и citations. |
| **HR Command Center** | Агрегированные skill gaps, coverage, участие, пробелы каталога и рабочая очередь no-step — без рейтинга результативности. |
| **AI Trust Center** | Живые проверки eligibility, Evidence Receipt, deterministic rerun, history replay и отличие от weakest-skill baseline. |

## Быстрый старт

Требуются Node 22 и pnpm 11.19.0:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Открыть [http://localhost:3000](http://localhost:3000).

| Route | Назначение |
|---|---|
| `/` | Личный режим: server-bound viewer и минимизированный payload без чужой истории |
| `/demo` | Demo Lab: синтетические профили и импорт четырёх файлов judge dataset |
| `/hr` | HR-агрегаты и operational queue без employee leaderboard |
| `/trust` | Trust gates и состояние bounded LLM/fallback |

В `/demo` можно использовать набор организаторов или выбрать четыре файла из
`data/source/`. Переключение между employee, HR и Trust — демонстрация видимости экранов,
а не production-аутентификация.

Docker:

```bash
docker compose up --build
```

### Необязательный LLM

Приложение полностью работает без ключа. Для локального запуска скопируйте `.env.example`
в `.env.local`; для Docker Compose используйте `.env` либо передайте файл явно:

```bash
docker compose --env-file .env.local up --build
```

Заполните `LLM_API_KEY`; при необходимости задайте `LLM_BASE_URL`, `LLM_MODEL` и
`LLM_TIMEOUT_MS`. `CAREER_QUEST_VIEWER_ID` выбирает сотрудника личного route. Ошибка,
invalid response или timeout включает deterministic fallback и не меняет ranking.

## Демо за 90 секунд

1. Открыть `/demo` → **Демо и импорт** и показать четыре входных файла.
2. Выбрать `E0028`: история после review уже подняла System Design с 2 до 3, поэтому
   завершённый `EV_006` не предлагается повторно.
3. Показать «Почему не самый слабый навык?» и Evidence Receipt.
4. Нажать **What-if**, затем **Отметить выполненной**: readiness и top-рекомендации меняются,
   а прогресс переживает reload через IndexedDB.
5. Открыть `/hr`: показать gaps, coverage, no-step queue и участие по всем активностям.
6. Открыть `/trust`: показать 0 eligibility violations, полноту receipt и deterministic rerun.
7. Запустить bounded AI critic без ключа и показать штатный `no_key` fallback.

Полный сценарий: [`docs/DEMO.md`](docs/DEMO.md).

## Как работает решение

```text
employees.json + skills.json + events.json + activity_history.csv
  -> Zod/PapaParse import and relation validation
  -> history replay after last_review_date
  -> career_goal or next-grade target
  -> hard eligibility filters
  -> multi-factor ranking + diversity
  -> Evidence Receipt
       ├─ Employee Digital Twin + path + IndexedDB ledger
       ├─ HR aggregate analytics
       └─ bounded LLM critic + verifier + deterministic fallback
```

Hard filters выполняются до score: mandatory, role/grade mismatch, prerequisites, уже
завершённая или активная activity, отсутствие будущей scheduled-сессии и нулевой effective
gain. Уровень навыка никогда не уменьшается и ограничен `max_level` и диапазоном 0–5.

| Фактор | Вес |
|---|---:|
| Target gap impact, critical ×2 | 45% |
| Engagement fit | 20% |
| Feasibility | 15% |
| Goal alignment | 10% |
| Path/diversity | 10% |

## Проверка перед релизом

```bash
corepack pnpm typecheck
corepack pnpm test
NEXT_TELEMETRY_DISABLED=1 corepack pnpm build
docker compose up --build -d
curl --retry 30 --retry-connrefused --retry-delay 1 --fail http://localhost:3000/
docker compose down
```

Фактические результаты последнего прогона фиксируются в
[`docs/EVALUATION.md`](docs/EVALUATION.md) и обновляются только после успешной проверки.

Последний release-прогон на этой ветке:

- TypeScript typecheck — **PASS**;
- Vitest — **152/152 PASS** в 19 test-файлах;
- Next.js production build — **PASS**;
- Docker image build — **PASS**; `/`, `/demo`, `/hr`, `/trust` вернули HTTP 200;
- интерактивный browser smoke на Docker-сборке — What-if, четыре judge file inputs, HR,
  Trust и `no_key` fallback работают без console errors.

## Privacy и продуктовые ограничения

- Нет публичного рейтинга сотрудников, автоматических премий, зарплатных решений или давления
  за обязательные активности.
- Employee mode получает один viewer-профиль и минимальный Skill Buddy-каталог; чужая история,
  цели, менеджеры и review snapshots не сериализуются. Все синтетические профили доступны только
  в явном `/demo`.
- В AI route уходят только `employeeId`, язык, candidate IDs и bounded completion IDs. Сервер
  заново проверяет replay и восстанавливает evidence; LLM не создаёт числовые claims.
- Completion ledger хранится локально в IndexedDB и изолирован fingerprint конкретного dataset.
- Browser-import dataset использует deterministic explanation: внешний critic не смешивает его
  с server-side bundled evidence.
- Текст из импортированного датасета трактуется как данные, а не как инструкции модели.

Это hackathon role-scoped demo, **не production authentication**. Для реальных данных нужны
корпоративные SSO/RBAC, серверное хранилище и audit log. IndexedDB не синхронизируется между
устройствами.

GitHub Actions организации может завершиться до запуска команд проекта из-за billing lock.
В этом случае release gate выполняется локально командами выше; детали и ограничения описаны в
[`docs/INTEGRATION.md`](docs/INTEGRATION.md), метрики и adversarial-кейсы — в
[`docs/EVALUATION.md`](docs/EVALUATION.md).

## Документация

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — техническая модель и release gates
- [`docs/DATASET.md`](docs/DATASET.md) — проверенные факты о данных
- [`docs/CONTRACTS.md`](docs/CONTRACTS.md) — публичные типы и API ядра
- [`docs/EVALUATION.md`](docs/EVALUATION.md) — метрики и adversarial-проверки
- [`docs/DEMO.md`](docs/DEMO.md) — актуальный demo script
- [`docs/ADVANCED_FEATURES.md`](docs/ADVANCED_FEATURES.md) — следующие продуктовые расширения
- [`docs/INTEGRATION.md`](docs/INTEGRATION.md) — интеграционный отчёт
- [`docs/WORKSTREAMS.md`](docs/WORKSTREAMS.md) — разделение работы команды

Данные синтетические и предоставлены организаторами. Реальные персональные данные не
используются.
