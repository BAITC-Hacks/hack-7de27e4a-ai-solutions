# Evaluation — как мы доказываем качество

> **Правило: не называть метрику `accuracy`, пока нет размеченных правильных рекомендаций.**
> Жюри это заметит, а честная формулировка стоит дороже красивой цифры.

## 1. Baseline, с которым сравниваемся

**Weakest-skill baseline** — «рекомендуй активность, развивающую самый низкий навык сотрудника».
Это тот самый однофакторный подход, который ТЗ организаторов прямо запрещает выдавать за AI.
Мы реализуем его честно, чтобы показать разницу на конкретном профиле.

## 2. Метрики

| Метрика | Определение | Цель |
|---|---|---|
| Eligibility violations | доля рекомендаций, нарушивших хотя бы один hard filter | **0** |
| Evidence Receipt completeness | доля рекомендаций с target, gap, gain, history, feasibility и projection evidence | **100%** |
| LLM output boundary | модель возвращает только candidate/evidence IDs; видимый текст строит сервер | свободный model prose отклоняется |
| History replay correctness | совпадение effective skills с эталонным пересчётом | **100%** |
| Critical-gap targeting | доля рекомендаций, закрывающих критичный для промоушена навык | выше baseline |
| Abstain honesty | доля профилей без кандидатов, где система честно молчит, а не выдумывает | **100%** |
| Latency p50 / p95 | время отклика рекомендации | ≤ 10 с (требование ТЗ) |
| Fallback status | поведение без LLM-ключа | полностью рабочее |

## 3. Adversarial-кейсы

| # | Кейс | Ожидание | Статус |
|---|---|---|---|
| 1 | E0028: `EV_006` завершён после review | не рекомендуется повторно, SYSTEM_DESIGN = 3 | ✅ |
| 2 | Самый слабый навык не нужен целевому грейду | побеждает critical gap | ✅ |
| 3 | Негативная/назначенная история участия | self и assigned сигналы не смешиваются | ✅ |
| 4 | Активность упирается в `max_level` | effective gain = 0, исключена | ✅ |
| 5 | Уровень уже выше activity `max_level` | skill не уменьшается; projection = simulation | ✅ |
| 6 | Lead без `career_goal` | честный «no target» | ✅ |
| 7 | Ничего не подходит | abstain + HR no-step alert | ✅ |
| 8 | Одинаковые scores | стабильный tie-break по `event_id` | ✅ |
| 9 | LLM без ключа/outage/timeout | локализованный deterministic fallback | ✅ |
| 10 | Prompt injection / клиентский PII | браузер не может передать evidence-текст модели; сервер восстанавливает факты | ✅ |
| 11 | Cross-role `career_goal` | target берётся из цели, не из next grade | ✅ |
| 12 | Невалидный файл на импорте | issues содержат source/path; текущий dataset не меняется | ✅ |
| 13 | Unknown candidate/evidence или model-authored prose | response блокируется schema/verifier | ✅ |
| 14 | Greedy шаг закрывает путь к лучшему результату | beam search выбирает unlock-path | ✅ |
| 15 | Две completion в один snapshot-day с разными `max_level` | ledger сохраняет фактический порядок | ✅, 2 287 пар |
| 16 | Ledger от другого импортированного dataset | fingerprint изолирует запись | ✅ |
| 17 | Быстрый `/hr → /trust` во время hydration | общий promise доигрывает replay один раз | ✅ |
| 18 | Employee payload | только viewer history; коллеги представлены sanitized Skill Buddy DTO | ✅ |
| 19 | Browser-import вызывает внешний critic | запрос не отправляется без server provenance; остаётся deterministic explanation | ✅ |
| 20 | Spoofed `X-Forwarded-For` | rate limit не использует caller header; deployment bucket имеет O(1) память | ✅ |

## 4. Результаты прогона

Финальный прогон на исходном dataset v1.0:

| Проверка | Результат |
|---|---:|
| Автоматические тесты | **152/152 PASS**, 19 test-файлов |
| TypeScript / production build | **PASS / PASS** |
| Docker image / HTTP routes | **PASS / 4 из 4 вернули 200** |
| Профили | **200/200** |
| Сформированные рекомендации | **438** |
| Все eligible-кандидаты, сверенные с simulation | **620/620** |
| Eligibility violations | **0** |
| Evidence Receipt completeness | **100%** |
| Deterministic rerun | **100%** |
| Профили с доступным шагом / профили с целью | **173/190 (91%)** |
| Честный no-step | **27**: 10 без target, 17 без eligible activity |
| Completion/rerank проверки | **173** |
| Duplicate-completion проверки | **147** |
| Beam paths | **200**, 433 фактических шага |
| Skill Buddy запросы | **12 000** |

Интерактивный smoke на финальной Docker-сборке подтвердил identity-bound employee view,
What-if (`После выполнения` + кнопка confirm), четыре file input в Demo Lab, HR, Trust и
`no_key` API fallback; console errors — 0. Completion, instant reranking, duplicate protection
и replay после persistence дополнительно покрыты автоматическими тестами. Для ранее проблемного
`E0150 / System Design Fundamentals` карточка и What-if совпадают: **64% → 67%**.

## 5. Известные ограничения

- Role switch и configured viewer — демонстрационная граница, не production authentication.
- Employee route минимизирован сервером; полный синтетический набор намеренно доступен в
  Demo Lab и HR/Trust. Перед реальными данными всё равно нужны SSO/RBAC и audit log.
- IndexedDB ledger локален одному браузеру и не синхронизируется между устройствами.
- Импортированный judge dataset живёт в текущей browser-сессии.
- External LLM critic для browser-import намеренно отключён: только bundled server dataset имеет
  доверенную provenance; deterministic recommendation/explanation продолжает работать полностью.
- Live внешний LLM не вызывается в CI: success, no-key, outage, timeout, provenance и verifier
  проверяются детерминированными mock-ответами; реальный provider включается через `LLM_*`.
- Короткий/пустой путь допустим, если каталог не содержит eligible activity: система не
  выдумывает курс, а передаёт случай в HR no-step queue.
