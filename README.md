# Career Quest

**Career Quest recommends not the weakest skill, but the next best career move.**

AI-навигатор развития сотрудника: по профилю, истории участия и требованиям следующего грейда
система подбирает 1–3 шага развития, объясняет каждый минимум по трём факторам и показывает,
как сдвинется карьерная готовность — до того, как человек потратит на это время.

> HackAlem AI · трек Halyk Bank · кейс **Career Quest**
> Команда: Алихан (Intelligence), Манахнбет (Experience), Даник (Trust)

Employee, HR и Trust подключены к одной сессии приложения. Адреса `/` и `/demo`
перенаправляют в кабинет сотрудника `/employee`.

## Почему наше решение другое

|                             |                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision Engine**         | Многофакторный детерминированный выбор: разрыв по навыкам с приоритетом критичных, история участия, выполнимость, цель, разнообразие. Не один prompt и не «самый низкий навык». |
| **Digital Twin**            | Карьерный эффект виден **до** выполнения активности: what-if по уровням и readiness, план на несколько шагов, подтверждение с пересчётом.                                       |
| **Trust Center**            | У каждого решения есть Evidence Receipt. Баг-репорт на сам AI: нарушения eligibility, подтверждённость чисел, корректность пересчёта истории, latency, поведение без LLM.       |
| **External Learning Layer** | Отдельный офлайновый каталог проверенных внешних курсов для разрывов без внутренней активности — без выдуманного gain и без влияния на top-3/readiness.                        |
| **HR Event Builder**        | HR закрывает обнаруженный пробел новой внутренней активностью, видит точный preview охвата и сразу получает пересчитанные рекомендации; событие можно выгрузить в календарь. |

## Быстрый старт

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Открыть http://localhost:3000 и нажать **«Посмотреть демо»** для загрузки набора организаторов
или выбрать четыре файла из `data/source/`.
В общей навигации доступны «Моя траектория», «HR-аналитика» и «Проверка решений».
Две кнопки **«Сотрудник» / «HR»** в верхней панели переключают режим и открывают
соответствующий кабинет. При входе в HR-аналитику или «Проверку решений» из режима
сотрудника кнопка **«Перейти в режим HR»** переключает режим на текущей странице.
Если данные ещё не загружены, доступна кнопка **«Перейти к загрузке»**.
Переходы сохраняют импорт, выбранный профиль и завершения текущей вкладки.
Режимы демонстрируют видимость экранов; они не заменяют аутентификацию и защиту
реальных персональных данных.

Общий переключатель **«Язык»** в верхней панели меняет интерфейс, форматы чисел и дат
и язык AI-объяснений: **Қазақша (`kk`) / Русский (`ru`) / English (`en`)**.
Выбор сохраняется в браузере и восстанавливается после перезагрузки. Язык интерфейса
не зависит от `preferred_language` выбранного сотрудника: смена профиля его не меняет.

Docker:

```bash
docker compose up --build
```

Если опциональные LLM-переменные заданы в `.env.local`, передать их Compose явно:

```bash
docker compose --env-file .env.local up --build
```

**LLM-ключ не обязателен.** Без него приложение работает полностью: тот же ranking и
детерминированные объяснения. Ключ включает bounded-критика и HR-агента поверх вычисленных фактов.
Переменные — в `.env.example`.

Требуется Node 22 и pnpm (`corepack enable`).

### LLM для локального запуска и проверки жюри

В репозитории хранится только `.env.example` с несекретными настройками. Действующий
ключ каждый участник задаёт на своём компьютере; он не входит в Git и Docker-образ.

1. Скопировать `.env.example` в `.env.local` рядом с `package.json`:
   `cp .env.example .env.local` (Linux/macOS) или
   `Copy-Item .env.example .env.local` (PowerShell). Не перезаписывать уже настроенный файл.
2. Вписать действующий ключ OpenAI после `LLM_API_KEY=` и сохранить файл.
   URL `https://api.openai.com/v1` и модель `gpt-4.1-mini` уже указаны в шаблоне.
3. Запустить `pnpm dev`. Для production: `pnpm build`, затем `pnpm start`.
   После изменения окружения перезапустить сервер.
4. Для Docker: `docker compose --env-file .env.local up --build`.
   Compose передаёт ключ контейнеру при запуске, а не во время сборки образа.

Для всех копий репозитория на одном компьютере можно один раз задать `OPENAI_API_KEY`
в пользовательских переменных окружения ОС и открыть новый терминал. Тогда локальный
`.env.local` необязателен: все AI routes используют ключ из окружения и настройки OpenAI
по умолчанию. `LLM_API_KEY`, если непустой, имеет приоритет над `OPENAI_API_KEY`.
Docker Compose также передаёт эти переменные из запускающего терминала.
Для другого OpenAI-compatible провайдера обязательно задать его `LLM_BASE_URL` и `LLM_MODEL`.

Проверка жюри:

- Открыть `/api/ai/agent`: `{"status":"available"}` подтверждает наличие настроек,
  но ещё не проверяет доступ к API или баланс.
- Загрузить демо, перейти в режим HR, открыть `/hr` и отправить вопрос в панели агента.
  Успешный ответ с вычисленными evidence и пройденной проверкой подтверждает весь сценарий.
- Ошибки доступа, лимита, сети или проверки фактов остаются видимыми; они не выдаются за
  успешный LLM-ответ. Детерминированная аналитика продолжает работать без модели.

У HR-агента отдельный `LLM_AGENT_TIMEOUT_MS=10000`; bounded-критик сохраняет
`LLM_TIMEOUT_MS=2500` и верхнюю границу 3000 мс.

Фактическая проверка OpenAI 2026-09-23 (без данных сотрудников и без вывода ключа):

```json
{"http_status":200,"model":"gpt-4.1-mini-2025-04-14","reply":"OK","total_tokens":13}
```

Это подтверждает доступ проверенного локального ключа на момент проверки. Чистый clone
не содержит ключ: для live-демо на компьютере жюри нужен отдельно настроенный ключ.

## Демо-сценарий

После импорта выбрать E0028: System Design после replay равен 3, EV_006 повторно
не предлагается. Примерить и подтвердить Leadership Foundations: readiness 74% → 78%.
Открыть HR: число добровольных завершений увеличится с 1044 до 1045. Открыть Trust и
запустить проверки; затем вернуться к сотруднику — профиль и журнал сохранятся.
Показать External Learning Layer: внешние курсы появляются только там, где нет подходящей
внутренней активности, и не обещают числовой рост навыка.
На HR-экране выбрать пробел каталога, открыть конструктор, заполнить активность и показать
preview **до → после**. После сохранения сравнить прогнозный и фактический охват, вернуться
к сотруднику и показать новую рекомендацию с отметкой «Создано HR», дедлайном и `.ics`.

Полный скрипт: [`docs/DEMO.md`](docs/DEMO.md).

## Архитектура

Next.js + TypeScript. Согласованный интерфейс на RU/KK/EN использует
`AppProviders` и один `sharedEmployeeStore`: импорт, выбранный профиль и журнал
подтверждений находятся в памяти вкладки. Employee, HR и Trust читают эту общую сессию.

```
Import (Zod) -> NormalizedDataset -> history replay -> target gaps
   -> hard filters -> multi-factor ranking -> Evidence Receipt
        ├─> Employee Digital Twin (what-if, planner, ledger)
        ├─> HR Command Center (агрегаты, no-step alerts)
        ├─> AI Trust Center (baseline, evals, fallback)
        ├─> External Learning Layer (offline, read-only, outside scoring)
        └─> HR Event Builder (session catalog -> same eligibility/ranking)
```

Для объяснений текущий UI обращается к `/api/ai/explain`: передаёт язык интерфейса
и ограниченные числовые evidence-факты по кандидатам, включая импортированные наборы.
Сохранённый `/api/ai/review` принимает только ID и восстанавливает evidence на сервере
из встроенного набора. Контракты этих endpoints различаются.

Из `main cf1dc89` сохранены новые доменные модули и API. Альтернативные
`CareerQuestStore`, IndexedDB, private Employee projection и XP-модуль не подключены
к активным страницам; текущий интерфейс не обещает эти возможности.

### External Learning Layer

`data/external_courses.json` — курируемый офлайновый каталог из 35 внешних курсов. При
запуске нет запросов к API провайдеров: ссылки и skill IDs проверяются локальной строгой
Zod-схемой, разрешены только HTTPS-домены из allowlist. Курс показывается отдельно и только
когда ни одна внутренняя активность не закрывает конкретный разрыв сотрудника.

Внешние курсы намеренно не входят в `NormalizedDataset`, recommendation ranking, top-3,
readiness, what-if или completion ledger: у них нет подтверждённых компанией `gain` и
`max_level`. Поэтому UI не показывает числовой эффект и честно маркирует источник. На
текущем bundled snapshot движок вычисляет **88 сотрудников** с критичным hard-skill
блокером без подходящей внутренней активности; HR-экран пересчитывает показатель для
фактически загруженного набора данных, а не использует хардкод.

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

| Фактор                                      | Вес |
| ------------------------------------------- | --- |
| Target gap impact (critical skills ×2)      | 45% |
| Engagement fit (история, self vs assigned)  | 20% |
| Feasibility (prerequisites, формат, сессия) | 15% |
| Goal alignment (в т.ч. cross-role цели)     | 10% |
| Path / diversity                            | 10% |

`effective_gain = max(0, min(current + gain, max_level, 5) - current)` — правило роста задано
самим датасетом, не придумано нами.

## Результаты проверки

External Learning Layer поверх `main cf1dc89` прошёл **190 тестов в 23 файлах**,
отдельный TypeScript typecheck, production build и Docker image build (2026-09-23).
Browser smoke подтвердил активные `EmployeeWorkspace` и `HRDashboard`, RU/KK/EN,
скрытие общеорганизационного external-агрегата при фильтре роли и отсутствие console errors.

HR Event Builder поверх актуального `main 02f4bf6` прошёл **321 тест в 37 файлах**,
TypeScript typecheck и production build. Проверены строгая схема, точное совпадение preview
с пересчитанными кандидатами, session reset, дедлайны от даты среза и RFC 5545 export.

Предыдущая версия согласованного интерфейса прошла **117 тестов в 14 файлах**,
TypeScript и production-сборку. Для PR #6 отдельно зафиксированы **152 теста в 19 файлах**,
TypeScript, сборка и Docker smoke. Это исторические результаты двух версий,
а не результаты проверки их объединения.

Исторический browser QA согласованного UI: три цикла confirm → HR → Trust → Employee
сохранили прогресс; добровольные завершения изменились 1044 → 1045 → 1046 → 1047.
Trust выполнил 33 проверки без ошибок. Grounding относится к 5 проверочным утверждениям,
а не к произвольным ответам модели. Текущий статус — в [`docs/INTEGRATION.md`](docs/INTEGRATION.md).

Стандартные команды проверки из корня проекта:

```bash
pnpm test
pnpm typecheck
pnpm build
```

GitHub Actions заблокирован из-за billing аккаунта, до запуска команд проекта.
По решению команды проверяем эту интеграцию локально. Детали команд и ограничений:
[`docs/INTEGRATION.md`](docs/INTEGRATION.md).

Метрики и adversarial-кейсы: [`docs/EVALUATION.md`](docs/EVALUATION.md).

## Приватность и отказоустойчивость

- Исходные импортированные файлы и полная история остаются в браузере; серверной БД нет.
- В LLM уходят только evidence-факты по top-кандидатам — **никогда** raw-профиль и история.
- Ответ модели проходит Zod-схему и fact verifier: неизвестный ID, изменённое число или
  неподтверждённое утверждение блокируются.
- Текст из датасета трактуется как данные, а не как инструкции (защита от prompt injection).
- Без ключа или при ошибке модели — полноценный детерминированный режим.
- `/api/ai/explain` проверяет ответ относительно присланного evidence; происхождение
  импортированных фактов сервером не подтверждается. `/api/ai/review` использует
  серверный встроенный набор. Оба route ограничивают origin, JSON, размер тела и частоту запросов.
- Режимы просмотра сотрудник / HR для демонстрации; публичных рейтингов сотрудников нет.
- Названия внешних курсов трактуются как данные и не передаются в LLM; ссылки разрешены
  только по HTTPS allowlist и открываются с `noopener noreferrer`.

## Ограничения

- Набор и прогресс хранятся в памяти вкладки. Полная перезагрузка страницы сбрасывает сессию.
- Созданные HR-активности также живут только в текущей сессии и очищаются при повторном
  импорте набора; интерфейс сообщает об этом явно. Исходный `data/source` не изменяется.
- Режим демо не заменяет серверную авторизацию; приложение предназначено для синтетического набора.
- Beam search ограничен шириной 10 и глубиной 4. `.ics` экспортирует заявленные даты,
  но не проверяет конфликты с личным календарём и не создаёт внешнюю встречу автоматически.
- Живой платный LLM-провайдер не вызывался при проверке; протестированы проверенные ответы, отказ,
  таймаут и режим без ключа. AI не меняет порядок рекомендаций.
- Docker image собран локально; отдельный HTTP smoke уже внутри запущенного контейнера в этом
  прогоне не выполнялся — Employee и HR проверены на локальной production-сборке.

## Документация

| Файл                                           | О чём                                         |
| ---------------------------------------------- | --------------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Техническая модель, формула, release gates    |
| [`docs/DATASET.md`](docs/DATASET.md)           | Проверенные факты о данных и доменные правила |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md)       | Общие типы и публичный API ядра               |
| [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md)         | План на 5 часов, feature gates, checklist     |
| [`docs/WORKSTREAMS.md`](docs/WORKSTREAMS.md)   | Готовые Codex-задания по потокам              |
| [`docs/EVALUATION.md`](docs/EVALUATION.md)     | Метрики и adversarial-кейсы                   |
| [`docs/DEMO.md`](docs/DEMO.md)                 | Демо-скрипт на 90 секунд                      |
| [`AGENTS.md`](AGENTS.md)                       | Правила для AI-агентов                        |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)           | Ветки, коммиты, merge, handshake              |

---

Данные синтетические, предоставлены организаторами. Реальные персональные данные не
используются.

## PR #7 — integration verification (2026-09-23)

Merged main `f287b40` into the Danik branch, preserving the localized main UI, adding the HR agent and participation panels, and retaining both analytics export sets. The new panels use RU/KK/EN. Shared contracts, recommendation, simulation, and Employee files match main.

Standard commands on Windows (Node 24.21.0, pnpm 11.19.0): `pnpm install` exit 0; `pnpm typecheck` exit 0; `pnpm test` exit 1; `pnpm build` exit 1. The current environment denies piped child processes (`spawn EPERM`), also reproduced with official Node 22.23.2. No alternate test configuration or build configuration was used for these checks. **The standard test/build gates remain unverified; these failures are not successful reproducibility evidence.**

CI now has a manual `workflow_dispatch` trigger, implementing the billing-related team decision already recorded in `docs/DECISIONS.md` (decision 8). GitHub reports previous jobs failing before runner startup (`runner_id=0`, `steps=[]`); logs are unavailable. Billing is documented by the team, but the current billing diagnostic could not independently be retrieved through the connector. Manual-only CI does not constitute a passing check.

<details><summary>Actual pnpm test output</summary>

```text
$ vitest run
failed to load config from C:\Users\Daniyar\Documents\Codex\2026-09-23\github-plugin-github-openai-curated-remote\work\pr7-integration\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
    at ChildProcess.spawn (node:internal/child_process:458:11)
    at spawn (node:child_process:813:9)
    at Object.execFile (node:child_process:349:17)
    at exec (node:child_process:236:25)
    at optimizeSafeRealPathSync (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/vite@8.3.0_@types+node@26.6.2/node_modules/vite/dist/node/chunks/node.js:2438:2)
    at windowsSafeRealPathSync (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/vite@8.3.0_@types+node@26.6.2/node_modules/vite/dist/node/chunks/node.js:2424:3)
    at getRealPath (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/vite@8.3.0_@types+node@26.6.2/node_modules/vite/dist/node/chunks/node.js:28972:36)
    at tryResolveRealFileOrType (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/vite@8.3.0_@types+node@26.6.2/node_modules/vite/dist/node/chunks/node.js:28966:9)
    at tryCleanFsResolve (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/vite@8.3.0_@types+node@26.6.2/node_modules/vite/dist/node/chunks/node.js:28715:21)
    at tryFsResolve (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/vite@8.3.0_@types+node@26.6.2/node_modules/vite/dist/node/chunks/node.js:28708:14)
    at aggregateBindingErrorsIntoJsError (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/rolldown@1.2.9/node_modules/rolldown/dist/shared/error-CGhV1ebk.mjs:48:18)
    at unwrapBindingResult (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/rolldown@1.2.9/node_modules/rolldown/dist/shared/error-CGhV1ebk.mjs:18:128)
    at #build (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/rolldown@1.2.9/node_modules/rolldown/dist/shared/rolldown-Ld3ZGGCt.mjs:133:34)
    at async bundleConfigFile (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/vite@8.3.0_@types+node@26.6.2/node_modules/vite/dist/node/chunks/node.js:37448:12)
    at async bundleAndLoadConfigFile (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/vite@8.3.0_@types+node@26.6.2/node_modules/vite/dist/node/chunks/node.js:37344:18)
    at async loadConfigFromFile (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/vite@8.3.0_@types+node@26.6.2/node_modules/vite/dist/node/chunks/node.js:37305:42)
    at async resolveConfig (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/vite@8.3.0_@types+node@26.6.2/node_modules/vite/dist/node/chunks/node.js:36906:22)
    at async resolveConfig$1 (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/vitest@5.0.1_@types+node@26_7c4363941a84df12a3c6620a81dfa721/node_modules/vitest/dist/chunks/index.DzobfTyw.js:14777:25)
    at async createVitest (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/vitest@5.0.1_@types+node@26_7c4363941a84df12a3c6620a81dfa721/node_modules/vitest/dist/chunks/cli-api.DcLieX4F.js:26:17)
    at async prepareVitest (file:///C:/Users/Daniyar/Documents/Codex/2026-09-23/github-plugin-github-openai-curated-remote/work/pr7-integration/node_modules/.pnpm/vitest@5.0.1_@types+node@26_7c4363941a84df12a3c6620a81dfa721/node_modules/vitest/dist/chunks/cli-api.DcLieX4F.js:421:14) {
  errors: [Getter/Setter]
}



[ELIFECYCLE] Test failed. See above for more details.
EXIT_CODE=1
```

</details>

<details><summary>Actual pnpm build output</summary>

```text
$ next build
▲ Next.js 16.3.5 (Turbopack)
⚠ Warning: Next.js ignored package-lock.json in C:\Users\Daniyar\Documents\Codex\2026-09-23\github-plugin-github-openai-curated-remote\work because it is outside the current Git repository (C:\Users\Daniyar\Documents\Codex\2026-09-23\github-plugin-github-openai-curated-remote\work\pr7-integration).
 To use this directory, set `turbopack.root` in your Next.js config.

✓ Running next.config.ts took 52ms

  Creating an optimized production build ...
✓ Compiled successfully in 6.1s
  Running TypeScript ...
spawn EPERM
[ELIFECYCLE] Command failed with exit code 1.
EXIT_CODE=1
```

</details>
