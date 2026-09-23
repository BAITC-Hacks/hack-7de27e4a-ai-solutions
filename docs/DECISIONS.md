# Журнал решений

Одна строка на решение. Заполняется **в момент** принятия, а не в конце.
Нужен для двух вещей: чтобы три Codex-сессии не разъехались, и чтобы в README не оказалось
утверждений, которых никто не проверял.

| # | Время | Решение | Кто | Последствие для других потоков |
|---|---|---|---|---|
| 1 | pre-hack | Стек: Next.js + TS + Zod + Zustand + Recharts + Vitest, pnpm, Node 22 | команда | зафиксирован, после старта не обсуждается |
| 2 | pre-hack | Без серверной БД: Zustand + immutable ledger | команда | серверная persistence вне scope; решение о browser persistence уточнено ниже |
| 3 | pre-hack | Snapshot date `2026-10-01` как «сегодня» | команда | `new Date()` в домене запрещён |
| 4 | pre-hack | Имена веток по владельцам: `feat/alihan-intelligence`, `feat/manahnbet-digital-twin`, `feat/danik-hr-trust` | Алихан | вариант из playbook (`feat/intelligence-engine` и т.п.) отменён |
| 5 | pre-hack | Демо-история E0028 строится на CLOUD/CONTAINERS/DATA_VIZ vs критичный SYSTEM_DESIGN | Алихан | у E0028 нет разрыва по Public Speaking — см. `docs/DATASET.md` §6 |
| 6 | 2026-09-23 | PR #3 `codex/career-quest-experience` закрыт как дубль потока B | Алихан | вторая реализация Digital Twin; влитый PR #2 остаётся единственным. Ветка не удалена |
| 7 | 2026-09-23 | Из PR #3 забрать только `src/domain/data/server.ts` (18 строк) отдельным PR | Алихан | предзагрузка датасета с сервера ДОПОЛНЯЕТ загрузку через UI, не заменяет её — жюри грузит свои профили |
| 8 | 2026-09-23 | CI переводим на ручной запуск | Алихан | аккаунт организации заблокирован по биллингу, Actions не стартуют; воспроизводимость доказываем выводом `pnpm test`/`pnpm build` в README |
| 9 | integration | Completion ledger сохраняется в IndexedDB; SQL остаётся вне scope | Манахнбет | прогресс переживает refresh, но не синхронизируется между устройствами |
| 10 | integration | Демо-разграничение сделано отдельными Employee / Demo / HR / Trust routes | Алихан | Employee server-bound и получает минимизированный payload; arbitrary profiles только в Demo; это не production auth |
| 11 | integration | LLM возвращает только allowlisted candidate/evidence IDs; evidence восстанавливает, а текст рендерит сервер | Даник | клиентский текст/PII не попадает к provider; без ключа, при timeout или invalid response сохраняется deterministic result |
| 12 | hardening | IndexedDB ledger namespaced контентным fingerprint dataset и использует общий hydration promise | Манахнбет | импорт не загрязняется чужим прогрессом; быстрый переход routes не теряет replay |
| 13 | hardening | Same-day replay сохраняет фактический insertion order, completion ID начинается с sequence | Алихан | `max_level` не меняет смысл двух последовательных completion |
| 14 | hardening | External critic работает только с bundled server dataset; browser-import остаётся deterministic | Даник | исключено объяснение на evidence от другого dataset |
| 15 | hardening | Без production identity применяется bounded deployment-wide rate limit | Даник | caller-controlled proxy headers не обходят лимит; O(1) память |
| 16 | hardening | Private employee projection использует canonical fingerprint полного snapshot | Манахнбет | completion виден HR/Trust после replay, но org dataset не сериализуется Employee route |
| 17 | release | Hardened experience перенесён новым PR поверх актуального `main`; закрытый PR #3 не переиспользуется | Алихан | сохраняются main-only артефакты, каноническими становятся role-scoped routes и ID-only critic |
| 18 | 2026-09-23 | По выбору пользователя поверх `main ef90bc9` сохраняем согласованный локальный UI на RU/KK/EN, AppProviders/sharedEmployeeStore и in-memory ledger; `/` и `/demo` ведут на `/employee` | пользователь / интегратор | решения 9, 10, 12, 14, 16 и 17 уточнены для активных страниц: IndexedDB/private projection/XP остаются отдельными модулями; текущий UI использует bounded-evidence `/api/ai/explain`, а IDs-only `/api/ai/review` сохраняется отдельно; нужен новый общий test/build gate |

## Изменения общего контракта

Отдельно и обязательно: любое изменение `src/lib/contracts/**` после 00:20.

| Время | Что изменилось | Кто | Кого предупредил |
|---|---|---|---|
| | | | |
