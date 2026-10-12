# HANDOFF — I18N-EL: греческий язык (EN · RU · EL)

> Часть 1 влита (PR#525, 1.27.165). Часть 2: ветка `claude/i18n-greek-2`, ворктри `C:/PROJECTS/ap-greek2`
> (от `origin/main` 0c3bd596). 2026-10-12: WIP-коммит, не запушен, версия не бампнута.

## Статус (читать первым)

**Сделано в части 2 (шаг 2, простые тернарники):** 158 литеральных `ru ? 'A' : 'B'` в 17 файлах
переписаны кодмодом на `tri(ru, en, el)`; перевод — карта `ru | en -> el` из 140 пар. Юнит-тесты 1787/1790,
три красных ожидаемы: хэш SW (`npm run build:sw`) и бамп версии. eslint: 0 ошибок.

**Осталось (шаги 2-4):**

1. Бамп `js/version.js` + `package.json`+lock (`npm install`), `npm run build:sw`.
2. Чистка: неиспользуемые `isRu` в импортах (≈8 файлов), `ru` в `athlete-room.js:306,665` (`const { ru } = ctx`)
   и параметры `ru` в `body-stats.js:128,191`. Смотреть `npx eslint js | grep -E "'(ru|isRu)'"`.
3. Не-литеральные ветки, кодмод их не берёт: `athlete-room.js` (`a.ru/a.en` достижения, `TIER_RU`, `LIFT_RU`,
   `renderLiftBars(..., ru ? 'ru' : 'en')`, `isRu()` на :731/:734), `body-stats.core.js` (`f.ru`, `cat.ru`, `sec.ru`
   — добавить `el`), `body-stats.js` (`label()`, `cat.ru`, `sec.ru`, :366 `isRu()`-блок), `passport-hero.js`
   (`TIER_RU`/`GOAL_RU`), `lift-bars.js` (`TIER_RU`/`LIFT_RU`), `island-settings.view.js` (`p.ru`, `descRu/descEn`),
   `analytics.strength-curves.js:101` (вложенный тернарник «сессия/сессии»), `block-names.js:45`, `txt-export.js` (`L.ru`,
   :84, :111), `intel.view.js:90` (объект строк), `settings.js:185-187,290-303`, `profile.js:65,502`, `privacy.view.js:129`
   (`'ru' : 'en'` -> `getLang()`), `workout.view/modals.js:614,791` и `render.js:286,500` (`lang: isRu() ? 'ru' : 'en'`).
4. Даты (шаг 4): `toLocaleDateString(isRu() ? 'ru' : 'en')` -> `getLang()` в `format.js:40`, `body-stats.js:49`,
   `settings.js:19,37`, `render.js:304`, `txt-export.js:84`.
5. Превью на EL: Настройки -> главная, тренировка, профиль, Интеллект, Замеры — без русских строк.

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
