# Финальная интеграция A + B + C

## Что подключено

- `/` перенаправляет на единственный кабинет `/employee`.
- `src/app/AppProviders.tsx` монтирует EmployeeStoreProvider и EmployeeStoreTrustBridge
  с одним экземпляром sharedEmployeeStore над всеми маршрутами.
- AppShell задаёт общую навигацию, тему и переключатель «Режим демо». Employee, HR и Trust
  используют Next Link: импорт, выбранный профиль и ledger сохраняются между разделами.
- Режим employee скрывает HR-аналитику; режим HR открывает агрегаты и Trust. Это UI-демо
  на синтетических данных, не серверная аутентификация.
- HR использует актуальные views и исходную history + session ledger. Новые завершения
  учитываются ровно один раз. Trust audit получает текущий normalizedDataset.
- Employee немедленно отображает детерминированные рекомендации A, затем получает
  объяснение через `/api/ai/review`. В запросе только разрешённые activity IDs и пять
  числовых факторов top-3; profile/history/description не отправляются. Ranking не меняется.
- Клиент и сервер проверяют AI-ответ. Без ключа, при ошибке/таймауте/неверном ответе
  сохраняются объяснения A. При смене профиля, импорте или confirm старый запрос отменяется,
  а запоздалый ответ игнорируется.

## Запуск

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Открыть http://localhost:3000 и загрузить четыре файла из `data/source/`.
Для `/hr` и `/trust` выбрать HR в «Режим демо» в верхней панели.

Стандартные команды проверки:

```sh
pnpm typecheck
pnpm test
pnpm build
```

Docker без ключа: `docker compose up --build`.
Для опциональной конфигурации в `.env.local`: `docker compose --env-file .env.local up --build`.

## Фактическая проверка

На интегрированном коде:

- TypeScript `--noEmit`: PASS.
- Vitest: **94/94 в 12 файлах**: исходные tests A/B/C + 5 shared-state integration tests
  и 6 tests асинхронного объяснения (privacy, allowlist, outage, no-key, timeout, stale response).
- Полная Next 16.3.6 production-сборка: PASS, включая TypeScript 7.0.2, prerender и AI route.
- В браузере три цикла E0028: evidence → balanced plan → what-if → confirm → HR → Trust
  → Employee. Readiness 74% → 78% → 79% → 81%; ledger 0 → 1 → 2 → 3;
  добровольные завершения HR 1044 → 1045 → 1046 → 1047. Профиль E0028 сохраняется.
- Trust audit после подтверждений: 33 checks, 0 failures. Отдельно проверен no-key AI route.
- Режим employee скрывает HR; пустой набор показывает загрузку. Главная открывает кабинет.
- Проверены desktop 1440×1000 и mobile 390×844; в браузере нет console errors.

### Особенность локальной Windows-среды

Обычные дочерние stdio pipes запрещены средой выполнения. Для тестов локальный shim
отключает только необязательный Vite probe `net use`. Vitest запускается с
`--configLoader native --pool=threads`.

Для полной сборки локальный helper использует Next worker threads, а stdout/stderr
TypeScript CLI передаёт через временные файлы. `useTypeScriptCli=true`,
`ignoreBuildErrors=false`: проверки типов не пропускаются. Helper находится вне репозитория
и не меняет node_modules или production config. Команды фактического прогона:

```text
node node_modules/typescript/bin/tsc --noEmit
node --require <local Windows probe shim> node_modules/vitest/vitest.mjs run --configLoader native --pool=threads
node <local build-with-full-typecheck.cjs>
```

GitHub Actions заблокирован до назначения runner: runner_id=0, steps=[], нет логов.
Пользователь подтвердил сообщение Annotations: «The job was not started because your
account is locked due to a billing issue.» По его решению интеграция проверяется локально;
дальнейшие проверки CI не выполняются. Успешный локальный прогон не означает зелёный CI.

## Ограничения

- Полная перезагрузка/новая вкладка начинает новую сессию. Клиентская навигация внутри приложения сохраняет её.
- Нет OAuth, базы данных, публичных рейтингов или автоматического повышения грейда.
- Planner ограничен beam width 10/depth 4 и не проверяет совместимость календарных сессий.
- Проверенные числа grounding относятся к конкретным тестовым утверждениям; accuracy карьерных прогнозов не заявляется.
- Платный LLM в QA не вызывался. Проверенный ответ и сбои тестировались mock transport; no-key — через настоящий route в браузере.
- Docker daemon на локальном хосте недоступен; контейнер здесь не запускался.

## Команде

A: scoring/replay/contracts сохранены. B/C получают одно актуальное состояние.
Для новых проверок используйте `selectNormalizedDataset`, не исходную UI-проекцию.

B/C: общий provider уже установлен в layout. Не создавайте новый store в странице.
Между маршрутами используйте Next Link. `normalizedDataset` предназначен для текущего
audit; HR adapter складывает ledger только с исходной history.

Изменения интеграции: root layout/page/providers/theme; AppShell; EmployeeWorkspace,
AI hook/helper; Surface, Trust bridge и shared theme HR; store-adapter current dataset type;
пояснение audit scope; integration/AI tests; README и handoff-документация.
