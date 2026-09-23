# Финальная интеграция Career Quest

## Каноническая архитектура

- `/` — server-bound Employee view с минимизированным dataset: одна полная viewer-запись,
  только viewer history и sanitized Skill Buddy-каталог.
- `/demo` — явный Demo Lab для синтетических профилей и импорта четырёх judge-файлов.
- `/hr` — HR Command Center: агрегаты, no-step queue и participation без performance ranking.
- `/trust` — AI Trust Center: deterministic gates, evidence completeness, latency и fallback.
- `/employee` оставлен как совместимый alias и перенаправляет на `/`.
- Все живые поверхности используют один `useCareerQuestStore`. Legacy main-компоненты сохранены
  как compatibility code, но не монтируют второй store.
- Completion ledger сохраняется в IndexedDB и изолирован content fingerprint dataset.
- Переход из private Employee view в HR/Trust восстанавливает полный bundled dataset и применяет
  тот же canonical ledger, не раскрывая org data в Employee payload.

## AI boundary

`POST /api/ai/review` принимает только:

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

## Фактическая проверка

Выполнено на ветке `codex/career-quest-release`:

```text
corepack pnpm typecheck                              PASS
corepack pnpm test                                   152/152 PASS (19 files)
NEXT_TELEMETRY_DISABLED=1 corepack pnpm build        PASS
docker compose up --build                            IMAGE BUILD PASS
```

Порт 3000 был занят уже запущенным Next-процессом, поэтому собранный образ дополнительно
запущен на `127.0.0.1:3001`. HTTP smoke:

```text
/        200
/demo    200
/hr      200
/trust   200
```

Browser smoke на этой Docker-сборке:

- Employee: What-if переключился в `После выполнения`, появился confirm;
- Demo Lab: открылись четыре file input и кнопка импорта;
- HR: загрузились coverage, participation и no-ranking queue;
- Trust: все deterministic gates зелёные, fallback mode виден;
- настоящий no-key route вернул `Safe fallback · no_key`, ranking остался на месте;
- console errors: 0.

## Ограничения

- Вкладки Employee / Demo / HR / Trust — явный hackathon role switch, не production RBAC.
  Перед реальными данными нужны SSO/RBAC и audit log, включая защиту прямых URL.
- IndexedDB не синхронизируется между устройствами.
- Browser-import dataset остаётся в deterministic режиме: внешний critic не получает данные без
  server-side provenance.
- Live платный LLM не вызывался; success, invalid output, outage, timeout, endpoint hardening и
  no-key проверены mock transport и настоящим локальным route.
- GitHub Actions ранее не стартовал из-за billing lock организации; локальный PASS не означает,
  что внешний CI runner доступен.

## Команде

- Intelligence API: `recommendForEmployee(dataset, employeeId)`.
- Shared UI state: `useCareerQuestStore`; не создавать второй runtime store.
- Server dataset: `loadBundledDataset()` из `src/domain/data/server.ts`.
- HR: `buildHrAnalytics(dataset)`.
- Trust: `evaluateTrustMetrics(dataset)`.
- Optional AI: `requestBoundedAiReview(...)`; deterministic UI должен отрисовываться раньше ответа.
