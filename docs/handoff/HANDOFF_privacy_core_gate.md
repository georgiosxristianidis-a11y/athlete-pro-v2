# HANDOFF — скан 2026-08-30: гейт ИИ в P.A.N.D.A. Core

> Не линия запуска. Отчёт ночного скана + правка. PR:
> https://github.com/georgiosxristianidis-a11y/athlete-pro-v2/pull/293
> «Влито» = ancestry в `origin/main`, не «PR открыт».

## ЦЕЛЬ / ГДЕ СТОП / НЕ ТРОГАТЬ

- **ЦЕЛЬ:** Core не шлёт `/api/coach*` при AI off/airgap; SSE не теряет кадр; сбой онбординга не кирпичит шелл.
- **ГДЕ СТОП:** #293 влит (ancestry) **или** явно отвергнут. Пока открыт — не открывать второй PR на тот же набор.
- **НЕ ТРОГАТЬ:** TTS `customKey: null` (VOICE-1, #292, в `main`). Бэкап merge-only. Онбординг «без флага» — нет жёсткого триггера.

## Фаза 0–5. Сделано

- [x] Гейт `safeFetch(..., 'ai')` на чат / weekly / biometrics / TTS
- [x] Ребейз на VOICE-1: `customKey` → `undefined` + `safeFetch`
- [x] Ребейз на `origin/main` после MOTION-FIX (`fb9a38a`) — пересечения файлов не было
- [x] SSE carry-buffer + mid-stream `error` (`js/shared/sse.js`, Core)
- [x] `_obFinish` снимает `inert` в `finally`

## Фаза 1. Ещё не чинили

| Находка                             | Почему не сейчас                                     |
| ----------------------------------- | ---------------------------------------------------- |
| Бэкап merge-only                    | LAUNCH-8 так задумал; replace сам риск потери данных |
| Онбординг без `onboarding-complete` | Нет жёсткого триггера на свежей установке            |

## Фаза 6. Остаток

- [ ] Влить #293 — это LEAD (`gh pr merge --rebase --delete-branch`). Агент `gh` только читает.
- [ ] Если к мёржу в `main` другой бамп версии — rebase и перебамп + `npm run build:sw`
