# HANDOFF — Настройки ИИ в P.A.N.D.A. Core

> Заведён 2026-08-29 решением Gio. Вторая живая линия рядом с треком запуска — узкая,
> одна карточка. База: только `origin/main`. Ритуал ветки — скилл `agent-brief`.
> «Влито» = ancestry в `origin/main`, не «PR создан».

## Контекст

Настройки ИИ сегодня разорваны надвое. Выбор движка, поле BYOK-ключа и индикатор коннекта
живут в Профиле (`js/profile.view/settings.js:266-390` — разметка, `js/profile.js:439-622` —
логика ключа, `js/profile.js:306-329` — `setEngine`). Шестерёнка на самом экране ИИ
(`js/intel.view.js:751-789`) открывает шторку, в которой лежит только слайдер тона.

Главное, что вскрылось при разборе 29.08: **выбор движка на P.A.N.D.A. Core не действует
вообще.** Все запросы экрана шлют `engine: 'gemini'` литералом и читают только `gemini-key` —
чат (`js/intel.view.js:407`), сводка (`:560`), биометрия (`:692`), TTS (`:499`). Тумблер в
Профиле управляет FAB и `claude.store.js`, но не ядром. Перенести его внутрь ядра и не
подключить — значит поставить муляж на самое видное место, поэтому проводка входит в карточку,
а не откладывается.

Решения Gio по развилкам (29.08): переезжают движок + ключ + тон; в Профиле остаётся
строка-указатель на ту же шторку; прошитый `engine` чинится этой же работой.

## PC-1 · Настройки ИИ переезжают в шторку ядра

- **ЦЕЛЬ:** выбор движка (Claude/Gemini), BYOK-ключ с индикатором коннекта и слайдер тона
  живут в шторке шестерёнки на `s-intel`; выбранный движок реально управляет запросами ядра.
  В Профиле на месте секции AI ASSISTANT — одна строка-указатель, открывающая ту же шторку.
- **ГДЕ СТОП:** шестерёнка на `s-intel` открывает шторку с тремя блоками. Переключение на
  Claude → следующий запрос чата уходит с `engine:'anthropic'` (видно в Network), лента
  прошлых ответов на экране не стирается. В Профиле секции AI нет, есть строка, открывающая
  ту же шторку.
- **ФАЙЛЫ:** `js/ai-settings.store.js` (новый) · `js/ai-settings.view.js` (новый) ·
  `js/intel.view.js` · `js/profile.view/settings.js` · `js/profile.js` · `js/locale.store.js` ·
  `js/version.js` + `package.json` + lock · `test/ai-settings.test.js` (новый) ·
  `test/intel-engine-wiring.test.js` (новый). `sw.js` — только через `npm run build:sw`.
- **ГЕЙТ:** `npm run preflight && npm run build:sw && npm test && npm run lint`.
  База на свежем `main` 29.08 — 994 pass / 0 fail, lint 0 errors / 18 warnings
  (предупреждения исторические, не чинить в этой карточке).
- **НЕ ТРОГАТЬ:** `js/claude.store.js` (у него свой корректный путь к движку);
  `bindPandaLifecycle`; тумблеры панды в Профиле (ассистент / живой маскот / реакции — они
  про поведение маскота, а не про ядро); существующие строки в `_copy()` `intel.view.js`.

### Коммит 1 — перенос без смены поведения

1. `js/ai-settings.store.js` (ноль DOM, закон Store/View): перенести логику ключа из
   `js/profile.js:439-622` (`KEY_PREFIX`, `KEY_FIELD`, `_keyLooksValid`, `onKeyInput`,
   `commitKey`, `_verifyKey`, `recheckKey`) и `setEngine` вместе с гардом airgap
   (`js/profile.js:306-329`). Плюс `getTone`/`setTone` (сейчас `js/intel.view.js:99`).
   Безымянный IIFE, считающий стартовое состояние индикатора
   (`js/profile.view/settings.js:319-348`), вынуть чистой функцией
   `keyConnInitState(val, prefix, serverHas)` — она пойдёт под тест.
2. `js/ai-settings.view.js`: разметка секции (переезд `js/profile.view/settings.js:266-390`
   как есть), `openAiSettings()` — шторка `.modal-overlay`/`.modal-sheet` по образцу
   `js/intel.view.js:751-789`, хендлеры под префиксом `ai:*` через `events.js`,
   `setKeyConn()` (было `js/profile.js:473`) и `patchAiStatus()` (было `js/profile.js:818-840`).
   Шторка вешается на `body` — навигация не нужна, оба входа зовут одну функцию.
3. `js/intel.view.js:openSettings()` рендерит секцию ИИ + слайдер тона в одной шторке.
   Семантику сохранения выровнять: движок, ключ и тон применяются сразу, кнопка становится
   «Готово». Половина мгновенно, половина по «Сохранить» читается как баг.
4. `js/profile.view/settings.js`: секция AI ASSISTANT → одна строка `pref-row-icon` с
   `data-action="ai:openSettings"`; снять шесть `on(...)` хендлеров (строки 46-50, 85-86).
   Из публичного API `Profile` (`js/profile.js:780-811`) убрать `setEngine`, `setGeminiKey`,
   `validateGeminiKey`, `setAnthropicKey`, `validateAnthropicKey`, `toggleKeyVisibility`,
   `onKeyInput`, `commitKey`, `recheckKey`.
5. Новые строки — в **обе** локали `js/locale.store.js` (сторожит `locale-parity`).

### Коммит 2 — проводка движка

6. Хелпер `aiAuth()` в store отдаёт `{ engine, customKey }` по выбранному движку. Подставить
   в три текстовых запроса `js/intel.view.js`: чат (`:407`), сводка (`:560`), биометрия (`:692`).
7. TTS (`js/intel.view.js:499`) остаётся на Gemini осознанно: `routes/coach.js:239-255` прошит
   на `gemini-2.5-flash-preview-tts` и Gemini-ключ. В шторке — подпись, что голос всегда
   Gemini. Без подписи выбор Anthropic врёт: озвучка молча падает.
8. `_checkApiKey()` (`js/intel.view.js:103`) проверяет ключ **выбранного** движка; индикатор в
   шапке («система защищена / нет ключа») патчится точечно.

### Ловушки — каждая уже стоила крови

- `IntelView.load()` (`js/intel.view.js:130`) пересобирает `screen.innerHTML` целиком. После
  смены движка звать его нельзя — сотрёт ленту ответов ИИ.
- Хендлеры ключа сейчас ходят через `window.Profile` (`P()` в
  `js/profile.view/settings.js:85-86`). Из шторки на `s-intel` профиль может быть не загружен:
  логика обязана жить в новом модуле, `import('./profile.js')` оттуда — не решение.
- Блок настроек **не перерисовывать** внутри хендлеров ключа (прямой запрет в комментарии
  `js/profile.js:449`): подмена разметки между `mousedown` и `click` съедает тап, вызвавший
  `blur`. Индикатор патчится на месте.
- `stripSecrets()` перед отправкой профиля (`js/intel.view.js:395`, `:552`, `:684`) — туда
  уходит весь `Settings.getAll()`, включая ключи. При рефакторинге фетчей не потерять ни в
  одном из трёх мест.
- Тронул `js/` — подними `js/version.js` + `package.json` + lock (`npm install`), следом
  `npm run build:sw`.

### Тесты — часть наряда, не «потом»

- `test/ai-settings.test.js`: `keyLooksValid` по обоим префиксам (`AIza` / `sk-ant-`),
  `keyConnInitState` на состояниях empty/server/saved/partial, выбор поля ключа по движку.
- `test/intel-engine-wiring.test.js` по образцу `test/plan-single-engine.test.js`: в
  `js/intel.view.js` нет литерала `engine: 'gemini'` и нет чтения `'gemini-key'` вне блока TTS.
  Без этого гарда проводка отвалится назад на первой же правке.

### Полевой чек (в отчёт, не в тесты)

Шторка на телефоне в тёмной и светлой теме; тап по полю ключа не съедается; смена движка не
стирает ленту ответов. Светлая тема на шторках частично мертва (открыты THEME-5/6 в архиве) —
это не блокер карточки, но зафиксировать, что увидел.
