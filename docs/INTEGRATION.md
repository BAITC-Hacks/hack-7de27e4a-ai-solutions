# Финальная интеграция Career Quest

## Активная архитектура — 2026-09-23

По выбору пользователя поверх `main ef90bc9` сохранён согласованный интерфейс на RU/KK/EN
(решение 18 в `docs/DECISIONS.md`).

- `/` и `/demo` перенаправляют на `/employee`: импорт четырёх файлов или кнопка
  «Посмотреть демо», профиль, рекомендации, evidence, what-if, план и подтверждения.
- `/hr` — HR-аналитика; `/trust` — «Проверка решений».
- `AppProviders` объединяет I18n, demo mode, `EmployeeStoreProvider`,
  `EmployeeStoreTrustBridge` и `AppShell`. Все страницы читают один `sharedEmployeeStore`.
- Dataset, выбранный профиль и immutable ledger находятся в памяти вкладки.
  Навигация и смена режима сохраняют их; перезагрузка сбрасывает сессию,
  новый импорт сбрасывает подтверждения прошлого набора.
- Две кнопки «Сотрудник» / «HR» открывают соответствующий кабинет. CTA
  «Перейти в режим HR» на `/hr` и `/trust` меняет режим на текущей странице.
- Общий переключатель RU/KK/EN сохраняет язык в браузере; UI и AI используют этот язык,
  независимо от `preferred_language` профиля.

Новые модули main сохранены. `CareerQuestStore`, IndexedDB, private Employee projection
и XP-модуль не подключены к активным страницам. HR bridge получает актуальные views,
исходную историю и ledger; подтверждения учитываются один раз. Trust проверяет текущий
`normalizedDataset`.

## AI boundary

### `/api/ai/explain` — текущие Employee и Trust

Принимает язык UI и ограниченные `candidates`: ID и структурированные числовые
evidence-факты (score, skill, readiness), в том числе для импортированного набора.
Контракт — `src/lib/evaluation/ai-contracts.ts`, клиент — `src/lib/evaluation/client.ts`.
Raw-профиль, имена, полная история и произвольные описания не передаются.
Zod и verifier проверяют ответ относительно присланных фактов и allowlist;
происхождение browser-import dataset сервером не подтверждается.
Ranking сохраняется; без ключа, при timeout или ошибке доступен deterministic fallback.

Защиты: Origin/cross-site и JSON checks, тело до 64 000 байт, чтение тела до 3 секунд,
20 запросов в минуту на процесс, до 4 одновременных запросов, provider timeout 100–3000 мс.

### `/api/ai/review` — сохранённый IDs-only контракт

Принимает только:

```text
employeeId + language + candidateIds[1..3] + completedActivityIds[0..32]
```

Сервер заново загружает trusted bundled dataset, переигрывает completion, запускает
deterministic engine и восстанавливает evidence. Модель возвращает только allowlisted
candidate/evidence IDs; пользовательский текст строится сервером.

Route имеет strict Zod schema, 4 KB body cap, same-host Origin check, exact JSON MIME,
deployment rate/concurrency bounds и timeout. Provider URL допускает HTTPS либо localhost HTTP,
redirects/cache запрещены, upstream body ограничен 128 KB. Без ключа и при любой ошибке остаётся
полный deterministic result.

Этот API реконструирует bundled dataset на сервере и сохранён отдельно от
bounded-evidence контракта текущего UI.

## Фактическая проверка объединения — 2026-09-23

- **168/168 тестов в 21 файле — PASS.**
- **Production build с полной проверкой TypeScript — PASS**, Next.js 16.3.6.
- Сборка включает `/`, `/demo`, `/employee`, `/hr`, `/trust`,
  `/api/ai/explain`, `/api/ai/review` и `/api/demo-dataset`.
- Browser smoke: `/demo` → `/employee`, demo с 200 профилями, HR CTA остаётся на `/hr`,
  возврат Employee сохраняет профиль, HR labels переключаются RU/EN/KK,
  no-key объяснение доступно на RU и ranking сохранён; ошибок console нет.

Локальные Windows-проверки выполнены с адаптацией запуска процессов без отключения
TypeScript или тестов. Стандартные команды: `pnpm test`, `pnpm typecheck`, `pnpm build`.

Исторические результаты: 117 тестов в 14 файлах и сборка относятся к согласованному UI
до объединения; 152 теста в 19 файлах, сборка и Docker smoke — к PR #6
(`codex/career-quest-release`). Они не являются итогом нынешнего объединения.
Мобильный интерфейс, стрелки и progress проверены до объединения.

## Ограничения

- Режимы «Сотрудник» / «HR» — явный hackathon role switch, не production RBAC.
  Перед реальными данными нужны SSO/RBAC и audit log, включая защиту прямых URL.
- Активный ledger не сохраняется между перезагрузками или устройствами.
- `/api/ai/explain` подтверждает согласованность ответа с evidence, а не достоверность
  импортированных фактов. Лимит запросов действует в одном серверном процессе.
- Docker smoke PR #6 исторический; объединённая версия отдельно в Docker не проверялась.
- Live платный LLM не вызывался; success, invalid output, outage, timeout, endpoint hardening и
  no-key проверены mock transport и настоящим локальным route.
- GitHub Actions ранее не стартовал из-за billing lock организации; локальный PASS не означает,
  что внешний CI runner доступен.

## Команде

- Intelligence API: `recommendForEmployee(dataset, employeeId)`.
- Shared UI state: `sharedEmployeeStore` и `useEmployeeStore`; не создавать второй runtime store.
- Server dataset: `loadBundledDataset()` из `src/domain/data/server.ts`.
- HR: `projectEmployeeStore(snapshot)` → `selectHRAnalytics(input)`.
- Trust: `createDatasetAuditCases(snapshot.normalizedDataset)`.
- Current AI UI: `src/lib/evaluation/client.ts` → `/api/ai/explain`.
- Сохранённый IDs-only клиент: `requestBoundedAiReview(...)` → `/api/ai/review`.
