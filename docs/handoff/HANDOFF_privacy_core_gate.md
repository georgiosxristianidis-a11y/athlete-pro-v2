# HANDOFF — скан 2026-08-30: гейт ИИ в P.A.N.D.A. Core

> Не линия запуска. Отчёт ночного скана + правка. Читать, если берёшься
> за #293 или за следующую дыру вокруг `js/intel.view.js` / `safeFetch`.
> PR: https://github.com/georgiosxristianidis-a11y/athlete-pro-v2/pull/293
> «Влито» = ancestry в `origin/main`, не «PR открыт».

## ЦЕЛЬ / ГДЕ СТОП / НЕ ТРОГАТЬ

- **ЦЕЛЬ:** чат, weekly, biometrics и TTS на `s-intel` не уходят на `/api/coach*`, если ИИ выключен или режим airgap.
- **ГДЕ СТОП:** #293 влит (ancestry) **или** явно отвергнут. Пока открыт — не открывать второй PR на тот же баг.
- **НЕ ТРОГАТЬ:** TTS `customKey: null` — закрыто VOICE-1 (#292, в `main` как 1.27.85). Бэкап merge-only, онбординг, SSE-буфер — не этот PR.

## Фаза 0. Вход

- [x] Память скана: `/cursor/stores/automation/memories/MEMORIES.md` (только Cursor-автоматон; Claude это не читает).
- [x] #292 не дублировали. После мёржа запись TTS из памяти снята.

## Фаза 1. Разведка (не чинили)

| Находка                       | Было                                                    | Почему не в этом PR                                         |
| ----------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| Бэкап merge-only              | Import не стирает IDB/localStorage; wipe не чистит план | Задокументировано LAUNCH-8; replace сам риск потери данных  |
| Онбординг без флага           | Fast Skip может перезаписать профиль                    | Нет жёсткого триггера на свежей установке                   |
| `setShellInert` без `finally` | Сбой commit → шелл `inert`                              | Только при падении IDB                                      |
| SSE без буфера в Core         | Чанк посреди строки теряет текст                        | Класс бага есть; в этом заходе без жёсткого воспроизведения |

## Фаза 2. Баг, который взяли

**Было.** После PC-1 четыре вызова Core шли через сырой `fetch('/api/coach*')`. Дашборд-коуч уже за `safeFetch(..., 'ai')`. AI Coach OFF (и airgap до живого SW) всё равно слал историю и профиль.

**Стало.** Те же четыре вызова — `safeFetch(..., 'ai')`. `PrivacyBlockedError` в `toUserMessage` — про приватность, не generic/503.

Триггер: Privacy → Cloud/Anonymous, AI Coach OFF → Core → чат / отчёт / биометрия.

## Фаза 3. Правка

- [x] `js/intel.view.js` — 4× `safeFetch(..., 'ai')`
- [x] TTS после ребейза на VOICE-1: `safeFetch` **и** `customKey: geminiKey ? String(geminiKey) : undefined`
- [x] `js/shared/errors-ui.js` — разбор `PrivacyBlockedError`
- [x] `test/intel-engine-wiring.test.js` — гард `safeFetch` + сохранён гард VOICE-1
- [x] `test/errors-ui.test.js` — кейсы airgap / ai-off
- [x] Версия `1.27.86` + CHANGELOG + `npm run build:sw`

## Фаза 4. Конфликты с `main`

Все простые (дополнили VOICE-1, не спорили с ним). Сложных не было. После ребейза: `safeFetch` + нормализация ключа, оба теста wiring, CHANGELOG 1.27.86 над 1.27.85.

## Фаза 5. Гейт (на момент скана)

- Локально: `lint` + `npm test` 1039/1039
- CI #293: `test` / `e2e` / `drift` / Vercel — SUCCESS
- `main`: 1.27.85 (TTS починен). Гейт Core **ещё не влит**

## Фаза 6. Остаток

- [ ] Влить #293 (`gh pr merge --rebase --delete-branch` после зелёных чеков)
- [ ] Если к тому моменту в `main` уже другой бамп версии — rebase и перебамп `js/version.js` / lock / `sw.js` (`npm run build:sw`, не руками)
- [ ] Кандидаты фазы 1 — отдельные карточки, только явным решением Gio
