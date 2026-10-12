# HANDOFF — I18N-EL: греческий язык (EN · RU · EL)

> Часть 1 влита (PR#525, 1.27.165). Часть 2: ветка `claude/i18n-greek-2`, ворктри `C:/PROJECTS/ap-greek2`
> (от `origin/main` 0c3bd596). 2026-10-12: WIP-коммит, не запушен, версия не бампнута.

## Статус (читать первым)

**12.10, конец сессии (1.27.173, гейт 1798/1798):** пп. 1-5 ниже закрыты; виджет готовности `intel.view.js` (русский был и в EN) переведён. Осталось: превью EL на главной/тренировке/Замерах после правки, затем PR. Не переводилось по решению: `speakText` `intel.view.js:737` (голос TTS), HTML-комментарии в шаблонах.

**Сделано в части 2:** шаг 2 — 158 инлайн-тернарников на `tri(ru, en, el)`; шаг 4 — даты через `getLang()`
(format.js, body-stats.js, settings.js, render.js); словари с полем `el`: `body-stats.core.js` (поля, секции, бенто,
`bodyFatCategory`), `body-stats.js`, `lift-bars.js`, `passport-hero.js`, `athlete-room.js` (`TIER_EL`, достижения),
`dobSelectsHtml(dob, idPrefix)` (месяцы по `getLang()`, параметр `ru` убран). Тесты body-stats/athlete-room зелёные.

**Решено по пути (не переделывать):**
- `block-names.js` не трогать: `blockLabel(block, ru)` отдаёт `pair[0]` (английский) для всего, кроме ru, — для el это и нужно.
- `privacy.view.js:129` остаётся `'ru' : 'en'`: ссылки ведут на статику `legal/`, греческих юр. текстов нет (решение Gio) — el получает en.
- `render.js:500` `getDisplayName`: на el возвращает каноническое английское имя — верно.
- Сделаны: `lang: getLang()` в modals/render, `сессия/сессии` в strength-curves, чистка `isRu` в 6 файлах (eslint: нет `ru`/`isRu`).

**Осталось (по порядку):**

1. `island-settings.view.js` — `p.ru/p.en`, `descRu/descEn` (:28-33,:51,:54,:70) + `renderProfileCard(ru)`, `const ru` (:80): добавить `nameEl`/`descEl`, читать через `tri`.
2. `shared/txt-export.js` — словарь `L.ru` (+`L.el`), :84 дата (`lang === 'ru' ? 'ru' : 'en'` -> `lang`), :111 `_plural` (греч. две формы как en). Вызов — `profile.js:502` (`getLang() === 'ru' ? 'ru' : 'en'` -> `getLang()`) — менять вместе.
3. `intel.view.js:90` — объект строк `isRu() ? {...} : {...}` (:92-170, 76 строк) -> третья ветка el. Читать целиком.
4. Аудит дыр: `node C:/PROJECTS/_scratch_i18n/cyr.cjs` печатает строки с кириллицей вне `tri(`, но шумит заголовочными комментариями — отсекать глазами.
   Кандидаты не из комментариев: `profile.view/settings.js:125-132`, `profile.js:78-81,99,134-136`, `profile.store.js:210-213`, `dashboard.js:467-471,852,1100`,
   `onboarding.js:230-232,344,494`, `privacy.view.js:143-146,470`, `rest-timer.js:58-170`, `app.js:230,546`, `shell.js:167-170`, `shared/dynamic-island.js:173-177`,
   `ui/drum-picker.js:69-73`, `journal.view.js`, `analytics.view.js:148,451`, `ai-settings.view.js:202`, `workout.view/summary.js:157-159`, `handlers.js:248,914`,
   `modals.js:829,845`. Часть может быть данными/словарями (русский по замыслу: голос TTS, промпты) — разбирать по месту.
5. Бамп `js/version.js` + `package.json`+lock (`npm install`), `npm run build:sw`, `npm test` = 0 (сейчас 1787/1790: хэш SW, sw.js byte-identical, бамп).
6. Превью на EL: Настройки -> главная, тренировка, профиль, Интеллект, Замеры — без русских строк.
7. PR: `gh pr create --base main`, зелёные чеки, `gh pr merge --rebase --delete-branch`.

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
