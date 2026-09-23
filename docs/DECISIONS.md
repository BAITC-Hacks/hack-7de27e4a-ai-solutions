# Журнал решений

Одна строка на решение. Заполняется **в момент** принятия, а не в конце.
Нужен для двух вещей: чтобы три Codex-сессии не разъехались, и чтобы в README не оказалось
утверждений, которых никто не проверял.

| # | Время | Решение | Кто | Последствие для других потоков |
|---|---|---|---|---|
| 1 | pre-hack | Стек: Next.js + TS + Zod + Zustand + Recharts + Vitest, pnpm, Node 22 | команда | зафиксирован, после старта не обсуждается |
| 2 | pre-hack | Без БД: Zustand + immutable ledger | команда | persistence не реализуем, в README — честно |
| 3 | pre-hack | Snapshot date `2026-10-01` как «сегодня» | команда | `new Date()` в домене запрещён |
| 4 | pre-hack | Имена веток по владельцам: `feat/alihan-intelligence`, `feat/manahnbet-digital-twin`, `feat/danik-hr-trust` | Алихан | вариант из playbook (`feat/intelligence-engine` и т.п.) отменён |
| 5 | pre-hack | Демо-история E0028 строится на CLOUD/CONTAINERS/DATA_VIZ vs критичный SYSTEM_DESIGN | Алихан | у E0028 нет разрыва по Public Speaking — см. `docs/DATASET.md` §6 |
| 6 | | | | |

## Изменения общего контракта

Отдельно и обязательно: любое изменение `src/lib/contracts/**` после 00:20.

| Время | Что изменилось | Кто | Кого предупредил |
|---|---|---|---|
| | | | |
