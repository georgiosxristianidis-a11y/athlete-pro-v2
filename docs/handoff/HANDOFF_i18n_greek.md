# HANDOFF — I18N-EL: греческий язык (EN · RU · EL)

> Часть 1 влита (PR#525, 1.27.165). Часть 2: ветка `claude/i18n-greek-2`, ворктри `C:/PROJECTS/ap-greek2`
> (от `origin/main` 0c3bd596). 2026-10-12: WIP-коммит, не запушен, версия не бампнута.

## Статус (читать первым)

**Сделано в части 2:** шаг 2 — 158 инлайн-тернарников на `tri(ru, en, el)`; шаг 4 — даты через `getLang()`
(format.js, body-stats.js, settings.js, render.js); словари с полем `el`: `body-stats.core.js` (поля, секции, бенто,
`bodyFatCategory`), `body-stats.js`, `lift-bars.js`, `passport-hero.js`, `athlete-room.js` (`TIER_EL`, достижения),
`dobSelectsHtml(dob, idPrefix)` (месяцы по `getLang()`, параметр `ru` убран). Тесты body-stats/athlete-room зелёные.

**Осталось (по порядку):**

1. `island-settings.view.js` — `p.ru/p.en`, `descRu/descEn` (:30,:33,:51,:54,:70) + `renderProfileCard(ru)`, `const ru` (:80): добавить `nameEl`/`descEl`.
2. `analytics.strength-curves.js:101` — вложенный тернарник «сессия/сессии» (греч.: συνεδρία/συνεδρίες).
3. `shared/block-names.js:42-45` `blockLabel(block, ru)` — пары `[en, ru]`, добавить `el`; вызовы: `workout.view/render.js:393`, `sections.js:54`.
4. `shared/txt-export.js` — `L.ru` (+`L.el`), :84 (дата, `lang === 'ru' ? 'ru' : 'en'` -> `lang`), :111 `_plural` (греч. без падежей: две формы как в en).
5. `intel.view.js:90` — объект строк `isRu() ? {...} : {...}` -> третья ветка el (читать целиком, объект большой).
6. `lang: isRu() ? 'ru' : 'en'`: `workout.view/modals.js:614,791` -> `getLang()`; `render.js:286` (`ru ? 'ru' : 'en'`) -> `getLang()`;
   `render.js:500` `if (!isRu()) return exerciseName` — проверить, что для el остаётся английское имя. `profile.js:502`, `privacy.view.js:129`
   (`getLang() === 'ru' ? 'ru' : 'en'`) -> `getLang()`. `modals.js:593,770` (`isRu() && ex.nameRu`) — на el поиск по `name`, оставить.
7. Чистка неиспользуемых `isRu`: `analytics.view.js:28`, `features/pip.js:8`, `privacy.view.js:20`, `rest-timer.js:21`,
   `shared/errors-ui.js:2`, `shared/ppl-gauge.js:11` (`npx eslint js | grep -E "'(ru|isRu)'"`).
8. Бамп `js/version.js` + `package.json`+lock (`npm install`), `npm run build:sw`, `npm test` = 0.
9. Превью на EL: Настройки -> главная, тренировка, профиль, Интеллект, Замеры — без русских строк.
   Добор: грепнуть кириллицу в `js/` вне `locale.store.js` и вне `tri(` — всё, что осталось, это дыра.

Трюк: файлы в рабочем дереве CRLF (индекс LF) — правки скриптом, а не sed по многострочным шаблонам.

Кодмод и карта лежат вне репо (`C:/PROJECTS/_scratch_i18n/`, не коммитить); повторять не нужно, остаток — руками.

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
