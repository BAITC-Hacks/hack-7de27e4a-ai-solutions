# Employee Digital Twin — handoff Манахнбета

**Текущая интеграция Skill Exchange (2026-09-23, решение 19):** AppProviders/AppShell
сохраняют UI на RU/KK/EN; `IdentityProvider` связывает signed demo identity и
`sharedEmployeeStore`. `/` и `/demo` ведут на `/employee`; `/chat` открывает наставников
и переписку. Demo Employee получает с сервера только свой профиль/историю, HR — полный
bundled dataset для аналитики. HR не читает чужие сообщения, доступны только агрегаты.

Карьерный ledger остаётся в памяти: demo snapshots восстанавливаются при выборе персоны,
импорт хранится отдельно, reload сбрасывает прогресс. Сообщения и production session-secret
сохраняются в `data/runtime`, исключённом из Git/Docker build context. В dev после перезапуска
нужно выбрать профиль снова. Demo persona не является SSO. Локальный поиск наставников
поддерживает импорт; server chat работает только со встроенным набором.

UI использует `/api/ai/explain` с ограниченным evidence и языком интерфейса;
IDs-only `/api/ai/review` разрешён для своего профиля или HR. `CareerQuestStore`, IndexedDB
и прежний XP-модуль не подключены к активным страницам; private Employee projection применяется сервером.

Исторический итог объединения с PR #10/#11: **268/268 тестов в 32 файлах — PASS**; production build
с полной проверкой TypeScript — PASS без предупреждений. Bootstrap — 7/7 локальных
процессных сценариев. Предыдущий gate Skill Exchange 223/28 остаётся историческим.
В браузере проверены двусторонняя переписка, принятие, unread/read, plain text,
RU/KK/EN, mobile 375 px без overflow, persistence чата после reload и HR privacy.
E0028 confirm 74% → 78%, HR completions 1045, возврат сохраняет 78% и ledger 1.
Подробности: `docs/INTEGRATION.md`.

На базе `main 0d068536` сохранены DevelopmentEconomy и HR Agent/participation.
Economy читает тот же normalized dataset/ledger; баллы за обязательные активности запрещены,
подтверждение учитывается один раз. Демо-обмен/вызовы/opt-out живут только на странице,
без реальной выдачи наград или передачи HR. HR Agent требует signed HR identity,
использует read-only tools и ограниченные projected facts. Новый общий gate фиксируется
в `docs/REQUIREMENTS_AUDIT.md`; результат 268 не относится к этому объединению.
117/14, 152/19 и 168/21 — исторические результаты; ранние проверки ниже относятся к потоку B.

PR #10 (отдельное внешнее обучение) и PR #11 (частичные judge-файлы) из `main f287b406`
объединены с текущим UI. Append сериализует текущий scoped normalized dataset;
committed skills/history сохраняются без повторного gain, новый импорт явно сбрасывает
ledger/preview/planner. Browser judge import: 200 → 203, +4 history, rejects 2;
J0001 открывается с readiness 58% и целью Product Manager Middle.

Реализован поток B: `/employee`, импорт четырёх файлов, профиль, Decision Lab,
evidence drawer, три стратегии планирования, what-if и журнал завершений.
Модуль подключён к реальным контрактам, импорту и движку A из `main` на коммите
`0a4b7c26eab1e4fa5087d642dc862c3dc7338087`. Изменения B ограничены его каталогами.
Корневые настройки, контракты, scoring и исходные данные команды не менялись.

## Запуск

Из корня репозитория:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Открыть `http://localhost:3000/employee`, выбрать четыре файла из `data/source`:
`employees.json`, `events.json`, `skills.json`, `activity_history.csv`.
Импорт проходит через настоящий `importCareerQuestDataset`, включая Zod-валидацию.
Файлы читаются в браузере, сетевой загрузки нет. Набор и прогресс живут в памяти
текущей вкладки; перезагрузка страницы сбрасывает сессию.

## Для A — Алихана

`src/state/realIntelligenceAdapter.ts` связывает B с публичным API A:

- `importCareerQuestDataset` — проверка и нормализация;
- `recommendForEmployee` — top-3, все кандидаты, target/gaps, readiness, evidence;
- `buildEffectiveEmployeeProfile` — исходный history replay;
- `evaluateEligibility` — допустимость, включая повторяемость событий.

`createIntelligenceAdapter` — типизированный мост. В B нет копии production scoring,
target resolution или history replay. `intelligenceAdapter.ts` содержит только типы
отображения и состояния B, канонические типы импортируются из `@/lib/contracts`.

`withSessionProgress` создаёт новую версию нормализованного состояния: заменяет вектор
на уже рассчитанный `after`, добавляет завершения в историю и сдвигает границу replay
до учтённой даты. Исходник сохраняется неизменным. Это предотвращает двойное начисление
старой истории и новых gains, сохраняя историю для engagement/eligibility A.
Для what-if используются временные overlay, в store они не записываются.

Реальный E0028: System Design **2 → 3** после replay EV006, повтор EV006 исключён.
Текущий движок A ставит первым **Leadership Foundations**: readiness **74% → 78%**.
После подтверждения первый кандидат — **Kubernetes in Practice**. Иллюстративные
значения из раннего playbook не подставляются вместо фактического результата A.

## Для C — Даника и интегратора

Использовать singleton `sharedEmployeeStore` из `src/state/sharedEmployeeStore.ts`.
`EmployeeStoreProvider` без параметров подключается к нему, `/employee` также
использует этот store. Общий provider уже установлен в AppProviders вокруг Employee/HR/Trust.
Для тестов поддерживается передача отдельного store через props.

Селекторы из `src/state/employeeStore.ts`:

| Селектор                  | Назначение                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `selectNormalizedDataset` | **Текущий** канонический `NormalizedDataset`, включая подтверждённый прогресс; вход HR/Trust analytics |
| `selectEmployeeViews`     | Актуальные effective skills, readiness и gaps всех сотрудников                                         |
| `selectLedger`            | Неизменяемый журнал подтверждений before/delta/after                                                   |
| `selectCurrentView`       | Выбранный профиль                                                                                      |
| `selectDataset`           | Неизменяемая UI-проекция импортированного набора                                                       |
| `selectNormalizedSource`  | Исходная версия набора для аудита, без session completions                                             |

Подписываться через `useEmployeeStore(selector)` под provider либо
`useStore(sharedEmployeeStore, selector)` из Zustand. HR не должен создавать свой
store или рассчитывать текущие агрегаты из `selectNormalizedSource`.
Подтверждение атомарно обновляет ledger, normalizedDataset и все employee views.
Ошибочный перерасчёт откатывает всю транзакцию. Тест проверяет подписку потребителя HR.

В `createRealIntelligenceAdapter(baselineProvider)` можно передать baseline C.
По умолчанию работает явно наивный weakest-skill comparator: минимальный уровень,
стабильный выбор добровольной активности, с показом причин исключения от A.
Карточки используют deterministic explanations A, badge отображает `explanationStatus`.
LLM verifier и страницы HR/Trust относятся к C и подключены через
`EmployeeStoreTrustBridge`; общие mode-кнопки не пересоздают store.

## Алгоритмы B

- Gains ограничены `maxLevel` и 5, не снижают текущий уровень; невалидные значения и
  дубликаты skill отклоняются. Preview не меняет dataset/ledger.
- Confirm заново проверяет кандидата через A, применяет immutable ledger и rerank.
  Повторный requestId не начисляет прогресс повторно. Смена сотрудника/импорт отменяют preview.
- Beam search: глубина ≤4, ширина ≤10, стабильный tie-break по ID; на каждом шаге
  повторно вызывается A. Повтор разрешён только для recurring-событий по правилам A.
- Fastest — самый короткий найденный путь до порога; глобальная оптимальность
  ограниченного beam search не гарантируется.
- Balanced — 70% итоговой readiness + 30% среднего score A с discount 0.85 по шагам.
- Stretch — максимальная итоговая readiness среди найденных допустимых путей.
- План моделирует рост навыков, не гарантирует совместимость расписаний.
- «Сегодня» — snapshotDate (`2026-10-01` в исходном наборе). Runtime clock не влияет
  на scoring или планы. Confirm фиксирует завершение на дате среза; внешний audit clock
  можно передать фабрике store.

## Исторические проверки потока B до общей интеграции

Проверено на полном коде и реальном наборе: **39 tests в 4 файлах прошли**,
включая 16 unit tests B, 6 интеграционных tests B и 17 tests A. TypeScript без ошибок.

Команды в локальной Windows-среде:

```text
node node_modules/typescript/bin/tsc --noEmit                         PASS
node --require <local-probe-shim> node_modules/vitest/vitest.mjs
  run --configLoader native --pool=threads                          39 PASS
```

Локальный shim отключает только необязательный Vite `net use` probe, который
блокируется средой. Стандартный `next build` компилирует приложение, но Windows sandbox
блокирует дочерний TypeScript-процесс (`spawn EPERM`). Сборка с worker threads и отдельно
выполненным typecheck прошла: Turbopack, prerender `/employee` и остальные страницы.
Настройки этого локального обхода не входят в репозиторий; обычный CI запускает
неизменённые `pnpm typecheck`, `pnpm test`, `pnpm build` из корневого workflow.

Интеграционные тесты проверяют импорт 200 сотрудников, 60 навыков, 40 событий и
2743 записей истории; совпадение top-3 с A; replay E0028; повторные подтверждения без
двойного replay; immutable source; актуальный canonical dataset для HR; три стратегии;
новый judge employee ID, Lead/no-history; ошибки настоящего Zod importer.
Unit tests покрывают cap, idempotency, stale preview, atomic rollback, import race,
нет цели/истории/кандидатов, исключённые/повторяемые события и детерминизм planner.

Browser QA на production-сборке: **3 полных прогона** реального E0028:
profile → evidence → balanced plan → what-if → confirm → rerank.
Каждый раз readiness 74% → 78%, ровно одна запись ledger, top-1 меняется с
Leadership Foundations на Kubernetes in Practice. План Balanced: 74% → 83%, 4 шага.
Ошибок browser console нет. Проверены desktop 1440×1000 и mobile 390×844.

## Изменённые файлы

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
src/state/realIntelligenceAdapter.ts
src/state/sharedEmployeeStore.ts
src/state/employeeStore.ts
src/state/EmployeeStoreProvider.tsx
src/state/HANDOFF.md
tests/simulation/.gitignore
tests/simulation/fixture.ts
tests/simulation/simulation.test.ts
tests/simulation/real-data.test.ts
```

Временный отдельный стенд ранней версии удалён: приложение использует корневые
package.json, lockfile, Next и Vitest команды общего проекта.

## Короткое сообщение команде

> A: B подключён к вашему importer/recommender, реальный E0028 и новые IDs проверены.
> Ranking/replay A не менялись. Граница интеграции — realIntelligenceAdapter.
>
> C: импортируйте sharedEmployeeStore и selectNormalizedDataset для analytics;
> selectEmployeeViews/selectLedger обновляются вместе после confirm. Общий provider
> использует этот же singleton. Baseline можно передать в createRealIntelligenceAdapter.

Сообщение предназначено для передачи пользователем; в чаты команды не отправлялось.
