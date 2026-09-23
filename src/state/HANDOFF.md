# Employee Digital Twin — handoff Манахнбета

Реализована зона B: интерфейс сотрудника, upload UX, состояние Zustand, immutable ledger,
what-if и beam-search planner. Все изменения находятся в каталогах B. Общие типы A,
scoring, history replay, root layout и package.json проекта не менялись.

## Текущая граница готовности

На базовом коммите `52619f058bb6879e7ec5ab257ac151fd8c5c27a9` опубликована командная
документация, но нет `src/lib/contracts`, `src/domain/data`, `src/domain/recommendation`,
`data/source` или корневого package.json. Поэтому:

- production route `/employee` честно показывает отсутствие подключения Intelligence;
- `tests/simulation` содержит отдельный runnable Next.js стенд с явно помеченным **тестовым** адаптером;
- локальный тестовый E0028 демонстрирует state flow, не является копией фактического датасета;
- импорт реальной схемы, реальные результаты E0028, интеграция с HR/Trust и общий Docker/build
  остаются интеграционными проверками после публикации кода A и общего каркаса;
- нет публичного leaderboard, LLM-запросов, отправки файлов на сервер, OAuth или БД.

Это готовый модуль для подключения, но не утверждение о готовности всей системы к защите.

## Запуск из текущей ветки

Требуется Node 22. Команды выполняются из корня репозитория:

```sh
npm --prefix tests/simulation ci
npm --prefix tests/simulation test
npm --prefix tests/simulation run typecheck
npm --prefix tests/simulation run build
npm --prefix tests/simulation run dev
```

Открыть http://127.0.0.1:3100. Корень — демонстрационный стенд, `/employee` —
настоящий route до подключения общего provider. Скрипт генерирует только игнорируемую
папку `tests/simulation/.standalone`. Корневые файлы команды не создаются и не изменяются.
Пакеты стенда изолированы; они не выбирают версии зависимостей основного приложения.

## Для A — Алихана

Единственная граница между B и Intelligence — `src/state/intelligenceAdapter.ts`.
Это локальный view-port B, **не замена** типов из `@/lib/contracts`.

`createIntelligenceAdapter<TDataset, TResult>()` из `src/state/createIntelligenceAdapter.ts`
принимает реальные `importCareerQuestDataset()` и `recommendForEmployee()` и типизированные
mapping-функции. Подставить `NormalizedDataset` и `RecommendationResult` из общих контрактов,
когда их файлы появятся. В `datasetView`, `employeeView`, `withProgress` адаптировать
фактические поля единственного нормализованного источника; не копировать формулы A.

| Метод binding | Что делает |
| --- | --- |
| `importCareerQuestDataset` | Уже документированный импорт A: employees/events/skills + activityHistoryCsv |
| `recommendForEmployee` | Уже документированный ranking A; adapter вызывает top-3 и полный набор кандидатов |
| `datasetView` | Только имена/даты/каталоги для отображения, без target resolution или replay |
| `employeeView` | effectiveProfile → effectiveSkills/replay, gapAnalysis → target/readiness/gaps, recommendations → cards/evidence; excluded[] → причины отказа |
| `withProgress` | Новый derived normalized view для ledger/overlay, без мутации исходника и без двойного replay |
| `validationIssues` | ValidationIssue A → файл/поле/строка/сообщение для upload UX |

Для recurring-флага использовать правило/конфигурацию A. Продуктовый B не содержит IDs
сотрудников или событий. `candidates` обязан содержать все допустимые активности, а не
только показанные три. Prerequisites и доступность пересчитываются A на каждом шаге поиска.

`overlay.skills` — **полный эффективный вектор**, заменяющий effective skills, а не добавочный
gain. `overlay.completedActivityIds` дополняет завершения для фильтрации. Replay оригинальной
истории выполняет только A. Ledger хранит before/delta/after; повторное применение его
дельты поверх after запрещено. На confirm B заново проверяет eligibility, вызывает A и
атомарно обновляет все views. Если recompute упал или не отразил after, ledger не коммитится.

В mapping поля `baseline` использовать результат weakest-skill baseline потока C. До
его подключения UI показывает честное отсутствие baseline, без выдуманного сравнения.
`excluded` передаётся из A: UI не придумывает причины исключения.

## Для C — Даника и интегратора

Создать **один store** через `createEmployeeStore(realAdapter)` и разместить
`EmployeeStoreProvider` вокруг Employee, HR и Trust в общем client boundary.
Сам `/employee` обнаруживает внешний provider и использует его. Локальный provider создаётся
только если общего ещё нет. Не создавать отдельный store для HR.

Импортировать из `src/state/employeeStore.ts`:

- `selectDataset` — read-only UI projection набора;
- `selectNormalizedSource` — исходный `NormalizedDataset` A (исходник остаётся неизменным);
- `selectEmployeeViews` — **актуальные** effective skills/readiness/gaps для всех сотрудников;
- `selectLedger` — подтверждённые completion events;
- `selectCurrentView` — текущий профиль.

Для HR-агрегатов после completion использовать `selectEmployeeViews` и `selectLedger`.
Расчёт только из `selectNormalizedSource` покажет исходное состояние без новых завершений.
Подписка через `useEmployeeStore(selector)` либо `store.subscribe` получает атомарное изменение.

AI badge читает `EmployeeView.explanationStatus`: deterministic / verified-ai / fallback.
Верификацию ответа и baseline предоставляет C; B не реализует LLM verifier.
Никакой текст из dataset не интерпретируется как HTML или инструкция модели.

## Алгоритмы B

- `applyGains`: max(0, min(current + gain, max_level, 5) - current); проверка диапазонов и дублей навыка.
- `simulateStep`: проверка кандидата у A, immutable переход, повторный вызов A с overlay.
- Planner: глубина ≤4, ширина ≤10, стабильный tie-break по ID, повтор только recurring.
- Fastest: минимальное число шагов до порога в найденных beam-путях; глобальная оптимальность
  ограниченного beam search не гарантируется.
- Balanced: 70% итоговой readiness + 30% среднего score A с коэффициентом 0.85 за каждый
  последующий шаг. Это функция выбора пути, она не меняет ranking weights A.
- Stretch: максимальная readiness среди допустимых найденных путей.
- План моделирует навыки; календарная совместимость нескольких сессий не утверждается.
- Ledger идемпотентен по requestId; preview отменяется при смене сотрудника или импорте.
- Дата состояния — snapshotDate. По умолчанию at — snapshotDate, реальное время можно
  передать в фабрику store извне для аудита; оно не участвует в scoring или планировании.

## Проверки

16 Vitest tests прошли, TypeScript без ошибок, production Next.js сборка стенда успешна.
В ограниченной Windows-среде Vite пытается выполнить необязательный `net use`; локальная
совместимость сообщает этому probe «недоступно». Компиляция TS выполняется в процессе,
тесты — worker threads. Эта настройка среды не меняет продуктовый код и не нужна обычному CI.

Кейсы: cap, immutability, rerank/HR subscription, double confirm, stale preview, atomic rollback,
игнорирование ledger ошибочным движком, invalid upload, гонка импортов, no history, no target,
bounded deterministic planner, completed/in-progress/mandatory exclusion, recurring,
fastest threshold, no candidates, snapshot sessions и делегирование A через bridge.

## Короткое сообщение команде

> A: готов B UI/store/simulation. Подключение через createIntelligenceAdapter; нужны реальные
> contracts и функции importer/recommendForEmployee. Ledger и overlay передаются отдельными
> полями, effective skills не нужно повторно проигрывать.
>
> C: используйте общий EmployeeStoreProvider и selectors selectEmployeeViews/selectLedger.
> После confirm они обновляются одним действием. Передайте baseline/explanationStatus в
> view mapping; исходный normalized source не содержит новых session completions.

Сообщение подготовлено для передачи пользователем; автоматически в чаты команды не отправлялось.

## Browser QA

На production-сборке стенда выполнено 3 последовательных прогона:
profile → evidence → balanced path → what-if → confirm → rerank. Каждый раз:
System Design 3 → 4, readiness 69% → 81%, один ledger event, завершённая активность
исчезает из карточек. Проверены no-target, missing-history, excluded reasons и invalid
four-file upload (предыдущий рабочий dataset сохраняется). Console errors не обнаружены.
Проверены viewport 1440×1000 и 390×844; горизонтального переполнения на mobile нет.
Все значения в этом QA относятся к синтетическому fixture, не к реальному датасету.

## Файлы изменений

```text
src/app/employee/page.tsx
src/components/employee/DatasetUpload.tsx
src/components/employee/EmployeeWorkspace.tsx
src/components/employee/Modal.tsx
src/components/employee/employee.module.css
src/domain/simulation/simulator.ts
src/domain/simulation/planner.ts
src/domain/simulation/ledger.ts
src/state/intelligenceAdapter.ts
src/state/createIntelligenceAdapter.ts
src/state/employeeStore.ts
src/state/EmployeeStoreProvider.tsx
src/state/HANDOFF.md
tests/simulation/.gitignore
tests/simulation/fixture.ts
tests/simulation/simulation.test.ts
tests/simulation/package.json
tests/simulation/package-lock.json
tests/simulation/prepare-standalone.mjs
tests/simulation/vitest.config.mjs
```
