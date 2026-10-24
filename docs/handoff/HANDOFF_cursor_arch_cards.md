# HANDOFF — карточки архитектуры, скорости и долга

> От: **Cursor** (A1–A17, AI-1, GATE-WEEKLY) + **Claude** (фазы и перф-карточки, 13.09)
> Обновлено **2026-09-14** · сверка с кодом `1.27.111`.
> Метрики и формулы — `docs/ARCHITECTURE_SCORECARD.md`. Роутер — `NEXT_SESSION.md`.
> LAUNCH-поле и AI-1 — в `HANDOFF_launch_track.md` (не дублировать здесь).
>
> Каждая карточка самодостаточна: метки сверху → сортируй глазами.
> Одна карточка = один PR. База только `origin/main`. React не ставить.
> **Порядок берётся из таблицы фаз, не из порядка тел карточек ниже** — тела лежат
> так, как легли, чтобы не двигать чужой текст.

## Легенда меток

| Метка | Смысл |
|---|---|
| **P0 / P1 / P2** | Когда брать (сейчас / после P0 / позже) |
| **важность** | `блокер` · `высокая` · `средняя` · `низкая` |
| **тип** | скорость · качество · приватность · дыра · UX · backend · гигиена · визуал · контракт |
| **размер** | S (&lt;2ч) · M (полдня) · L (день+) |
| **от** | Cursor · Claude |

## Порядок работ — фазы (13.09)

Пересортировано под цель «стабильность и ровные 60fps», а не под зрелость слоёв.
Причина пересортировки: **ни одна из A1–A17 не касается рендер-цикла, жестов или
анимаций** — они мерят симметрию Store/View. Работа по кадру живёт в `MOTION-FIX`
(заморожена до LAUNCH-10) и в пяти карточках, которых в очереди не было.

| Фаза | Карточки по порядку | Почему именно здесь |
|---|---|---|
| **0 — вернуть измеримость** | `MEASURE-1` закрыта | `GATE-WEEKLY` закрыт (PR#351 — стаб `generateJSON` в `coach-weekly-fallback.test.js`). Протокол замера теперь в репо, фаза выполнена |
| **1 — кадр и отзыв** | `MOTION-FIX` → `MOTION-PRO` | `PERF-HIST`/`PERF-INLINE`/`PERF-BLUR` закрыты. **`MOTION-FIX`:** код A/B/B2 влит (1.27.122–127), осталось поле Gio (`HANDOFF_launch_track.md`) |
| **2 — стабильность ввода** | закрыта целиком (`NAV-1` · `DRUM-TICK`+`A3` · `A6+A7`) | Тап и жест доходят до приложения ровно один раз и туда, куда просили |
| **3 — архитектура под рост** | закрыта целиком (`A1`+`A8`+`A2`+`A5`+`A9`+`A13`+`A15`, последняя — 18.10, 1.27.193) | Берётся, когда кадр уже ровный |
| **4 — гигиена и поверхность** | `A14-хвост` · `A10` (`A16+A17` закрыта 22.10) | Ни кадра, ни стабильности — чистка |
| **вне фаз** | `AI-1` закрыта | Блокер раздачи ссылки снят — движок без ключа теперь `disabled` в UI |

### Метки открытых карточек

| Фаза | ID | Важность | Тип | Размер | Одной строкой |
|---|---|---|---|---|---|
| 3 | ~~A15~~ | — | — | — | закрыта 18.10 (1.27.193) |
| 3 | ~~A2~~ | — | — | — | закрыта 15.09 |
| 4 | **A14-хвост** | средняя | скорость | S | Island ещё на critical path |
| 4 | ~~A12~~ | — | — | — | закрыта 10.10 в PERIM-2 |
| 4 | ~~A16+A17~~ | — | — | — | закрыта 22.10 (A17 — фактически в CORE-4) |
| 4 | ~~CURSOR-OFF~~ | — | — | — | закрыта 23.09, место 4 (Vercel) за Gio |
| 1 | **MOTION-FIX** | высокая | скорость · моторика | M | код влит (1.27.122–127), осталось поле Gio |
| 4 | **A10** | средняя | backend | S | промпты в routes/coach |
| 4 | ~~GATE-DESCRIBE~~ | — | — | — | закрыта 22.10 |

**Закрыто недавно (не брать):** BOOT-TRIM · A4 · A11 (airgap в sync) · F-7/F-8 · analytics field · HYG-6 ·
GATE-WEEKLY · PERF-HIST · PERF-INLINE · PERF-BLUR · NAV-1 · MEASURE-1 · DRUM-TICK · A3 · A6+A7 ·
A6-follow-up (снос `s-body`) · A1 (completeSession → workout.store, 14.09) ·
A8 (dashboard.store read-модель, 14.09) · AI-1 · A2 (Integrity.check, 15.09) ·
A5 (block-names.js, 16.09) · A9 (сеть и IDB Intel в стор, 17.09) ·
A13 (профиль: IDB только через стор, 18.09) · E2E-1 (`E2E_BASE` кроет `request.*`, 04.10) · A18 (мёртвый код `claude.view.js`, 07.10).

**Не карточки агента (только Gio):** LAUNCH-10 поле · VOICE-2 поле · HYG-6 полевой хвост.

---

## Карточки

### AI-1 — Anthropic в UI без ключа на бэкенде
**от:** Cursor · **P0** · **важность:** блокер до раздачи ссылки · **тип:** дыра · UX · backend · **размер:** S–M · **закрыта 13.09 (1.27.114)**

**Для чего.** Человек выбирает Claude в настройках → любое действие коуча даёт `500 NO_API_KEY`. Ссылка «другу» с мёртвым переключателем = доверие минус.

**Почему важно.** Не регрессия кода — продуктовая ложь в UI. Дефолт Gemini зелёный; ломается только путь Anthropic.

**Где.** `js/ai-settings.view.js` · `routes/coach` / orchestrator · факт: нет `ANTHROPIC_API_KEY` на Vercel. Полный текст — `HANDOFF_launch_track.md` § AI-1.

**Стоп.** Движок либо скрыт / disabled с подписью, либо ключ заведён. Третьего нет. Решение Gio: ключа нет → закрывать UI-стороной.

---

### MEASURE-1 — baseline замера, без которого перф-карточка недоказуема
**от:** Claude · **Фаза 0** · **важность:** средняя · **тип:** скорость · протокол · **размер:** S

**Для чего.** Инструменты в репо есть (`scripts/profile.mjs`, `graph-audit.mjs`,
`compare-bundle.mjs`), но протокол замера живёт только в памяти агента. Каждая следующая
перф-карточка начинается с нуля и половина замеров уходит в мусор.

**Почему важно.** Baseline обязан воспроизводить лаг: иначе меришь заплатку, а не проблему.
Четыре ловушки, каждая один раз испортила замер: CPU-троттлинг не под целевое устройство
(Galaxy S23 по JS — класс десктопа, `1x`, а не дефолтные `4x`), headless на этой машине даёт
постоянный сдвиг ~2.6 с (валидны **только дельты** к контрольной странице), без сида IDB
меряется онбординг, а `startPreciseCoverage` искажает тайминги.

**Где.** `.claude/rules/architecture.md` § «Перф-замер (MEASURE-1)» — 10 строк протокола ·
`scripts/profile.mjs` (флаги уже есть: `--seed=N`, `--coverage=0`).

**Стоп — закрыто 13.09.** Протокол в репозитории, грузится по `paths: scripts/**`.
Валидация — прогон `PERF-HIST` до/после по протоколу (`--cpu=1 --coverage=0 --seed=120`,
worktree на `246ebbf` vs `d700b9c`, один порт-профиль на сторону): Train tap→paint
**22 → 15 ms** (дельта −7 ms, направление совпадает с фиксом «read once per render»),
Stats 23→11, p95 скролла 22.8→18.3 ms. Cold FCP/LCP не сдвинулись за пределы шума
(+140 ms при неизменной логике буста) — ожидаемо, фикс не трогал бут. Абсолютные
headless-числа в CHANGELOG/карточку не идут, только дельты; `PERF_PROFILE.json` в
`.gitignore`.

---

### DRUM-TICK — haptic и запись классов на каждый тик скролла барабана
**от:** Claude · **Фаза 2** · **важность:** средняя · **тип:** скорость · закон · **размер:** S

**Для чего.** `js/ui/drum-picker.js:175-186`: обработчик `scroll` на каждом пересечении item
зовёт `navigator.vibrate(4)` напрямую и `_updateActive(d, cur)` с записью классов — во время
живого инерционного жеста.

**Почему важно.** Барабан веса — главный жест в зале, и это единственное место, где горячий
путь и нарушение Haptic Gate совпали в одной строке. Поэтому берётся одним заходом с `A3`:
отдельной карточкой `A3` перепишет строку, не заметив, что она в scroll-обработчике.

**Где.** `js/ui/drum-picker.js:175` — коалесцировать через `rAF` (одна запись на кадр),
вибрацию перевести на `haptic()` из `js/shared/utils.js`.

**Не трогать.** Правило доверия `d.dirty` и бейлы по `!track.clientHeight` — это лечение
BUG-DRUM-0 (скрытый барабан обнуляет `scrollTop`), а не лишние проверки. Логику `onSettle`,
`_healIfOutsideWindow`, флаги `drum-virtual` / `drum-window` (оба OFF до поля Gio).

**Стоп.** Ноль прямых `navigator.vibrate` в файле; на один кадр не больше одной записи
классов; барабан по-прежнему отдаёт тик на каждое пересечение (тактильность не теряем).

**Стоп — закрыто 13.09.** `dirty`/`clientHeight` трипвайры остались синхронными на каждый
scroll-тик; сам тик (haptic + `_updateActive`) заведён через `requestAnimationFrame` — не
больше одной записи на кадр. Тестовые харнессы (`test/drum-harness.js`, `test/drum-init.test.js`)
держали `window` без `addEventListener` — импорт `haptic()` из `shared/utils.js` (модульный
side-effect на `pointerdown`) валил их на загрузке; докручены no-op стабы
`addEventListener`/`removeEventListener` + синхронный `requestAnimationFrame`. Полный
прогон `test/drum-contract.test.js` + `test/drum-init.test.js` зелёный (32/32).

---

### A2 — живой Integrity.check после lazy load
**от:** Cursor · **P0** · **важность:** высокая · **тип:** контракт · качество · **размер:** S

**Для чего.** Канон обещает Contract-First: модуль на `window` обязан иметь методы. Файл `integrity.js` жив, с бута снят (правильно), **но никто не вызывает `check()`**.

**Почему важно.** Без вызова канон врёт команде. Дешёвый сторож ленивой загрузки Workout/Profile/Analytics/Claude — ловит «половина модуля не доехала» до того, как пользователь увидит белый экран.

**Не уязвимость.** Качество / наблюдаемость.

**Где.** `js/shared/integrity.js` · вызов после `_loadWorkout` / Profile / Analytics / Claude в `app.js`.

**Стоп.** `Integrity.check()` после каждого успешного lazy load; тест или явный assert в boot-graph-гарде.

---

### A1 — completeSession в workout.store
**от:** Cursor · **P0–P1** · **важность:** высокая · **тип:** качество · архитектура · **размер:** M

**Для чего.** Живая сессия в store, а финальная запись в IDB — в `handlers.js` (view). Эталон Store/View перевёрнут на главном флоу зала.

**Почему важно.** Новый код копирует гибрид. Тесты бьют UI вместо домена. Риск потери/двойной записи при правках summary/island.

**Не скорость и не CVE.** Долг роста.

**Где.** `js/workout.view/handlers.js` (`completeSession` → `DB.Workouts.save`) · цель: persist в `workout.store.js`, handlers только UI/тосты.

**Стоп.** Store пишет workout; handlers не импортируют `DB.Workouts` для complete; зелёный unit на persist без DOM.

**Стоп — закрыто 14.09.** Новый `persistFinalSession(state, summaryData, duration)` в
`workout.store.js` берёт весь блок сборки `session` + `DB.Workouts.save` + `DB.Events.log`
+ цикл `DB.OneRM.update` — ровно то, что раньше жило в `handlers.js` под приватным
`_persistFinalSession`. `handlers.js` теперь только зовёт store-функцию и делает UI-хвост:
idempotency-гвард на двойной тап, счётчик `usage.js`, `clearPersistedSession`,
`DynamicIsland.hide`, `releaseWakeLock`, `Timer.reset`, тост, ре-рендер `renderSelect`.
Остальные `DB.Workouts.getAll()` в handlers.js (превью на экране выбора, история) не
трогал — карточка про **complete**, не про весь файл. Юнит без DOM —
`test/persist-final-session.test.js` (8 тестов, `fake-indexeddb/auto`): форма сохранённой
строки, фильтр Camera 4 (`noDb`), перенос `tag`, `prs`/`blockTimings` из summary, запись
`workout_complete` в Events, обновление 1RM только по лучшему завершённому подходу.
`npm test` — 1275/1275.

---

### A3 — единый Haptic Gate
**от:** Cursor · **P1** · **важность:** средняя · **тип:** качество · закон · **размер:** S–M

**Для чего.** Канон: вибрация только через `haptic()` из `utils.js`. Сейчас `navigator.vibrate` в handlers/modals/render/profile/privacy/drum/plate-calc/…

**Почему важно.** Не баг для пользователя. Закон процесса, который агенты обходят каждый PR → дрейф конвенций.

**Где.** grep `navigator.vibrate` под `js/` · заменить на `haptic()`.

**Стоп.** Ноль прямых вызовов вне `utils.js`; опционально тест-гард.

**Стоп — закрыто 13.09.** Прямой `navigator.vibrate` вычищен из `profile.js`,
`privacy.view.js`, `island-settings.view.js`, `plate-calc.js`, `workout.view/handlers.js`,
`workout.view/modals.js`, `ui/gravity-submit.js`, `ui/drag-number.js`, `ui/drum-picker.js`
(последний — тем же заходом, что `DRUM-TICK`); мёртвая копия `_haptic()` в
`workout.view/render.js` удалена. Тест-гард — `test/haptic-gate.test.js`: greps
`js/*.js` + `js/**/*.js` (оба паттерна — `git ls-files` матчит только вложенные пути на
одном `**`, топ-уровневые файлы `js/` иначе проходят мимо гарда молча) за вычетом
`shared/utils.js`, строки-комментарии вырезаются перед матчем (иначе комментарий в
`intel.view.js`, упоминающий `navigator.vibrate`, красит гард на прозе). Ловушку и починку
проверял искусственным нарушением до и после — гард действительно падает и действительно
зеленеет обратно.

---

### A6+A7 — nav:back на Body и Intel
**от:** Cursor · **P1** · **важность:** средняя · **тип:** UX · дыра · навигация · **размер:** S

**Для чего.** `s-body` без кнопки назад (тупик). Intel закрывается hard `Nav.go('s-home')` — ломает «откуда пришёл».

**Почему важно.** Закон четырёх вкладок + `nav:back` на экранах вне таб-бара. Полевой Back на телефоне.

**Не визуал.** UX / история.

**Где.** `js/body-stats.js` · `js/intel.view.js:17` · сторож `test/nav-law.test.js`.

**Стоп.** Body имеет `data-action="nav:back"`; Intel закрывается через history/`nav:back`.

**Стоп — закрыто 13.09.** Кнопка добавлена только в стандалон-хост (`root.id ===
'body-stats-root'`) — вложенный в Athlete Room `ar-body-stats-root` уже накрыт вкладочной
навигацией, второй Back там был бы лишним. `intel:close` теперь `history.back()`; Intel
открывается исключительно через `Nav.go('s-intel')` (`claude.view.js:302`), которая пишет
history-запись, так что откат всегда попадает туда, откуда пришли.

**Отдельная находка закрыта 14.09 (A6-follow-up).** У `s-body` не было ни одной точки
входа — проверка показала, что Body Metrics уже полностью дублируется вкладкой «Замеры»
Athlete Room (`ar-body-stats-root`, вход через `pp:openMetrics` из паспорта профиля).
Стандалон-экран был чистым дублем, не забытым входом — снесён целиком (`Nav.on('s-body')`,
`lazy-css`, `#s-body`/`#body-stats-root` в `index.html`, ветка `isStandalone` в
`body-stats.js`). Гард `test/nav-law.test.js` теперь проверяет, что `s-body` отсутствует.

---

### A14-хвост — Dynamic Island с critical path
**от:** Cursor · **P1** · **важность:** средняя · **тип:** скорость · **размер:** S

**Для чего.** BOOT-TRIM снял Athlete Room / Integrity / panda / privacy.view / rest-timer / pip. Island всё ещё static import + `modulepreload`.

**Почему важно.** Первый кадр Home парсит остров, который пуст до idle-init. Не гигантский файл, но остаток boot-долга.

**Мина — переписана 13.09 (Claude), прежняя формулировка неверна.** Стояло «CSS нельзя
отложить без вспышки». По коду CSS **уже отложен**: `ensureCss('css/dynamic-island.css')`
стоит внутри idle-`defer`, `js/app.js:252`, а сам статус-бар рисуют статичная разметка
(`index.html:456`) и инлайн-CSS — острову он ничего не должен. Вспышки не будет.

Реальный риск другой: все потребители зовут остров через `window.DynamicIsland?.` (rest-timer,
timer, handlers, island-settings), и сегодня объект существует с первой строки за счёт
статического импорта. На восстановлении сессии бут уходит в `Nav.go('s-train')`
(`js/app.js:285`) и может дойти до `show()` раньше idle-инициализации — тогда вызов молча
никуда не попадёт. Снимать с ленивым шимом на `window`, как сделано для `AthleteRoom`
(`js/app.js:83`), а не просто убрав `import`.

**Где.** `js/app.js:14` / `:82` / `:252` · `index.html:111` modulepreload · `test/boot-graph.test.js`.

**Стоп.** Island не в eager-графе entry, и прямой запуск на восстановленной сессии показывает
живой HUD острова (полевой чек, не только тест) **или** доказано замером, что вынос не стоит
ничего → карточка закрывается с вердиктом «оставить».

---

### A5 — BLOCK_NAMES_EN вне chamber-pill
**от:** Cursor · **P2** · **важность:** низкая · **тип:** качество · **размер:** S

**Для чего.** `workout.store` импортирует `chamber-pill.js` ради констант; файл с `innerHTML`. Store → DOM-adjacent.

**Почему важно.** Мелочь, от которой гниёт «store = zero DOM».

**Где.** `js/workout.store.js:7` · вынести константы в нейтральный модуль.

**Стоп — закрыто 16.09.** `BLOCK_NAMES`/`blockLabel`/`BLOCK_NAMES_EN` переехали в новый
`js/shared/block-names.js` (ноль DOM). `chamber-pill.js` реэкспортирует их для старых
импортов (`render.js`, `summary.js`, `test/hybrid-preset.test.js`) — переписывать вызовы
не требовалось. `workout.store.js:7` теперь берёт константы напрямую из `block-names.js`,
`chamber-pill.js` в графе store больше не участвует. Модуль статически висит в первом
кадре (транзитив `workout.store.js`) — добавлен `modulepreload` в `index.html` рядом с
`chamber-pill.js`, иначе `test/boot-graph.test.js` красил на «ушёл в ASSETS_WARM мимо
install-фазы»; `keepPreload` в тесте и `sw.js` (`npm run build:sw`) обновлены. `npm test`
1345/1345.

---

### A8 — тонкий dashboard.store
**от:** Cursor · **P2** · **важность:** высокая для роста · **тип:** качество · скорость · **размер:** M

**Для чего.** Home — монолит без store. Любая фича на дашборде раздувает critical path.

**Почему важно.** Этап 2 роадмапа. После A1 — следующий большой кусок Store/View.

**Не делать.** Резать HTML в том же PR. Сначала read-модель (тоннаж, streak, next day).

**Где.** новый `js/dashboard.store.js` · потом тонкий `dashboard.js`.

**Стоп — закрыто 14.09.** `js/dashboard.store.js` (zero DOM): `getVolumeSummary`,
`getNextType`, `computeStreak`. `dashboard.js` зовёт store вместо инлайн-вычислений,
HTML не резал — нарезка шаблона остаётся следующим шагом. Задел бут-граф (`dashboard.js`
грузится eagerly) — добавлен `modulepreload` в `index.html`, `sw.js` пересобран.
`test/dashboard-store.test.js` (9 тестов). PR #367; попутно закрыт отдельным PR #368
потолок трекнутых файлов (`H-4`, 450→480) — main сидел без запаса.

---

### A10 — промпты коуча в lib/prompts/
**от:** Cursor · **P2** · **важность:** средняя · **тип:** backend · **размер:** S

**Для чего.** System prompts живут в `routes/coach.js` рядом с SSE/TTS. Смена тона = правка HTTP-файла.

**Почему важно.** Этап 6 роадмапа («pro coach»). Версионирование промпта отдельно от транспорта.

**Не менять.** Контракт SSE, схемы zod, лимитеры — только вынести строки.

---

### A12 — снять Firebase-призрак — ЗАКРЫТА (10.10, в составе PERIM-2)

`/api/firebase-config` снят, `test/smoke.test.js` ждёт 404. `connect-src` сужен до `'self'` + `*.supabase.co`
(заодно ушли Anthropic/Google), гард — `test/perimeter-guard.test.js`. Детали — CHANGELOG § PERIM-2.
**За Gio:** строки `FIREBASE_*` в `.env.example` и переменные в Vercel.

---

### CURSOR-OFF — декомиссия Cursor из контура — ЗАКРЫТА (23.09), место 4 за Gio

Решение Gio 20.09: Cursor отключён. Сделано: `.cursor/`, `.cursorignore`, `test/cursor-night-guard.test.js` удалены (AGENT-9 снята); гард префикса блокирует новые `cursor/*` (`retiredVerdict`), `cursor` в `TOOLS` scorecard оставлен ради истории; правила, `agent-rules-parity`, eslint, скилл `agent-brief` вычищены.

**Место 3 закрыто 23.09.** Аномалия из предыдущей сессии (Bugbot срабатывал `skipping` на каждый PR после отключения репозиторного контура) подтверждена и закрыта: Gio снял GitHub App в Settings → Applications. Подтверждение — PR #425 (до снятия) нёс строки `cursor` в `gh pr checks` («skipping»), PR #426 (после) их не несёт вовсе.

**Место 4 остаётся за Gio:** проверить интеграцию Cursor в Vercel `gio-g7/athlete-pro-v7`.

---

### SALV-3 — судьба `exercise-history-main-e57957` — ЗАКРЫТА ВЕРДИКТОМ (20.09)

Ветку **в расход.** Разбор по коммитам, а не по ощущению.

**Цифры протухания.** Точка ветвления `b79d532` от 2026-08-16; в `main` с тех пор **243 коммита**. Переписан в main **каждый** файл кода, который ветка трогает: `intel.view.js` — 15 коммитов, включая полную перестройку `A9` (11 → 0 прямых `DB.*`, 1102 → 941 строки), `locale.store.js` — 17, `workout.view/handlers.js` — 13, `dashboard.js` — 10. Ребейз 3180 строк по такой базе — не работа, а лотерея.

| Коммиты | Что | Вердикт |
|---|---|---|
| `f2e1b455` | AN-2, история упражнений + кривые | **Влито отдельно** (`e44a869e`) — выбросить |
| `fa0830ab` + `b0fd2358` | ClockSpinner/TimerLinear в RestTimer HUD и ревёрт того же | **Автор сам откатил** — выбросить пару |
| `d46e39e0` `80026482` `efd1a432` `95313508` `f7fdb95b` `2088bc79` `a7e76309` `55d30c9a` `87e97164` | voice-HUD · PANDA · фоллбэки коуча | **В main нет.** Смысл переносить заново от свежего `origin/main` — карточка `PERIM-1` |

**Два «уникальных» файла проверены, оба не вливать.**

- `.claude/rules/omni_scenarios.md` (63 стр.) — уникального содержания **ноль**: «1 сессия = 1 задача», триада ЦЕЛЬ/ГДЕ СТОП/НЕ ТРОГАТЬ, «рекомендация, а не меню», канон панды — всё уже в `CLAUDE.md`, `.claude/rules/`, скилле `agent-brief`. Константы панды (`TALK_MAX_WORDS`, `SILENT_MOODS`, `talkDurationMs`) живут не в правиле, а в коде — `js/shared/panda-mood.js:120-145`. Плюс файл **врёт числом**: потолок прекеша 1.5 МБ, тогда как main на 1.55 МБ и двухфазном. Плюс эмодзи в заголовках против собственного правила репозитория.
- `test/dashboard-boot-motion.test.js` (89 стр.) — греп по `index.html`/`base.css`/`dashboard.js` на присутствие строк, не проверка поведения. Ровно тот класс, на который жалуется полевой хвост `HYG-6` («тесты кроют исходник, а не палец»). Если моторике нужен гард, писать его заново под `MOTION-FIX`, а не тащить этот.

**Сделано 20.09.** Ветка была только локальной — 12 коммитов исчезли бы насовсем, поэтому сперва тег, потом удаление: `rejected/exercise-history-2026-08-16` → `b0fd2358`, запушен на origin, оба «уникальных» файла из него достаются. Ветка удалена.

Тег при этом делает линию **снова нарезаемой** — ровно мина из шапки `scripts/rejected-lines.mjs` (ворктри трижды приезжал от отвергнутой линии). Поэтому тем же заходом заведена строка в `REJECTED_LINES`, якорь — SHA, не имя тега. Переносу смысла через `PERIM-1` это не мешает: гард ходит по ancestry, переписанный с нуля код потомком `b0fd235` не является.

**Осталось.** **Разморозить `PERIM-1`** из `docs/_archive/HANDOFF_next_cards.md` — там разобраны три конкретные находки (лимит `express.json` в `server.js`, `vercel.live` в CSP мимо `test/perimeter-guard.test.js`, смена контракта `routes/coach.js` 500 → 200), и это единственное живое, что осталось от линии.

---

### E2E-1 — `E2E_BASE` закрывает только `page.goto` — ЗАКРЫТА (04.10, без бампа)

`playwright.config.js`: `use.baseURL` читает `E2E_BASE`, так что `request.get('/sw.js')` идёт туда же, куда `page.goto(BASE)`. С `E2E_BASE` блока `webServer` нет, сервер держит человек. Без него `reuseExistingServer: false`: занятый `:3000` даёт отказ «is already used» до первого теста.
Поправка к карточке: `!process.env.CI` локально равно `true`, а это тот самый молчаливый реюз. На поломку (посторонний сервер на `:3000`) база отдала `sw.js` HTML чужого, ветка отказала громко. CI не изменился. Детали — `CHANGELOG.md`.

---

### A18 — мёртвый код в `claude.view.js` — ЗАКРЫТА (07.10, 1.27.155)

`_toggleEngine` удалён вместе со строкой экспорта (решение Gio 06.10): переключатель движка
один — `ai:setEngine` → `_onSetEngine` в `js/ai-settings.view.js`. Сняты пять `no-unused-vars`
(`COMPUTE_REST_HOURS`/`Heatmap`/`MUSCLE_MAP`, `WorkoutState`, `buildBodySVG`) и ставший мёртвым
импорт `setEngine`; `npx eslint js/claude.view.js` — 0 warn, бут-граф без изменений. Детали — `CHANGELOG.md`.

---

### A16 + A17 — мёртвый tokenUsage и longTermStats — ЗАКРЫТА (22.10)

**A16.** `lib/tokenUsage.js` снесён: ноль импортёров, динамической загрузки из `lib/` в `server.js`,
`api/`, `routes/` нет, конфиги его не перечисляли. Бампа нет — правка вне `js/`/`css/`.
**A17** закрыта фактически в CORE-4 (`1338a293`, 1.27.131), отмечена 22.10: `longTermStats`
из схемы coach убран, `test/coach-validate.test.js:123` сторожит, что поле до промпта не доходит.

---

### A9 — Intel: сеть/DB из view — ЗАКРЫТА (17.09, 1.27.117)

Семь функций IO переехали в `js/intel.store.js` (`streamCoachReply`, `synthesizeSpeech`,
`fetchWeeklyReport`, `fetchBiometricsScan`, `savePlannedWorkout`, `probeKeyState`,
`getAutoSpeech`); `intel.view.js` 1102 → 941 строк, прямых `DB.*` 11 → 0, `fetch` — 0.
Гарды `intel-engine-wiring` переехали на стор вместе с кодом и проверены на поломку;
сверх прежних добавлены два: экран без сети/DB и один `stripSecrets` на профиль.

---

### A13 — профиль: один владелец экрана — ЗАКРЫТА (18.09, 1.27.119)

Настройки, маскот, паспорт, бэкап/импорт, удаление и источники TXT-журнала переехали
в `js/profile.store.js`; `profile.js` остался владельцем экрана и DOM. Прямых `DB.*`:
`profile.js` 39 → 0, `profile.view.js` 6 → 0, `profile.view/settings.js` 1 → 0 (третий —
ложное срабатывание на JSDoc, гард теперь режет комментарии тем же `stripComments`).
Гард удаления данных переехал за кодом на стор и получил вторую проверку — кнопка экрана
обязана дотягиваться до этого пути; новый `test/profile-store.test.js` держит дефолты,
границы и парные записи, прогнан на поломку. `mapOneRMs` оставлен во view намеренно:
`js/shared/lift-map.js` снят с бут-графа, статический импорт в стор вернул бы его
в install-фазу прекеша.

---

### A15 — views не пишут в IDB (правило + hot path)
**от:** Cursor · **P2** · **важность:** высокая для роста · **тип:** качество · **размер:** L

**Для чего.** Analytics/profile/intel/handlers зовут `DB.*` напрямую. Journal — эталон (view без DB).

**Как брать.** Сначала правило для нового кода + A1; массовая миграция — отдельными PR по поверхности.

**Прогресс — 14.09 (остаётся partial).** Правило в `architecture.md` + baseline-гард
`test/import-guard.test.js`. Первая миграция: `analytics.view.js` → `analytics.store.js
::removeCalendarEntry`. **17.09 (A9):** вторая поверхность — `intel.view.js`, 11 → 0.
**18.09 (A13):** третья — экран профиля, 46 → 0 на трёх файлах.
**20.09:** четвёртая — `claude.view.js`, 5 → 0 (см. ниже). **17.10:** пятая и шестая —
`ai-settings.view.js` 3 → 0 (`getAllSettings` в `ai-settings.store.js`, 1.27.187) и
`privacy.view.js` 6 → 0 (`loadPassportData`/`eraseAllUserData` в `privacy.store.js`, 1.27.188).
`workout.view/render.js` 2 → 0 (`loadWorkoutHistory`/`loadRecentWorkouts` в `workout.store.js`, 1.27.192).
**18.10:** последняя — `workout.view/handlers.js` 4 → 0 (`loadWorkoutHistory`/`loadRestDurationSetting`/`loadKeepAwakeSetting` в `workout.store.js`, 1.27.193). A15 закрыта.

**Остаток A15:** нет — все BASELINE-строки `test/import-guard.test.js` равны 0
(`workout-ai.view.js` 3 ушёл вместе с модулем, `CORE-10`). Новый долг режет гард.

---

### A15-claude — экран FAB не ходит в базу — ЗАКРЫТА (20.09, 1.27.120)

`js/claude.view.js` 5 → 0. Чтение ключа BYOK → `hasLocalKey(engine)` в
`ai-settings.store.js` (наружу булево, не строка ключа); видимость маскота →
`getPandaHidden()`/`hideMascot()`, владелец пары `ai-panda-hidden`+`show-mascot` остаётся
один — `profile.store.js`, а `claude.store.js` только реэкспортирует адрес для своего view
(новых рёбер в бут-графе нет, `claude.store.js` уже импортировал `profile.store.js`).
Гард — `test/claude-store.test.js`, 10 проверок, прогнан на поломку.

**Две находки переноса, обе латентные — в поле не горело ни одной.** Крестик на панде
писал пару ключей сам, но писал ОБЕ половины верно: сломано не было, цена — третья копия
записи (считая `dashboard.js:497`, который пишет только `show-mascot`).
`_toggleEngine()` обходил `setEngine()`, то есть airgap-стоп и событие `ap-ai-engine`, —
дыра настоящая, но недостижимая: вызывающих у функции нет.

**Хвост — карточка `A18` выше, закрыта 07.10:** `_toggleEngine()` удалён.

---

### GATE-DESCRIBE — упавший `describe` не краснит `npm test` — ЗАКРЫТА (22.10, без бампа)

`npm test`/`test:all` идут через `scripts/run-unit-tests.mjs`: тот же `node --test`, красный при
`not ok` в TAP на любой вложенности (кроме `# TODO`/`# SKIP`) или ненулевом exit. Молча терялась
только сюита, бросающая до первого `it()`. Гард — `test/gate-describe.test.js`, прогнан на поломку.
Не взято: «расхождение числа сюит» из ЦЕЛИ и пустой глоб (`# tests 0`, exit 0): вне ЦЕЛИ наряда, решает LEAD.

### HOME-1 хвост — `_calcConsistency` считает неделю от эпохи — закрыта 22.10 (1.27.195)

Неделя с понедельника через `weekKey` + новый `weekKeyAgo(ts, n)` из `js/shared/week.js`; условие
значка прежнее. Гарды: `test/athlete-room-consistency.test.js`, в `test/week.test.js` — «ключ недели
делением на 7 суток» по всему `js/`. Детали — CHANGELOG 1.27.195.

---

## Что не делать (от Cursor)

- React / Vue / бандлер / миграция на TypeScript «для скорости»
- `npm run format` по всему репо
- Править `sw.js` руками
- Включать `drum-virtual` / `drum-window` без поля Gio
- Параллелить две поверхности A15 в одной ветке (по одной за PR, как A9 и A13)
- ~~Брать MOTION-FIX до закрытия LAUNCH-10~~ — **снято Gio 20.09**, заморозка была привязана к полю, а поле переехало на Android
- Ставить `MO-*` вперёд `MOTION-FIX` — порядок внутри моторики остаётся жёстким
- Класть числа/SHA в `NEXT_SESSION.md`

## Связь с метриками

После закрытия карточки: обновить строку в `docs/ARCHITECTURE_SCORECARD.md` §3 → пересчитать шапку.
На 2026-09-17: архитектура **74.3%**, долг аудита **65%** (A1/A2/A3/A4/A5/A6/A7/A8/A9/A11 done;
A14/A15 partial). Число здесь протухает первым — сверять с §3 скоркарда, а не с этой строкой.

Перф-карточки (`MEASURE-1`, `PERF-HIST`, `PERF-INLINE`, `PERF-BLUR`, `NAV-1`, `DRUM-TICK`)
в долг аудита A1–A17 **не входят** и знаменатель 17 не меняют — они из другого замера
(13.09, кадр и ввод). Закрытие `PERF-HIST` двигает слой «Нарезка монолитов» и строку
Workout в §1, `NAV-1` — слой «Навигация / shell».
