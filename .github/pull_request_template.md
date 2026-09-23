## Что сделано

<!-- 2–4 строки. Что появилось у пользователя/жюри, а не список файлов. -->

## Поток и границы

- [ ] A — Intelligence · `domain/data`, `domain/recommendation`, `lib/contracts`
- [ ] B — Experience · `app/employee`, `components/employee`, `domain/simulation`, `state`
- [ ] C — Trust · `app/hr`, `app/trust`, `components/*`, `domain/analytics`, `app/api/ai`, `lib/evaluation`
- [ ] Интеграция (только после 02:20)

Изменения только в своих каталогах: **да / нет** (если нет — объяснить)

## Общие контракты

- [ ] `src/lib/contracts/**` не менялся
- [ ] менялся — предупредил команду и записал в `docs/DECISIONS.md`

## Проверки

```
pnpm test     -> 
pnpm build    -> 
```

- [ ] нет hardcoded ID (`E0028`, `EV_006`) в продуктовом коде
- [ ] работает без `LLM_API_KEY`
- [ ] empty / missing history / invalid import не роняют страницу
- [ ] нет публичного рейтинга сотрудников

## Известные ограничения

<!-- Честно. Незакрытый пункт здесь стоит дешевле, чем найденный жюри. -->
