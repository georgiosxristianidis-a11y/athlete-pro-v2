# HANDOFF — I18N-EL: греческий язык (EN · RU · EL)

> Ветка `claude/i18n-greek`, ворктри `C:/PROJECTS/ap-greek` (от `origin/main` 927b04af).
> 2026-10-11, конец смены 1: WIP-коммит, не запушен.

## Статус (читать первым)

Сделано: шаги 1, 6, 7 + бамп 1.27.165 (1.27.164 заняли #519/#521/#524). Словарь `el` (517 ключей)
в `js/locale.el.js`, грузится лениво (`_ensureDict` в `locale.store.js`) — бут не растёт.
`tri(ru, en, el)` готов для шага 2. Тесты: паритет ключей и плейсхолдеров el, `el-GR → el`.

PR-1 готов (1719/1719): `locale.el.js` вне прекеша (`LAZY_LOCALE_RE` в `build-sw.mjs`, явное
исключение в `test/pwa.test.js`), офлайн без кэша — фолбэк на en. Превью: онбординг на EL после
перезагрузки. Регистрацию SW панель превью блокирует сама — офлайн-путь проверить на Android.

**Следующее — PR-2:** шаги 2-4 (инлайн-тернарники через `tri`, словари `.ru`, даты через `getLang()`).

## I18N-EL — карточка

**ЦЕЛЬ:** в приложение добавлен третий язык — греческий (`el`, подпись «ΕΛ»). Panda CORE
отвечает на языке UI: EN → английский, RU → русский, EL → греческий.

**Что уже есть (не переделывать):** для EN/RU CORE уже говорит языком UI. Фронт шлёт
`lang: getLang()` (`js/intel.store.js:362,394`, `js/coach-snapshot.store.js:39`), сервер
вставляет язык в промпт (`routes/coach.js:337` `_langName`, `:374`, `:517`, `:595-612`).

**ГДЕ СТОП:** переключатель EN/RU/ΕΛ в Настройках и онбординге; все экраны на EL без
русских/английских дыр; CORE (чат, недельный отчёт, биометрия, локальные инсайты, офлайн-фолбэк)
отвечает по-гречески; `npm test` зелёный.

### План (по порядку)

1. **`js/locale.store.js`** — словарь `el` на все 517 ключей (паритет ru/en сейчас 517=517,
   гард `test/locale-parity.test.js` — дописать туда `el`). `detectDeviceLang`: `el*` → `el`.
   `initLocale` принимает `el`. Тип `setLang`: `'en'|'ru'|'el'`. Хелпер для инлайна:
   `tri(ru, en, el)` — порядок аргументов как в тернарнике `ru ? A : B`, чтобы замена шла механически.
2. **Инлайн-тернарники** (~140, `grep -rnE "\bru \?|isRu\(\) \?"`): самые плотные —
   `js/shared/athlete-room.js` (47), `js/body-stats.js` (26), `js/profile.view/passport-hero.js`,
   `js/analytics.strength-curves.js`, `js/island-settings.view.js`, `hexagon-radar`, `bento`,
   `lift-bars`, `settings.js`, `errors-ui.js`, `rest-timer.js`, `features/pip.js`, `utils.js:149-157`.
   Плюс формы `getLang() === 'ru' ? …` (`profile.js:233,453,465`, `privacy.view.js:129`,
   `settings.js:285-298`) и большой объект строк `js/intel.view.js:90`.
3. **Словари-объекты с `.ru`:** `TIER_RU`/`GOAL_RU`/`LIFT_RU` (passport-hero, lift-bars,
   athlete-room), `descRu/descEn` (island-settings), `f.ru/cat.ru/sec.ru` (body-stats),
   достижения `a.ru/a.en`, `js/shared/block-names.js:45` (пары), `js/shared/txt-export.js` (`L.ru`).
4. **Даты:** `toLocaleDateString(isRu() ? 'ru' : 'en')` → `getLang()` (`el` — валидный BCP47):
   `format.js:40`, `body-stats.js:49`, `settings.js:19,37`, `render.js:301`, `txt-export.js:84`.
5. **Названия упражнений:** для EL — английские (`exercise-label.js:72` уже отдаёт `name` при
   `lang !== 'ru'`). В залах Греции говорят английскими названиями; `nameEl` в библиотеку не вводить.
6. **Сервер `routes/coach.js`:** `z.enum(['ru','en'])` → `+ 'el'` (`:126` схема снимка, `:336`
   `uiLangSchema`); `_langName`: `el` → `'Greek'`; приветствие `:598` — три ветки;
   `_weeklyReportFallback` `:454` — ветка `el` (сейчас всё не-`en` уходит в русский — **для `el`
   это баг**, отдал бы русский). Фронт: `js/shared/coach-snapshot.js:179` пропускает только `ru`, иначе `en` —
   добавить `el`.
7. **Переключатель:** `js/profile.view/settings.js:182-185`, `js/onboarding.js:30,213-216`
   (гард `lang !== 'en' && lang !== 'ru'`) — третья кнопка «ΕΛ».
8. **Версия:** бамп `js/version.js` + `package.json`+lock, `npm run build:sw`.

**ГЕЙТ:** `npm test` = 0; `test/locale-parity.test.js` проверяет `el`; тест на `_langName('el')`
и weekly-фолбэк на `el` (рядом `test/coach-weekly-fallback.test.js`); превью: EL в Настройках →
главная, тренировка, профиль, Интеллект — без русских строк.

**НЕ ТРОГАТЬ:** `legal/` (юр. тексты на греческий — отдельное решение Gio); канонический
`ex.name`; голос TTS (Gemini сам ловит язык текста).

**Объём:** большой (~700 строк перевода). Если не влезает в сессию — дробить: PR-1 = шаги 1, 6, 7
(язык выбирается, CORE говорит по-гречески, словарь целиком), PR-2 = шаги 2-4 (инлайн-строки).
