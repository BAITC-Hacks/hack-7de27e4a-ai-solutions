# Демо-сценарий (90 секунд)

> Каждая реплика обязана соответствовать **видимому элементу интерфейса**.
> Репетируем три раза подряд без ручного вмешательства в данные.

## Профиль для демо: E0028

Middle Backend Engineer, цель не задана → target = **Backend Engineer Senior**.
Язык интерфейса сотрудника — **kk** (хороший повод показать локализацию).
Полные проверенные цифры — `docs/DATASET.md` §6.

## Скрипт

| # | Экран | Реплика | Что должно быть видно |
|---|---|---|---|
| 1 | `/demo` → «Демо и импорт» | «Четыре файла проходят Zod/CSV и relation validation. Тот же адаптер принимает профили жюри.» | 4 file inputs, dataset source, import status |
| 2 | Demo profile `E0028` | «Middle Backend Engineer, цели нет — система честно берёт Senior той же роли.» | current/target, readiness 74%, полный skill/history profile |
| 3 | Карта навыков | «После review было три completion; replay даёт шесть skill changes. System Design уже 3, а не устаревшие 2.» | строка `System Design 3 / нужно 4`, replay count |
| 4 | Counterfactual | «Weakest-skill подход ушёл бы в API Testing/Data Viz, которых нет в требованиях цели. Career Quest оптимизирует карьерный разрыв.» | «Почему не самый слабый навык?» |
| 5 | Top-3 | «Ranking учитывает цель, gap, историю, формат и diversity. Уже завершённый `EV_006` отфильтрован до score.» | top-1 и две альтернативы |
| 6 | Evidence Receipt | «Все evidence-факты, score contributions, источники и версия engine доступны, а не спрятаны в логах.» | полный scrollable Evidence Receipt |
| 7 | Bounded AI | «Браузер отправляет только employee/candidate/completion IDs. Сервер проверяет replay и восстанавливает evidence, модель возвращает ID/citations, а текст строится из подтверждённых фактов.» | кнопка AI-критика, safe fallback status |
| 8 | What-if | «Digital Twin показывает before/after до изменения профиля.» | readiness и skill changes |
| 9 | Confirm | «Completion применяет gain/max_level, сохраняется в IndexedDB и мгновенно перестраивает top-рекомендации и beam path.» | toast, новый readiness/top-3; reload сохраняет результат |
| 10 | `/hr` | «HR видит агрегаты и no-step queue, но не performance leaderboard и не зарплатные решения.» | coverage, gaps, participation, no-step |
| 11 | HR Event Builder | «Выбираем пробел и ещё до сохранения видим точный охват. Событие проходит те же eligibility и ranking, а не отдельный demo-алгоритм.» | preview eligible / critical / before → after |
| 12 | Save → `/employee` | «Сохраняем: прогноз совпал с фактическим пересчётом. Новая рекомендация помечена “Создано HR”, показывает дедлайн и экспортируется в `.ics`.» | equality preview = actual, HR badge, deadline, calendar |
| 13 | `/trust` | «На текущем dataset: 0 eligibility violations, полнота receipt, deterministic rerun, latency и verifier policy.» | gates, latency card, fallback mode |

## Правила демонстрации

- Для чистого повтора использовать профиль, на котором ещё не сохраняли completion, либо очистить
  demo-origin через штатную очистку браузерных данных до выступления.
- Если LLM отвалилась — **это часть демо, а не провал**: показать fallback как фичу.
- После browser-import внешний critic намеренно остаётся в fallback: сервер не смешивает
  импортированные факты с bundled dataset без доказуемой provenance.
- Не произносить слов «точность» и «accuracy» — у нас нет размеченного эталона.
- Не называть configured viewer production RBAC: это role-scoped hackathon demo.

## Release checklist

- [x] README соответствует реализованным routes и ограничениям
- [x] `.env.example` без секретов; no-key fallback проверен
- [x] Dockerfile и `docker compose up --build`
- [x] Исходный dataset и judge-import adapter
- [x] Сохранённый evaluation summary: `docs/EVALUATION.md`
- [x] Employee → What-if → completion → rerank → HR/Trust browser regression
- [ ] Записать финальный короткий GIF/видео на машине команды, если останется время
