# Даник: агент HR и участие в развитии

Основа: main `aa451996b933be4978320ddb646689dc21228c8a`.
Ветка: `feat/danik-hr-trust`. Реализованы функции 1 и 3 из advanced features.
Изменения ограничены каталогами потока C; зависимости и формулы scoring сохранены.

## Подключение

Существующий `AppProviders` уже связывает Employee, HR и Trust с одним store B.
`EmployeeStoreTrustBridge` передаёт ссылку на его текущий снимок в `agentSnapshot`.
Инструменты читают этот снимок; повторного импорта или копии `NormalizedDataset` нет.
После изменения данных старый ответ помечается устаревшим, активный запрос отменяется.
Подтверждения Employee учитываются через текущие views/normalizedDataset/ledger.

Агент выполняет `getGaps`, `getRecommendations`, `findEmployees`, `getSkillCoverage`,
`getCatalogGaps`, `simulate`. Zod проверяет аргументы, затем локальные обёртки проверяют
существование ID до вызова функций A/B. JSON Schema для OpenAI генерируется из тех же
Zod-схем. `simulate` только вычисляет прогноз; ranking и store не изменяются.

Цикл управляется браузером: не более 5 инструментов и 30 секунд на весь запрос.
После пятого инструмента допустим последний вызов модели для ответа без новых tools.
`POST /api/ai/agent` обслуживает один шаг. Клиент сохраняет полный журнал с
`tool:N:toolName` evidence IDs. Каждый шаг разворачивается в факты и аргументы.
`GET /api/ai/agent` сообщает лишь доступность конфигурации, не подтверждает баланс API.

В модель идут вопрос HR, ID, названия типов метрик и числа. Автоматически не передаются
имена, профили, строки истории, заголовки или описания событий. Коды ролей отображаются
локально; для фильтра поиска модель использует `ROLE_001` и аналогичные коды.

## Grounded и strict

Strict review топ-3 сохраняет прежний verifier. Новый grounded разрешает свободный текст
модели, проверяя числовые значения и идентификаторы по полученным tool results.
Дополнительно проверяются структурированные claims: evidence, субъект, метрика, число,
навык и активность должны совпадать с конкретным фактом. Клиент повторяет проверку
по журналу фактически выполненных локальных инструментов.

При неподтверждённом числе/ID, ошибке, таймауте или лимите шагов отображается причина
и детерминированная сводка уже полученных фактов. Свободный текст не исполняется как HTML.
Проверка чисел/ссылок не доказывает смысл каждого предложения или причинные выводы;
это ограничение grounded, а не обещание отсутствия любых галлюцинаций.

## Участие за 6 или 12 месяцев

`selectDevelopmentDropoutReport(input, {months: 6 | 12})` — чистая функция.
Срез берётся из `input.snapshotDate`, по умолчанию `2026-10-01`. Текущий период
включает день снимка для подтверждений текущей сессии; предыдущий заканчивается перед
началом текущего. Календарные границы вычисляются без системного времени.

- Self, manager и HR считаются отдельно.
- В обсуждаемый список включают только `no_show`, `dropped`, `declined` необязательных
  активностей. Отсутствие истории и обязательные процессы сами по себе туда не ведут.
- `overdue` и обязательные активности представлены отдельно.
- Показаны сравнение с предыдущим периодом, наблюдаемые факты и предложение разговора.
- Сортировка по ID; вероятности ухода и рейтинга сотрудников нет.
- Некорректные, отсутствующие и будущие даты исключаются с явными счётчиками.
- UI доступен только в демо-режиме HR. Это граница отображения, не production auth.

Карточки свёрнуты, список прокручивается; фильтр роли сохраняет snapshotDate.

## Запуск

В `.env.local` на сервере нужны `LLM_API_KEY`, `LLM_BASE_URL=https://api.openai.com/v1`,
`LLM_MODEL=gpt-4.1-mini`, `LLM_TIMEOUT_MS=8000`. Ключ в Git не добавляется.
Без ключа AI-панель отключена с понятным статусом, HR-аналитика продолжает работать.
После настройки переменных перезапустите Next.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

### Проверки в текущей Windows-среде

Использованы зависимости из lockfile: Next 16.3.5, TypeScript 7.0.2, Vitest 5.0.1,
Node 24.21.0. Репозиторий/CI ориентирован на Node 22.

`pnpm typecheck` проходит. Все **144 теста в 17 файлах** прошли командой ниже.
Обычный `pnpm test` здесь блокируется системным probe
`net use` с `spawn EPERM` до запуска тестов. Поддерживаемая альтернативная команда:

```sh
pnpm test --config tests/evaluation/vitest.windows.config.mts --configLoader native
```

Конфигурация использует preserveSymlinks и worker threads, запускает весь набор тестов.
Обычный `pnpm build` компилирует приложение, но sandbox запрещает дочерний процесс
проверки TypeScript. Полная production-сборка и prerender выполнены в временной копии
реального приложения с теми же зависимостями и AppProviders: workerThreads/cpus=1,
проверка типов отдельной успешной командой. `ignoreBuildErrors` применялся только в
временном стенде после отдельного typecheck; конфигурация репозитория не ослаблена.

Браузер: импорт 200 сотрудников/40 активностей/60 навыков/2743 строк истории;
переключение 6/12 месяцев (83/124 сотрудника, 124/244 негативных исхода);
скрытие HR от режима Employee; подтверждение активности с переносом в HR/Trust;
Trust — 33 проверки, 0 ошибок, 438 рекомендаций и 4486 уровней replay.
Это результаты заданного набора, не универсальная accuracy.

Реальный OpenAI strict review: verified, около 4.2 секунды.
Реальный агент: `getGaps` + `getRecommendations`, свободный ответ на kk — verified,
6.187 секунды, 52 и 15 фактов в журнале. Другой ответ с неподтверждённым числом был
заблокирован; вместо него показана сводка фактов, как предусмотрено контрактом.
На узком экране ширина документа совпадает с viewport (375 px), переполнения нет.
Карточки участия свёрнуты; факты и действия доступны при раскрытии.

GitHub Actions последнего main запускался с failure до выполнения шагов (steps=[]).
Доступные логи не установили причину. Billing из PDF не подтверждён независимо;
локальные результаты не означают зелёный GitHub CI.

## Передача команде

A: инструменты импортируют существующие функции рекомендаций; scoring, hard filters,
ranking и shared contracts не менялись. Skill coverage использует текущую роль/грейд.

B: существующий AppProviders достаточен. После confirm bridge автоматически обновит
HR/dropout/agent snapshot. Дополнительный store и действия записи не нужны.

Проверка демо: загрузить четыре файла `data/source` в Employee, выбрать сотрудника,
переключить режим HR, открыть HR-аналитику и нажать вопрос про разрывы и рекомендации.
Менторство и общая локализация приложения — отдельные потоки advanced-документа.

## Изменённые файлы

- `src/components/hr/dashboard.module.css`
- `src/components/hr/DropoutPanel.tsx`
- `src/components/hr/HRAgentPanel.tsx`
- `src/components/hr/HRDashboard.tsx`
- `src/components/trust/EmployeeStoreTrustBridge.tsx`
- `src/components/trust/integration.tsx`
- `src/domain/analytics/core-adapter.ts`
- `src/domain/analytics/dropout.ts`
- `src/domain/analytics/index.ts`
- `src/domain/analytics/store-adapter.ts`
- `src/domain/analytics/types.ts`
- `src/app/api/ai/agent/provider.ts`
- `src/app/api/ai/agent/route.ts`
- `src/app/api/ai/agent/service.ts`
- `src/lib/evaluation/ADVANCED_HANDOFF.md`
- `src/lib/evaluation/agent-client.ts`
- `src/lib/evaluation/agent-contracts.ts`
- `src/lib/evaluation/agent-grounding.ts`
- `src/lib/evaluation/agent-tools.ts`
- `src/lib/evaluation/HANDOFF.md`
- `tests/evaluation/agent-client.test.ts`
- `tests/evaluation/agent-grounding.test.ts`
- `tests/evaluation/agent-server.test.ts`
- `tests/evaluation/agent-tools.test.ts`
- `tests/evaluation/dropout.test.ts`
- `tests/evaluation/vitest.windows.config.mts`

