# Dataset v1.0 — проверенные факты и доменные правила

> Единственный источник правды по данным. Все цифры **проверены скриптом на реальном
> `data/source/`**, а не взяты из презентации. Если код расходится с этим файлом — прав этот файл.

Файлы: `data/source/{employees.json, skills.json, events.json, activity_history.csv}`
Официальное описание схемы: `data/source/README.md` (от организаторов, не редактировать).

## 1. Объём

| Файл | Факт | Структура |
|---|---|---|
| `employees.json` | **200** сотрудников | `{ meta, employees[] }` |
| `skills.json` | **60** навыков, **32** role_profile (8 ролей × 4 грейда) | `{ meta, proficiency_scale, skills[], role_profiles[] }` |
| `events.json` | **40** активностей: 36 voluntary + **4 mandatory** | `{ meta, events[] }` |
| `activity_history.csv` | **2 743** записи за 24 месяца | плоский CSV |

Роли (8): Backend Engineer, Frontend Engineer, QA Engineer, Data Analyst, Product Manager,
Sales Manager, Customer Support Specialist, HR Business Partner.
Грейды (строго в этом порядке): `Junior → Middle → Senior → Lead`.

**Snapshot date — `2026-10-01`.** Это «сегодня» для всего движка: и для проверки будущих
сессий, и для истории. Окно истории: `2024-10-01` … `2026-09-30`.

## 2. Распределения (проверено)

```
grade:      Middle 78 | Junior 59 | Senior 47 | Lead 16
language:   ru 100 | kk 89 | en 11
career_goal: есть у 134 из 200; из них 28 ведут в ДРУГУЮ роль
статусы истории: completed 2178 | no_show 195 | dropped 160 | declined 104 | overdue 90 | in_progress 16
assigned_by: hr 1381 | self 865 | manager 497
формат событий: 31 scheduled (online/offline) | 9 self_paced
```

Все 31 scheduled события имеют хотя бы одну сессию ≥ snapshot date — то есть по данным v1.0
фильтр «нет будущей сессии» никого не отсеивает. **Он всё равно обязателен**: жюри загружает
свои профили и может загрузить свои события.

## 3. Доменные правила (обязательны для всех трёх потоков)

1. **Snapshot `2026-10-01` = today.** Нигде не использовать `new Date()`.
2. **History replay.** Уровни в `employee.skills` актуальны на `last_review_date`.
   Всё, что завершено позже, **ещё не учтено** и должно быть доиграно до расчёта gaps.
   Проверено: **318** записей `completed` позже личной review date, из них **202** реально
   развивают навыки, и они затрагивают **114 из 200** сотрудников. Это больше половины базы —
   команда, которая пропустит replay, ошибётся на половине профилей.
3. **Формула прироста задана данными:** `new = min(current + gain, max_level, 5)`.
   Своих коэффициентов не изобретать.
4. **Mandatory события (4 шт.) не рекомендуются никогда.** Они назначаются HR.
5. **Завершённое событие не повторяется.** Исключение ровно одно: `EV_036` Public Speaking Club
   (recurring клуб, offline, voluntary).
6. **Prerequisites проверяются по effective skills** (после replay), а не по review-снимку.
7. **Scheduled событию нужна `upcoming_session ≥ 2026-10-01`.** `self_paced` доступен всегда.
8. **`critical_skills` — блокеры промоушена.** Вес ×2. Навык вне `required_skills` целевого
   грейда не даёт impact вообще.
9. **Missing skill = 0.** Отсутствие ключа в `employee.skills` — это ноль, не ошибка.
10. **Требования не убывают** от грейда к грейду — можно на это опираться.
11. **Raw профиль и история не уходят в LLM.** Модель получает только evidence по top-кандидатам.

## 4. Target resolution

```
career_goal != null  ->  target = (career_goal.target_role, career_goal.target_grade)   # 134 чел., 28 из них cross-role
career_goal == null  ->  target = (текущая роль, следующий грейд)                        # Junior->Middle->Senior->Lead
grade == Lead и goal == null  ->  честный "no target", а не выдуманная цель              # 16 чел. под риском
```

Cross-role цели — причина, по которой нельзя писать `target = nextGrade(currentRole)`.
Это 28 человек, и жюри почти наверняка даст такой профиль.

## 5. Статусы истории и как их читать

| Статус | Кол-во | Как использовать |
|---|---|---|
| `completed` | 2178 | Положительный engagement. После review date — применить gain. |
| `no_show` | 195 | Негативный сигнал по похожему type/format. Только scheduled события. |
| `dropped` | 160 | Негативный, но слабее; учитывать `completion_pct`. |
| `declined` | 104 | Штрафовать слабо, если `assigned_by` = manager/hr — это отказ от навязанного. |
| `overdue` | 90 | Только mandatory-контекст. **Не смешивать с добровольным интересом.** |
| `in_progress` | 16 | Не рекомендовать дубль; показать как active journey. |

Ключевой нюанс: `assigned_by` (hr 1381 / self 865 / manager 497) разделяет **добровольное**
поведение и **назначенное**. Пропуск того, что человек выбрал сам, и пропуск того, что на него
повесил HR, — это разные сигналы. Движок, который их смешивает, ошибается.

## 6. Демо-профиль E0028 (проверено по данным)

`E0028` — **Middle Backend Engineer**, `career_goal: null` → target = **Backend Engineer Senior**.
`last_review_date = 2026-06-24`, `preferred_language = kk`, `work_format = hybrid`.

Critical skills для Senior: **`SK_SYSTEM_DESIGN` (req 4)** и **`SK_API_DESIGN` (req 4)**.

После review date сотрудник завершил три активности — replay обязателен:

```
2026-07-20  EV_039 Time & Priority Management   -> TIME_MANAGEMENT 3->4, ADAPTABILITY 1->2
2026-08-14  EV_019 API & Performance Testing     -> API_TESTING 0->1, LOAD_TESTING 0->1
2026-09-08  EV_006 Designing High-Load Systems   -> SYSTEM_DESIGN 2->3, OBSERVABILITY 1->2
```

Итог replay по критичным навыкам:

| Навык | На review | Effective | Требуется для Senior |
|---|---|---|---|
| `SK_SYSTEM_DESIGN` | 2 | **3** | 4 |
| `SK_API_DESIGN` | 4 | 4 | 4 ✅ уже закрыт |

**Почему это ловушка для baseline.** Самые низкие effective-уровни у E0028 —
`SK_CLOUD 1`, `SK_CONTAINERS 1`, `SK_DATA_VIZ 1`, `SK_STAKEHOLDER_MGMT 1`, `SK_LEADERSHIP 1`,
`SK_API_TESTING 1`. Baseline «бери самый слабый навык» уйдёт туда — а `SK_DATA_VIZ` и
`SK_API_TESTING` вообще не входят в требования Senior Backend, то есть к промоушену не ведут.
Настоящий блокер — критичный `SK_SYSTEM_DESIGN`, до требования остался **ровно один шаг**.

И второе: `EV_006` уже пройдено 2026-09-08 — **рекомендовать его повторно нельзя**, хотя по
gap-логике он подходит идеально. Движок без replay + dedupe предложит именно его.

> ⚠️ Уточнение к презентации. В `docs/ARCHITECTURE.md` (и в исходном ТЗ организаторов) пример
> ловушки подан через Public Speaking. На реальных данных у E0028 `SK_PUBLIC_SPEAKING = 2` при
> требовании 2 — **разрыва нет вообще**. На демо говорим про CLOUD/CONTAINERS/DATA_VIZ против
> критичного SYSTEM_DESIGN. Цифры выше сверены с датасетом; не пересказывать презентацию.

## 7. Что проверяет жюри

Из `data/source/README.md`, дословно: *evaluation uses additional employee profiles and history
records in the same format. Your solution must be able to load them.*

Значит: **никаких hardcoded ID**, кроме отдельного демо-фикстура, и импорт через UI обязан
принимать новые `employees.json` + `activity_history.csv` той же схемы.
