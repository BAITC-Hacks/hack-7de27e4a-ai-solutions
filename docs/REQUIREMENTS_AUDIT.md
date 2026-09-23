# Проверка Career Quest по требованиям

Дата: 2026-09-23. Проверяется локальное объединение Skill Exchange и согласованного
RU/KK/EN интерфейса с `main 4da973a98c8d0c3cd907a27a487084a364fc6c21`, включая
внешнее обучение, judge import, экономику развития и HR Agent.

## Основания и границы

Требования сопоставлены с исходным ТЗ HackAlem AI Career Quest (DOCX), архитектурным
PDF, playbook на 5 часов, Codex workstreams, персональным ТЗ Манахнбета и PDF Skill Exchange.
Инструкции и примерные числа внутри документов рассматриваются как исходный план;
позднейшие решения пользователя и проверяемый код определяют актуальную интеграцию.
Планы по таймингам хакатона и распределению долей не являются функциональными тестами.

**PASS** означает конкретную проверку ниже. **LIMIT** — реализовано с указанной границей.
**NOT RUN** — результат не подтверждён этим аудитом. Эти статусы не являются оценкой
по 100-балльной шкале жюри и не доказывают отсутствие всех дефектов.

## Итог локальных проверок

Общий прогон после объединения с PR #13 и #15: **366/366 тестов в 43 файлах — PASS**.
Production build с полной проверкой TypeScript — **PASS**, Next.js 16.3.6.
До последних настроек AI также прошёл реальный production smoke: 10/10 проверок,
включая двусторонний чат, ограничения доступа, restart с сохранением сообщений/сессии
и отказ хранилища. Live LLM не вызывался. Windows использует адаптер запуска процессов;
исходные тесты и TypeScript не отключались.

| Проверка | Результат |
| --- | --- |
| Docker Compose configuration | PASS: `docker compose config --quiet`, exit 0 |
| Docker daemon / сборка и запуск контейнера | NOT RUN: Docker CLI 29.3.1 есть, `docker version` exit 1; канал `dockerDesktopLinuxEngine` отсутствует |
| Production Next / bootstrap / реальный restart | PASS: 10/10 на объединении до PR #15; последний build после PR #15 также PASS |
| CI | Не запускался; workflow из main сохранён с ручным `workflow_dispatch` |

## Обязательное ТЗ организаторов

| Требование | Проверяемая реализация / доказательство | Статус |
| --- | --- | --- |
| JSON/CSV: профили, события, история, навыки | Zod importer, точный `data/source`, `tests/recommendation/importer.test.ts` | PASS в общем прогоне |
| Дополнительные профили и история жюри | Partial append/replace; валидация ссылок и строк; `tests/import/*`. Browser: 200 → 203, +4 истории, 2 отклонения; J0001 58%, Product Manager Middle | PASS |
| Профиль и траектория | Текущие/целевые роль и грейд, effective skills, readiness, история и активные события; реальный adapter A | PASS |
| 1–3 релевантных шага | Чистый ranker: gap impact, engagement, feasibility, goal alignment, diversity; ограничения eligibility и стабильный порядок | PASS; честное отсутствие кандидатов допускается |
| Объяснение минимум по трём факторам | Evidence receipt, score factors, baseline/альтернатива, детерминированное объяснение и ограниченный AI | PASS для проверочных случаев; не заявляется качество произвольного LLM-ответа |
| Подтверждение меняет навыки и прогресс | Gain/max_level, immutable ledger, повторная оценка и HR projection. Browser E0028: 74% → 78%, HR 1044 → 1045 | PASS |
| HR: дефициты, отсутствие шага, участие | Общая analytics projection, покрытие, no-step, статусы; фактические окна 6/12 месяцев, self/manager/HR и mandatory отдельно | PASS базового HR и targeted participation suite |
| Не рекомендовать по одному полю под видом AI | Пять взвешенных факторов и adversarial cases; LLM не заменяет ranker | PASS |
| Приватность и employee/HR доступ | Signed demo identity, собственный employee projection, trusted HR role, participant-only chat; API tests | LIMIT: свободный выбор синтетической персоны — не SSO |
| Нет публичного рейтинга сотрудников | HR показывает операционные срезы; отсутствует публичный leaderboard | PASS по review и browser |
| Нет наград за обязательные процессы | Mandatory исключены из рекомендаций и получают 0 баллов; есть добровольный opt-out | PASS gamification targeted suite |
| Без реальных персональных данных | Bundled dataset синтетический; локальный импорт остаётся в браузере | PASS для поставляемого набора; содержание пользовательских файлов не удостоверяется |
| Отклик UI ≤2 с, AI ≤10 с | Есть latency tests и ограниченные provider deadlines; no-key fallback | LIMIT: нет браузерного нагрузочного SLA на всех устройствах/сетях |
| Запуск одной командой | Compose-конфигурация и production bootstrap; реальный Next smoke ниже | LIMIT: Docker daemon недоступен, clean-clone контейнер не проверен |
| Репозиторий и понятный README | Актуальные команды, архитектура, ограничения и этот audit | PASS локальной документации; публикация отслеживается отдельно |

## Архитектура и персональное ТЗ Манахнбета

| Требование | Доказательство / граница | Статус |
| --- | --- | --- |
| Snapshot `2026-10-01`; replay после last_review_date | Recommendation tests; E0028 System Design 2 → 3, EV_006 не повторяется | PASS |
| Target career_goal или следующий грейд; Lead без цели | Target resolution и no-target cases, cross-role judge profile | PASS |
| Prerequisites, completed, recurring, scheduled, positive gain | Domain tests на фильтры и effective gains | PASS |
| Один normalized store Employee/HR/Trust | `sharedEmployeeStore`, bridge, `tests/integration/shared-state.test.ts` | PASS; server chat имеет отдельное назначение и хранилище |
| What-if не меняет исходные данные | Preview/immutability integration и simulation tests | PASS |
| Confirm применяет эффект один раз | Request/revision guard, immutable ledger, repeated-confirm tests | PASS |
| Planner width 10, depth ≤4, три стратегии | Simulation suite; повтор событий запрещён кроме recurring | PASS; календарная совместимость не рассчитывается |
| Decision Lab и Why / Why not | Активный Employee UI и Trust baseline | PASS; baseline не является эталоном оптимальности |
| Loading, empty, no-history, invalid import | UI/store tests, отчёт ошибок; текущий набор сохраняется при невалидном импорте | PASS |
| Raw profile/history не передаются LLM | Allowlisted evidence и API boundary tests | PASS |
| Schema/verifier, неизвестные ID/числа, injection, timeout | Evaluation suites; deterministic fallback сохраняет ranking | PASS на автоматических fixtures |
| Работоспособность без ключа | No-key cases и реальный browser flow | PASS; live paid provider не вызывался |
| RU/KK/EN и responsive | Общая locale, labels/reasons/числа/даты, SSR tests и browser 375 px | PASS проверенных экранов; исходный текст сообщений/названия курсов не переводятся |
| Три последовательных главных сценария | Исторический browser QA согласованного UI; текущий повтор фиксируется отдельно | LIMIT: исторический прогон не подменяет текущую проверку |

## Skill Exchange

| Требование | Доказательство / граница | Статус |
| --- | --- | --- |
| Поиск для критичных навыков, effective levels, self-exclusion | `tests/mentorship/search.test.ts`, все 33 критичных навыка через валидные synthetic requester profiles | PASS; у текущих сотрудников открытые gaps только по 29 навыкам |
| Детерминизм и распределение нагрузки | Skill, department/role, willingness, active load, stable ID tie-break | PASS автоматических случаев |
| Узкая карточка и согласие | Нет истории/вовлечённости/gaps; личная availability, server check при запросе | PASS |
| Входящие, запрос, статусы, plain text ≤2000 | Chat UI и messaging API suites; browser двусторонняя переписка, accept, read/unread | PASS |
| Только участники; HR без чужих сообщений | Server identity и ownership tests; HR summary только числа | PASS |
| Polling 3 с в видимой вкладке | Unit tests: interval, hide/unmount abort, отсутствие наложения | PASS unit; browser delivery без refresh отдельно не измерена |
| Смена identity очищает чужой экран | Identity-key remount, `X-Career-Identity`, 409 guards, tests | PASS |
| Reload / restart сохраняет сообщения | Browser reload, store restart tests и реальный production restart | PASS |
| Атомарная запись, очередь, лимит 20/мин | Store/API tests; лимит на identity переживает перевход | PASS; JSON store рассчитан на один процесс |
| Ошибка хранилища не роняет приложение | Unit tests и production: chat 503, employee/dataset 200 | PASS |
| Без WebSocket/custom server/новых тяжёлых зависимостей | Next route handlers и standard standalone bootstrap | PASS по review |

## Дополнения из принятого main

- Внешнее обучение: локальные 35 записей, HTTPS/domain allowlist, отсутствие влияния
  на ranking/readiness/ledger; соответствие уровню, язык профиля, free/paid, длительность.
  UI раскрывает до 3 направлений × 3 курсов. Provider API, цены и доступность online
  не проверяются; имена курсов сохраняют язык каталога.
- Judge import: база — текущий normalized dataset с учётом подтверждённого эффекта;
  после импорта ledger/preview/planner сбрасываются с предупреждением. Employee не
  получает полный dataset обходным запросом. Импортированные identities не становятся chat users.
- Экономика развития из `0d068536` подключена к действующему Employee store.
  25 targeted tests и TypeScript прошли: обязательные события дают 0, подтверждение
  из normalized history + ledger учитывается один раз, новый импорт сбрасывает действия.
  Баланс выводится из добровольной истории. Обмен/вызовы/opt-out находятся в локальном
  состоянии страницы: уход с неё их сбрасывает; UI явно это сообщает.
  **LIMIT относительно `docs/tz/GAMIFICATION.md`:** реальной оплаты/выдачи наград,
  связи chat → mentorship/thanks и активного HR-агрегата экономики нет; настройка
  completionBonus=40 пока не используется. Множители основаны на принадлежности навыка
  к target/critical requirements, а не на доказанном положительном historical gain
  или закрытии gap. Thanks cap относится к первым шести благодарностям всего state,
  не к rolling period. Поэтому полного соответствия advanced-ТЗ экономики нет.
- HR Agent из `0d068536`: шесть read-only tools, максимум 5 вызовов; HR-only GET/POST,
  клиентский deadline 30 с, server body deadline 3 с, 20 POST/мин на deployment,
  до 4 одновременных запросов. Тело agent ≤512000 байт, review ≤4096 байт;
  explain имеет отдельный bounded evidence контракт и лимит 64000 байт.
  Agent передаёт вопрос и projected numeric facts/IDs; browser повторно проверяет
  числа по tool receipts. **LIMIT:** происхождение client facts не реконструируется
  на сервере; no-key/mock не подтверждают качество live provider.

## Исправления, найденные при текущей проверке

- Новый HR agent endpoint закрыт signed HR role guard; anonymous →401,
  employee →403, stale identity →409. Это серверная проверка, не скрытие UI.
- AI review резервирует concurrency slot до первого await. Review и agent
  ограничивают slow body тремя секундами и освобождают слот при любой ошибке.
- Общая Origin-проверка учитывает протокол, реальный Host и строгий APP_ORIGIN;
  не доверяет X-Forwarded-Host. Agent проверяет точный JSON MIME и cross-site metadata.
- Экономика развития перестала повторно считать одно подтверждение из materialized
  history и ledger. Действия сбрасываются при новом dataset object; ограничение
  сохранения до ухода со страницы теперь явно показано пользователю.

Security targeted gate после этих правок: **70/70 тестов, 10 файлов — PASS**.
Gamification targeted gate: **25/25 — PASS**. Они дополняют, но не заменяют общий gate.

## Открытые границы проверки

1. Docker clean-clone build/run и volume persistence не проверены: daemon отсутствует.
2. Live LLM endpoint и реальные сетевые таймауты провайдера не вызывались; проверены
   локальные mocks/verifier, no-key и fallback. HTTP 200 сам по себе не доказывает качество AI.
3. Нет проверки корпоративного SSO, реальных персональных данных, нескольких серверных
   процессов или production нагрузок: это выходит за demo scope.
4. Карьерный ledger и импорт живут в памяти вкладки, reload их сбрасывает; это отличается
   от сохранения серверной переписки. Внешние курсы не доказывают прирост навыков.
5. Оценки эффективности обучения/оттока являются rule-based наблюдениями, не обученной
   моделью и не валидированным причинным прогнозом.
6. В исходном Skill Exchange PDF число 183 для всех непокрытых gaps не воспроизводится:
   текущий пересчёт даёт 184. Для критичных gaps: 125 сотрудников, 188 пар на snapshot
   2026-10-01; это отсутствие доступного сейчас положительного внутреннего шага,
   а не доказательство невозможности карьерного роста.

Подробные продуктовые границы: [INTEGRATION.md](INTEGRATION.md),
[SKILL_EXCHANGE.md](SKILL_EXCHANGE.md), [EVALUATION.md](EVALUATION.md).
