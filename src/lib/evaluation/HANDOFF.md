# Даник: HR Intelligence / AI Trust

**Интеграция выполнена:** `src/app/AppProviders.tsx` монтирует общий store B и
EmployeeStoreTrustBridge для всех страниц. Навигация использует Next Link.
Employee вызывает AI review после отображения deterministic ranking. Текущие команды,
результаты объединённых проверок и ограничения: `docs/INTEGRATION.md`.

Реализована зона C. Основа ядра и данных: main `0a4b7c26eab1e4fa5087d642dc862c3dc7338087`.
Все добавленные файлы находятся в каталогах C. Формулы, фильтры, shared contracts,
Employee UI, root layout и зависимости команды не изменены.

## Что готово

- `/hr`: охват рекомендациями, no-step, readiness, critical gaps по роли/грейду,
  раздельные статусы обязательного и добровольного участия, self/manager/hr engagement,
  доступность каталога и ожидаемый эффект программ. Каждый блок предлагает проект
  действия HR; проект можно скачать. События и назначения автоматически не создаются.
- `/trust`: сравнение weakest-skill baseline с фактическим top-1, запуск проверок,
  измеренные числители/знаменатели, p50/p95, статусы fallback и экспорт JSON.
- `/api/ai/review`: strict Zod input/output, ограниченный payload, allowlist,
  проверка ссылок, чисел и утверждений, таймаут и ru/kk/en fallback.
- Адаптеры к реальным A contracts и к recomputed views + ledger B.
- 44 теста C; вместе с 17 опубликованными тестами A прошли все 61.

## Подключение к одному store B

`EmployeeStoreTrustBridge` принимает существующий store из `createEmployeeStore(realAdapter)`.
В integration client boundary оберните все маршруты:

```tsx
import { EmployeeStoreProvider } from '@/state/EmployeeStoreProvider';
import { EmployeeStoreTrustBridge } from '@/components/trust/EmployeeStoreTrustBridge';

<EmployeeStoreProvider store={store}>
  <EmployeeStoreTrustBridge store={store} access={viewerRole}>
    {children}
  </EmployeeStoreTrustBridge>
</EmployeeStoreProvider>
```

`viewerRole` имеет тип `"hr" | "employee"` и приходит от host-приложения.
Это граница видимости UI, не реализация аутентификации. В режиме employee HR/Trust
не рендерят данные. Отдельного store или копии нормализованного набора C не создаёт.

Bridge совместим с опубликованным B commit `99a59d0d55e53c91fb25f7058e431285b727ce15`:
берёт `dataset.source`, `views`, `ledger`, `selectedEmployeeId`, `status`.
`views` используются для уровней/gaps/candidates после confirm; исходный source нужен
для метаданных и исходной истории. Ledger добавляет завершения текущей сессии как self.
Повторные ledger IDs отклоняются. Если view для импортированного сотрудника отсутствует,
показывается ошибка подключения, а не частичная статистика.

Root layout подключён к реальному B store через AppProviders. На пустом наборе HR просит
загрузить файлы; режим сотрудника скрывает HR-данные. Режим HR выбирается явно в демо-панели.

## Публичные функции C

| Экспорт | Назначение |
| --- | --- |
| `projectCoreEmployee`, `projectCoreAnalytics` из `@/domain/analytics` | Типизированная проекция A для импортированного снимка и eval |
| `projectEmployeeStore` | Актуальная аналитика из views/ledger B после completion |
| `selectHRAnalytics` | Детерминированные агрегаты без IDs/имён сотрудников в выходе |
| `compareWithBaseline` из `@/lib/evaluation` | Сравнение по одному навыку с общими hard filters |
| `buildCoreReviewRequest(dataset, result)` | Evidence из A, без профиля/описаний/истории |
| `buildReviewRequest(recommendations, language)` | Минимальный evidence из factorScores B |
| `requestAIExplanation(request)` | Browser API client с fallback при отказе route |
| `createDatasetAuditCases(dataset)` | Проверки импортированного набора, replay и latency |
| `createCoreEvaluationCases(fixtures, observe)` | Проверка независимых размеченных expectations |
| `runEvaluation(cases)` | Отчёт с настоящими знаменателями; пустые измерения = null |

UI сначала показывает deterministic рекомендации. Затем B может вызвать
`requestAIExplanation(buildReviewRequest(view.recommendations, language))` и отобразить
полученный текст/статус. C не меняет ranking, score и состояние Employee UI.

## Политика модели и evidence

Критик выбирает evidence-ссылки минимум из трёх разных факторов. ID и порядок первых
трёх кандидатов неизменны. Допустимое объяснение — точная конкатенация проверенных
локализованных предложений. Любой свободный вывод, неизвестный ID, другое число или
ссылка на evidence другого кандидата приводит к fallback. Это намеренно ограниченный
язык объяснений: verifier не пытается доказать истинность произвольного текста LLM.

`score:<event>:<factor>` — локальные evidence IDs C для нормализованных factorScores.
Они отличаются от A `factor:<event>:<factor>`, где значение — взвешенный contribution.
`gain:*` и `projection:*` сохраняют идентификаторы соответствующего evidence A.
Текст event.description и строки профиля не пересылаются провайдеру.

`LLM_BASE_URL` — базовый URL OpenAI-compatible endpoint (например, окончание `/v1`).
К нему добавляется `/chat/completions`. Нужны `LLM_API_KEY`, `LLM_MODEL`;
`LLM_TIMEOUT_MS` по умолчанию 8000, ограничен 30000. HTTPS обязателен кроме loopback.
Редиректы запрещены. Неполная конфигурация, ошибка сети/JSON/schema/verifier => fallback.
Живой платный провайдер не вызывался; transport проверен mock-ответами, no-key — в браузере.

## Определения метрик

- Coverage: сотрудники с рекомендацией / сотрудники с ненулевой целью.
  No-target не смешивается с no-step.
- Engagement completion rate: completed / конечные статусы добровольных активностей;
  in_progress и mandatory исключены. Пустой знаменатель = null.
- Catalog gap: нет доступного положительного шага сейчас либо одного шага недостаточно.
  Это не доказательство невозможности многошаговой траектории.
- Program impact: сумма min(effective gain, remaining gap), critical ×2,
  по всем eligible candidates, не только top-3. Прогноз, а не фактический эффект обучения.
- Eligibility: доля рекомендаций, не проходящих публичные hard filters A.
- Replay: сравнение с независимым пересчётом из плоской history, review date и cap.
- Grounding в сохранённом отчёте: пять числовых утверждений синтетической verifier-проверки;
  100% относится только к этим пяти утверждениям, а не ко всем LLM-ответам.
- Latency: 20 индивидуальных локальных вызовов engine. Время полного batch не выдаётся за p95.

Dataset audit получает текущий `normalizedDataset` B, включая подтверждения; при использовании
старого внешнего store без этого поля поддерживается исходный импорт. HR/Decision Lab используют
текущие views B с ledger. Изменение store помечает старый UI-отчёт как устаревший.

## Проверки и фактические результаты

В ограниченной Windows-среде: Node 24.21.0, TypeScript 5.9, Vitest 3.2.7,
Next 16.3.6; зависимости установлены только в локальном стенде. Корневой manifest команды
не изменялся. Обычный CI должен использовать версии из pnpm-lock и Node 22.

Стандартные команды после установки зависимостей проекта:

```sh
pnpm typecheck
pnpm test
pnpm build
```

Фактически локально выполнены `tsc --noEmit` (без ошибок) и Vitest по всем test-файлам
(61/61). В стенде Next выполнены production compile, TypeScript, prerender `/hr`, `/trust`
и сборка `/api/ai/review`. Для sandbox использовались worker threads и
`experimental.useTypeScriptCli: false` (проверка типов в процессе, а не запрещённый spawn).
Vite также использовал in-process TypeScript transformer и preserveSymlinks для исключения
необязательного системного probe. Эти настройки относятся только к локальному стенду.

Browser QA: HR action brief, Trust live evaluation (10 AI cases), no-key route на kk,
узкий viewport без горизонтального переполнения, console errors отсутствуют.
Browser fixture явно помечен синтетическим; реальный набор проверен integration-тестами.

Сохранённый отчёт: `tests/evaluation/reference-report.json` (33 checks, 0 failures).
438 рекомендаций: 0 eligibility violations. Replay: 4486/4486 уровней.
Abstain: 27/27. Critical-gap targeting: 135/438. Это результаты конкретного импортированного
набора и версии A, не обещание accuracy.

## Важное для демо E0028

На фактическом ядре A из указанного commit System Design после replay = 3;
EV_006 повторно не предлагается. Baseline выбирает EV_009 (SK_CLOUD = 1),
ядро выбирает EV_038. Readiness после: 0.7586 и 0.7759 соответственно.
У обоих top-1 critical-gap closure = 0. Не утверждайте, что текущий top-1 закрывает
System Design, пока владелец A не согласует/проверит эту часть demo-story.
Порядок рекомендаций здесь не изменялся.

## Сообщение команде для передачи пользователем

> A: C подключён к реальным NormalizedDataset/RecommendationResult; 200 профилей и 2743
> history rows проверены. Для E0028 baseline EV_009, engine EV_038, у обоих critical closure=0:
> нужна сверка demo-story. Скоринг и фильтры A не менялись.
>
> B/интегратор: оберните маршруты EmployeeStoreTrustBridge, передав тот же store,
> который используется EmployeeStoreProvider. HR читает актуальные views и ledger.
> AI: buildReviewRequest + requestAIExplanation; baseline: compareWithBaseline.

Сообщения автоматически никому не отправлялись.
