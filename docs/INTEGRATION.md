# Финальная интеграция Career Quest

## Активная архитектура — 2026-09-23

Текущий этап — объединение Skill Exchange с `main 0d068536`: сохранены внешнее обучение,
judge import, DevelopmentEconomy и HR Agent/participation. Предыдущий gate на базе
`f287b406`: 268/268 тестов в 32 файлах и production build с полным TypeScript — PASS;
это исторический результат до последних новых модулей. Актуальная матрица требований:
[`REQUIREMENTS_AUDIT.md`](REQUIREMENTS_AUDIT.md).

Согласованный интерфейс на RU/KK/EN сохранён; добавлен Skill Exchange и подписанная
демо-идентификация (решения 18–19 в `docs/DECISIONS.md`).

- `/` и `/demo` перенаправляют на `/employee`: импорт четырёх файлов или кнопка
  «Посмотреть демо», профиль, рекомендации, evidence, what-if, план и подтверждения.
- `/hr` — HR-аналитика; `/trust` — «Проверка решений»; `/chat` — поиск наставников и переписка.
- `AppProviders` объединяет I18n, `IdentityProvider`, demo mode, `EmployeeStoreProvider`,
  `EmployeeStoreTrustBridge` и `AppShell`. Карьерные страницы используют один `sharedEmployeeStore`.
- `/api/demo-dataset` проверяет подписанную identity: Employee получает только собственный
  профиль и историю, HR — полный bundled dataset для аналитики. Прикладная роль выводится
  из доверенных данных. Выбор синтетической персоны является демо-идентификацией, не SSO.
- Dataset и immutable ledger развития находятся в памяти вкладки. При повторном выборе
  demo-персоны snapshots восстанавливают доступный ей прогресс; HR видит подтверждения
  demo-профилей. Импорт и его ledger отделены от demo; перезагрузка сбрасывает оба.
- Две кнопки «Сотрудник» / «HR» открывают кабинет; при отсутствии HR identity
  переключение и CTA на `/hr`/`/trust` предлагают выбрать HR-профиль.
- Общий переключатель RU/KK/EN сохраняет язык в браузере; UI и AI используют этот язык,
  независимо от `preferred_language` профиля.

Новые модули main сохранены. `CareerQuestStore`, IndexedDB и старый XP-модуль не подключены
к активным страницам; private Employee projection применяется сервером при выдаче demo dataset.
HR bridge получает актуальные views,
исходную историю и ledger; подтверждения учитываются один раз. Trust проверяет текущий
`normalizedDataset`.

Активный `DevelopmentEconomy` использует этот же dataset/ledger и исключает mandatory;
balance не учитывает подтверждение дважды. Обмен, вызовы и opt-out локальны странице,
сбрасываются при уходе или новом импорте; реальная выдача наград и HR-синхронизация отсутствуют.
Participation показывает фактические 6/12 месяцев и инициатора участия, без churn prediction.
HR Agent использует шесть read-only tools и максимум 5 вызовов; сервер требует signed HR,
проверяет Origin/JSON/body deadline/rate/concurrency. Клиент повторно ground-checks числа
по tool receipts; происхождение клиентского snapshot сервер не восстанавливает.

## Skill Exchange и persistence

Чат использует серверный bundled dataset и подписанную cookie. Локальный поиск
наставников доступен для browser import; его ID не превращаются в получателей server chat.
Каждый запрос чата привязан к отображаемой identity заголовком `X-Career-Identity`;
при `SESSION_CHANGED` личное содержимое очищается. Сервер ограничивает thread API
его участниками; HR получает по чужой переписке только числовые агрегаты.

Сообщения, прочтение и доступность сохраняются атомарно в `data/runtime/messages.json`.
Опрос идёт раз в 3 секунды только в видимой вкладке. Лимит — 20 сообщений в минуту
на identity, текст — до 2000 символов. JSON-store рассчитан на один процесс.

`pnpm start`/Compose сохраняют автоматически созданный ключ подписи в
`data/runtime/session-secret`; Compose использует runtime volume. Каталог исключён
из Git и Docker build context. Dev-ключ меняется при перезапуске процесса — нужен
повторный выбор профиля. Детальная приёмка: [`SKILL_EXCHANGE.md`](SKILL_EXCHANGE.md).

## Импорт и внешнее обучение из PR #10/#11

- `src/domain/data/judge-import.ts` определяет типы, объединяет частичные наборы
  и формирует сводку; итог проходит обычный importer A. UI использует текущий доступный
  normalized dataset, не загружает полный организационный набор в обход employee identity.
  Фикстуры находятся в `fixtures/judge`; основной сценарий — профили плюс история.
- Сериализация базы берёт свежий `normalizedDataset`, включая уже подтверждённые навыки
  и историю. Новый импорт сбрасывает ledger/preview/planner с явным предупреждением;
  повторного применения gain нет. Ошибка полной валидации не меняет действующий набор.
  Повреждённый CSV и дубликаты входящих profile ID отклоняются; невалидное обновление
  строки истории не удаляет прежнюю валидную запись. Добавлены 7 регрессионных тестов
  совместимости поверх тестов PR #11.
- `src/domain/external` загружает курируемый offline-каталог `data/external_courses.json`.
  35 записей; Employee раскрывает блок «Внешние курсы» с первыми 3 непокрытыми навыками
  и до 3 курсов на навык. По умолчанию блок свёрнут.
  Порядок: level fit → язык профиля → бесплатность → длительность → ID.
  HR показывает только агрегаты аудитории всей организации; при role-фильтре блок скрыт.
  UI локализован, названия курсов остаются исходными. Ranking A, readiness и ledger
  от внешних курсов не меняются. Runtime не вызывает provider API и не делает scraping.
- Ссылка открывается по клику с `noopener noreferrer`; profile upload провайдеру,
  запись на курс и оплата не реализованы. Free/paid — статическая метка без точной цены.
- Ссылки внешнего каталога проходят HTTPS/domain allowlist и валидацию skill references.
  Неизвестная taxonomy локального импорта может отключить необязательный внешний блок;
  внутренние рекомендации остаются работоспособными.

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
Подписанная identity разрешает Employee запрос только для себя; HR может запрашивать
профили организационного набора.

Route имеет strict Zod schema, 4 KB body cap, общий Origin check с APP_ORIGIN/Host+protocol, exact JSON MIME,
deployment rate/concurrency bounds и timeout. Provider URL допускает HTTPS либо localhost HTTP,
redirects/cache запрещены, upstream body ограничен 128 KB. Без ключа и при любой ошибке остаётся
полный deterministic result.

Этот API реконструирует bundled dataset на сервере и сохранён отдельно от
bounded-evidence контракта текущего UI.

## Историческая проверка объединения с PR #10/#11 — 2026-09-23

- **268/268 тестов в 32 файлах — PASS**, финальный прогон 17:28:32.
- **Production build с полной проверкой TypeScript — PASS**, Next.js 16.3.6,
  после объединения, без предупреждений.
- Сборка включает `/chat` и новые identity/mentorship/messages API вместе с прежними маршрутами;
  предупреждение whole-project tracing устранено.
- Bootstrap: **7/7 локальных процессных сценариев — PASS**, включая сохранение/повторное
  использование ключа, явную конфигурацию, неверный ключ и недоступное runtime-хранилище.
  Проверка использует реальный identity-модуль и mock server, Docker не заменяет.
- Browser: запрос E0028 → E0050 создан и принят, ответ E0050 → E0028 получен,
  unread 1 → 0, plain text и сохранение переписки после reload проверены.
- HR E0014 получает пустой собственный inbox и числовую сводку без чужих сообщений.
- UI RU/KK/EN проверен; исходный текст сообщений сохраняет язык автора.
  На mobile 375 px ширина содержимого 375 px, горизонтального overflow нет.
- E0028 confirm: readiness 74% → 78%; HR voluntary completions — 1045;
  возврат к E0028 сохраняет readiness 78% и одну запись ledger.
  Последние console errors/warnings: 0.
- Judge import browser: HR-база 200 → 203 профиля, +4 history, 2 отклонённые строки
  с ID/номером/локализованными причинами; CTA открывает J0001 с readiness 58%,
  целевой ролью Product Manager и грейдом Middle.
- Chat → Employee сохраняет импорт 203/J0001. Автор в чате явно соответствует signed
  demo identity; импортированный профиль не становится отправителем серверных сообщений.
  Reload возвращает доступный demo-набор, как предусмотрено моделью in-memory импорта.
- Видимость/abort polling проверены unit-тестами; доставку UI без ручного refresh
  отдельным end-to-end измерением не подтверждали.
- Docker текущей версии не запускался; CI не использовался.

Локальные Windows-проверки выполнены с адаптацией запуска процессов без отключения
TypeScript или тестов. Стандартные команды: `pnpm test`, `pnpm typecheck`, `pnpm build`.

Исторические результаты: 117/14 — согласованный UI до объединения, 152/19 и Docker smoke —
PR #6, 168/21 — объединение UI поверх `ef90bc9`, 223/28 — Skill Exchange до PR #10/#11. Ранние browser checks
Employee/HR/Trust, мобильного интерфейса и стрелок относятся к этим предыдущим этапам.

## Ограничения

- Роль и доступ проверяются сервером, но синтетическую persona можно свободно выбрать.
  Это демо-идентификация; перед реальными данными нужен корпоративный SSO и audit log.
- Активный ledger не сохраняется между перезагрузками или устройствами.
- Чат сохраняется в серверном JSON-файле; нет push, вложений, редактирования/удаления
  сообщений и шифрования переписки. Обычные вкладки делят cookie; для двух identities
  нужны отдельные браузерные профили или приватное окно.
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
- Demo identity: `useIdentity()`; серверные API вызывают `requireSession()`.
- Mentor search: `searchMentors()`; shared chat types — `src/server/messaging/types.ts`.
- Server dataset: `loadBundledDataset()` из `src/domain/data/server.ts`.
- HR: `projectEmployeeStore(snapshot)` → `selectHRAnalytics(input)`.
- Trust: `createDatasetAuditCases(snapshot.normalizedDataset)`.
- Current AI UI: `src/lib/evaluation/client.ts` → `/api/ai/explain`.
- Сохранённый IDs-only клиент: `requestBoundedAiReview(...)` → `/api/ai/review`.
