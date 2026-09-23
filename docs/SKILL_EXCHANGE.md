# Skill Exchange — реализация и приёмка

## Что работает

`/chat` объединяет поиск наставника и личную переписку в согласованном интерфейсе
на RU/KK/EN. Переход `/chat?skill=SK_…&mentor=E…` выбирает навык и открывает запрос
допустимому доступному наставнику из результатов поиска.

- Поиск по навыку, отделу, роли и доступности. В карточке только имя, роль, грейд,
  effective-уровень выбранного навыка и доступность. История, вовлечённость,
  личные разрывы и внутренний score коллеги не выдаются.
- Кандидаты соответствуют требуемому уровню целевой роли после history replay.
  Ранжирование учитывает уровень, близость отдела/роли, готовность помогать и нагрузку;
  порядок детерминирован, сам сотрудник исключён.
- Личный переключатель доступности; явный отказ переопределяет исходное предположение
  из участия в менторских активностях. Сервер проверяет согласие при создании запроса.
- Запрос содержит наставника, навык, тему до 120 символов и первое сообщение.
  Сообщения — обычный текст до 2000 символов, без интерпретации HTML.
- Входящие, непрочитанные, история и ответы. Наставник принимает или отклоняет запрос;
  участник может закрыть его. В отклонённом или закрытом диалоге отправка недоступна.
- Опрос обновлений каждые 3 секунды, пока вкладка видима. Скрытие вкладки и unmount
  прерывают запрос; незавершённые опросы не накладываются друг на друга.

Локальный поиск коллег работает и для импортированного набора. Серверная переписка
использует только встроенный доверенный набор и выбранную demo identity: ID из
произвольного импорта не отправляются как получатели серверного чата.
Подзаголовок чата явно показывает signed demo persona. Переход в чат не сбрасывает
импортированный набор; выбранный локальный профиль не подменяет отправителя сообщений.

## Идентичность и приватность

Выбор синтетического сотрудника создаёт подписанную httpOnly SameSite-cookie.
Прикладная роль выводится из доверенного профиля; клиент не задаёт её самостоятельно.
Это **демо-идентификация**, которую в production необходимо заменить SSO.

Сервер допускает чтение и изменение диалога только его участниками. HR не получает
чужую переписку: отдельный endpoint возвращает только числовые агрегаты. Собственные
диалоги HR доступны на тех же условиях участия.

Запросы UI передают `X-Career-Identity`. Если cookie уже принадлежит другому профилю,
сервер отвечает `409 SESSION_CHANGED`; UI очищает личное содержимое и обновляет сессию.
Курсоры относятся к конкретному пользователю и не раскрывают чужую активность.

Обычные окна одного браузерного профиля разделяют cookie. Для демонстрации двух людей
нужны разные профили браузера или обычное и приватное окно.

## Хранение и запуск

Переписка, прочтение и доступность сохраняются в `data/runtime/messages.json`.
Сервер сериализует операции и атомарно заменяет файл; отсутствие файла означает пустое
состояние. Лимит — 20 сообщений в минуту на identity, включая первое сообщение запроса.
Перевход не обнуляет этот лимит.

Хранилище рассчитано на **один серверный процесс и демо-объёмы**. Файл переписки
отделён от in-memory ledger развития: карьерные подтверждения сохраняют прежнюю модель.
Ошибка runtime-хранилища возвращает понятное сообщение; независимые разделы приложения
продолжают работать.

```bash
pnpm install --frozen-lockfile
pnpm dev

# Production
pnpm build
pnpm start

# Docker
docker compose up --build
```

`pnpm start` и Docker запускают стандартный Next-сервер через bootstrap-скрипт.
Если `SESSION_SECRET` не задан, bootstrap создаёт отдельный ключ в
`data/runtime/session-secret`. Можно явно задать секрет длиной не менее 32 байт.
В dev ключ принадлежит процессу: после перезапуска нужно выбрать профиль снова;
сохранённые сообщения остаются в runtime-файле. Production bootstrap сохраняет ключ
на диске, поэтому перезапуск с тем же runtime-каталогом его не меняет.
Docker использует непривилегированного пользователя и writable named volume для runtime;
runtime-файлы исключены из build context. Значения секретов в документации не публикуются.

WebSockets, push-уведомления, вложения, редактирование и удаление сообщений,
шифрование переписки, OAuth и SQL-база не реализованы. Опрос сохраняет стандартный
Next/standalone запуск без собственного HTTP-сервера.

## Проверки

Автоматические проверки покрывают следующие критерии:

| Критерий | Проверка |
| --- | --- |
| Effective-уровень, target requirement, self-exclusion, детерминизм и распределение нагрузки | `tests/mentorship/search.test.ts` |
| Поиск для всех 33 критичных навыков каталога | Синтетические валидные requester-профили с существующими role requirements; у текущих сотрудников открытые критичные разрывы охватывают 29 навыков |
| Узкая карточка без истории и персональных разрывов | Domain/API tests и `tests/mentorship/suggestions.test.ts` |
| Сотрудник получает только свой профиль и историю; HR — организационный snapshot | `tests/mentorship/workspace-access.test.ts` |
| Подпись, срок жизни сессии, trusted HR role, cookie и stale identity | `tests/messaging/identity.test.ts`, `tests/messaging/api.test.ts` |
| Чужой тред закрыт, HR получает только агрегаты | `tests/messaging/api.test.ts` |
| Статусы, непрочитанные, plain text, consent и лимит отправки | `tests/messaging/api.test.ts` |
| Перезапуск, атомарная запись, concurrency, отказ и восстановление хранилища | `tests/messaging/store.test.ts` |
| RU/KK/EN gate, экранирование HTML, controls, identity header, видимость и остановка polling | `tests/chat/ui.test.ts` — 9 проверок |

**Итог объединения с PR #10/#11, 2026-09-23: 268/268 тестов в 32 файлах — PASS.**
Production build с полной проверкой TypeScript — PASS, Next.js 16.3.6, без предупреждений.
Прежний gate Skill Exchange 223/28 относится к версии до PR #10/#11.
Bootstrap — 7/7 локальных процессных сценариев с реальным identity-модулем и mock server.
Сборка включает `/chat` и identity/mentorship/messages routes;
предупреждений о whole-project tracing нет.
Проверки выполнены локально с адаптацией Windows-запуска без отключения тестов или
проверки типов. GitHub Actions не использовался.

Browser QA: двусторонняя переписка E0028 ↔ E0050 в независимых сессиях, принятие,
unread 1 → 0, буквальный plain text и сохранение после reload — PASS. HR E0014 видит
только собственный inbox и числовые агрегаты; чужие сообщения отсутствуют.
RU/KK/EN и mobile 375 px без overflow проверены; console errors/warnings — 0.
Доставка без ручного refresh отдельно не измерялась; visible polling покрыт unit-тестами.
Docker текущей версии не запускался.
Пересчёт на snapshot 2026-10-01 подтверждает 125 сотрудников и 188 пар
«сотрудник — критичный навык» без доступной сейчас активности с положительным
effective gain. Определение и ограничения метрики — в `EVALUATION.md`.

## Ручной сценарий приёмки

1. В первом профиле браузера выбрать сотрудника, открыть «Обмен навыками», навык
   и доступного наставника; отправить запрос.
2. Во втором профиле браузера войти под выбранным наставником. Убедиться, что запрос
   появился в пределах цикла опроса, прочитать, принять и ответить.
3. В первом профиле проверить ответ и непрочитанные, затем перезагрузить страницу.
   Перезапуск сервера с тем же runtime-каталогом также должен сохранить переписку.
4. Отправить строку с HTML и убедиться, что она показана текстом. Закрыть запрос;
   проверить недоступность отправки.
5. Под третьим сотрудником и HR проверить отказ на чужой thread URL; HR summary
   должен содержать только счётчики.
6. Проверить RU/KK/EN, узкий экран, остановку polling в скрытой вкладке и очистку
   личного содержимого при смене identity.

## Handoff для A и C

**A — Intelligence:** чистый поиск импортируется из `@/domain/mentorship`:

```ts
searchMentors(dataset: NormalizedDataset, query: {
  employeeId: string;
  skillId: string;
  department?: string;
  role?: string;
  mentorId?: string;
  availableOnly?: boolean;
  limit?: number;
}, options?: {
  availability?: Record<string, boolean>;
  activeLoad?: Record<string, number>;
}): MentorSearchResult

getDefaultMentorAvailability(dataset: NormalizedDataset, employeeId: string): boolean
```

`MentorSearchResult` содержит `skillId`, `requiredLevel`, `mentors`; поля карточки
ограничены `employeeId/fullName/role/grade/skillLevel/available`. Домен использует
существующие replay/target/gap функции A. `mentorId` позволяет проверить одного
кандидата до применения лимита, сохраняя eligibility и consent checks.

**C — API/Trust:** `requireSession(request)` из `@/lib/identity/http` возвращает
проверенную demo identity; `getIdentityDataset()` из `@/lib/identity` — trusted bundled
dataset. Действующий сотрудник определяется cookie, а не полем тела запроса.
`X-Career-Identity` защищает UI от записи от устаревшей персоны в общей cookie-сессии.
Клиент получает identity через `useIdentity()`; shared message/catalog types находятся
в `@/server/messaging/types`. HR использует `/api/messages/summary`, личная переписка —
participant-only `/api/messages/threads/**`. Серверные импорты в UI — только `import type`.

## Изменённые файлы после интеграции PR #10/#11

Сравнение с `f287b406a40028b3668646a27367270dde636a9f`: 31 изменённый и 42 новых файла.
Recommendation engine, общие core-контракты и `data/source` не менялись; runtime-файлы
в перечень не входят.

<details>
<summary>Полный перечень: 73 файла</summary>

```text
Изменены (31)
.dockerignore
.env.example
.gitignore
Dockerfile
README.md
docker-compose.yml
docs/ARCHITECTURE.md
docs/CONTRACTS.md
docs/DECISIONS.md
docs/EVALUATION.md
docs/INTEGRATION.md
docs/WORKSTREAMS.md
package.json
src/app/AppProviders.tsx
src/app/api/ai/review/route.ts
src/app/api/demo-dataset/route.ts
src/components/app/AppShell.tsx
src/components/app/app-shell.module.css
src/components/employee/DatasetUpload.tsx
src/components/employee/EmployeeWorkspace.tsx
src/components/employee/employee.module.css
src/components/employee/external-learning-section.module.css
src/components/employee/external-learning-section.tsx
src/components/hr/external-learning-section.tsx
src/domain/data/judge-import.ts
src/state/HANDOFF.md
tests/evaluation/route.test.ts
tests/evaluation/trust-workstream.test.ts
tests/external/external-learning-active-ui.test.ts
tests/external/external-learning.test.ts
tests/import/judge-import.test.ts

Добавлены (42)
docs/SKILL_EXCHANGE.md
scripts/start-demo.cjs
src/app/api/identity/people/route.ts
src/app/api/identity/session/route.ts
src/app/api/mentorship/availability/route.ts
src/app/api/mentorship/catalog/route.ts
src/app/api/mentorship/search/route.ts
src/app/api/messages/summary/route.ts
src/app/api/messages/threads/[id]/messages/route.ts
src/app/api/messages/threads/[id]/read/route.ts
src/app/api/messages/threads/[id]/route.ts
src/app/api/messages/threads/route.ts
src/app/api/messages/updates/route.ts
src/app/chat/page.tsx
src/components/chat/ChatWorkspace.tsx
src/components/chat/MentorSearch.tsx
src/components/chat/RequestDialog.tsx
src/components/chat/ThreadPanel.tsx
src/components/chat/api.ts
src/components/chat/chat.module.css
src/components/chat/copy.ts
src/components/chat/useChatInbox.ts
src/components/identity/IdentityProvider.tsx
src/components/identity/identity.module.css
src/components/mentorship/MentorSuggestions.tsx
src/components/mentorship/mentor-suggestions.module.css
src/domain/mentorship/index.ts
src/lib/identity/http.ts
src/lib/identity/index.ts
src/lib/identity/types.ts
src/server/messaging/api.ts
src/server/messaging/store.ts
src/server/messaging/types.ts
tests/chat/ui.test.ts
tests/import/identity-append.test.ts
tests/mentorship/search.test.ts
tests/mentorship/suggestions.test.ts
tests/mentorship/workspace-access.test.ts
tests/messaging/api.test.ts
tests/messaging/fixtures.ts
tests/messaging/identity.test.ts
tests/messaging/store.test.ts
```

</details>
