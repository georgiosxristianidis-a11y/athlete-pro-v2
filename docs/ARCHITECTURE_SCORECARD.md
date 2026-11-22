# Architecture Scorecard — Athlete Pro

> Проф-метрики фазы «Архитектура». Не роутер задач (тот — `NEXT_SESSION.md`).
> Карточки Cursor с метками — `docs/handoff/HANDOFF_cursor_arch_cards.md`.
> Обновлено: **2026-11-22** · база замера: `1.27.245` (`origin/main` `3108b3ce`) · дерево: `main`
> Источник аудита: сессия 2026-08-31 (Store/View × backend × data × sync).
>
> **Пересчёт под закрытую A11 (09-13).** PR #345: `_netBlocked()` на process/pull/keep-alive/signIn.
> **Пересчёт под A1/A8/A3/A6/A7 (09-14).** §3 не подтягивался за фазой 2 перф-трека (A3/A6/A7
> закрыты 13.09, статус тут остался «open») — поймано при закрытии A1; A8 (read-модель
> `dashboard.store`) добавлен тем же днём.
> **Пересчёт под A2/A5 (09-16).** §3 не подтягивался за мёржем A2 (14.09, `f038f4f6`) — статус
> оставался «open», хотя `Integrity.check()` уже стоит после каждого lazy load. A5 закрыта тем же
> заходом (`block-names.js`).
> **Пересчёт под A9 (09-17).** Intel перестал быть гибридом: сеть, SSE и IDB ушли в
> `intel.store.js`, экран поднялся 25 → 85. Архитектура **74.3%**, долг **65%**. Карточки для
> сортировки — handoff Cursor.
> **Пересчёт под A13 (09-18).** Профиль повторил путь Intel: 46 прямых `DB.*` на трёх файлах
> экрана → 0, всё через `profile.store.js`; поверхность 40 → 85. Архитектура **75.7%**,
> долг **71%**.
> **Пересчёт под A16/A17 (10-22).** A16 (`lib/tokenUsage.js` снесён) и A17 (`longTermStats`
> убран в CORE-4, `1338a293`) → `done`. Попутно в счёт вошла A12 — `done` с 10-10 (PERIM-2),
> но в «12/17» её не было. Долг **91%**; архитектура §1 не пересматривалась.
> **Пересчёт 22.11 (AUD-6, база 1.27.245).** §1 впервые пересмотрен кодом после 18.09: grep `DB.`
> по всем файлам `js/`, размеры файлов, `routes/`, `lib/`. Архитектура **75.7% → 75.7%** (две
> поверхности выросли, одна всплыла и съела прирост, см. §1). Долг **91% → 94%** (A14 → `done`).
> Главная находка: гард A15 видит только `*.view.js` и `profile.js` — Dashboard, Onboarding,
> Body stats, Athlete Room и два мелких файла зовут `DB.*` мимо него.

## Сводка

| Метрика | Значение | Как читать |
|---|---|---|
| **Архитектура в целом** | **75.7%** | Зрелость слоёв (ниже). Не «сколько фич». |
| **Долг аудита закрыт** | **94%** | 16 `done` из 17; открыта одна — A10 (промпты коуча). |
| **Этап 2 роадмапа** (`ROADMAP` §2) | **~62%** | Store/View + нарезка монолитов. |
| **Этап 3 роадмапа** (`ROADMAP` §3) | **~70%** | Thin `server.js` есть; промпты/auth — нет. |
| **LAUNCH-код** | **~97%** | Код трека влит; осталось поле Gio + **AI-1**. |
| **BOOT-TRIM** | **закрыт** | PR #321 + #328 · `test/boot-graph.test.js` |

> **Поправка арифметики (09-12).** Стояло «60%» при том, что сумма вкладов в §1 давала 65.0 —
> итог не пересчитывали после правок весов, и скоркард занижал себя на пять пунктов. Тогда
> вышло 66.0: +1 за `privacy.view` с бута (98→100% по boot graph, 85→95% по Privacy), −0.5 за
> честную оценку sync (65→60%, см. A11). Итог обязан равняться сумме столбца «Вклад» —
> если не равен, верить столбцу, а не шапке. Сейчас там 68.5 (sync 60→85 за A11).

Пересчёт: при закрытии пункта меняй статус в таблицах → пересчитай две верхние строки.
Формулы внизу файла.

---

## 1. Зрелость слоёв (→ 75.7%, замер 22.11)

Веса фиксированы. «Done%» — экспертная оценка по коду на дату замера.

| Слой | Вес | Done% | Вклад | Доказательство |
|---|---:|---:|---:|---|
| Store/View по поверхностям | 30% | 68.2% | 20.46 | Журнал, Privacy, Workout, Intel, Profile, Analytics, Claude FAB — во view ноль `DB.*` (гард A15). Гибриды остались: Dashboard (8 вызовов в `dashboard.js`), Onboarding (11), Body stats (5), Athlete Room (17, в таблице с 22.11) |
| Нарезка монолитов | 15% | 55% | 8.25 | `workout.view/*` (9 файлов) и `analytics.*` да; `dashboard.js` 1303 строки — монолит. Шесть файлов >1000 строк (`workout.store` 1651, `locale.store` 1314, `dashboard` 1303, `intel.view` 1167, `athlete-room` 1166, `handlers` 1041) — AUD-4 держит потолок, но не режет |
| Навигация / shell | 10% | 85% | 8.5 | 4 вкладки + overlay registry; A6/A7/NAV-1 закрыты — `s-body` снесён (не просто чинён, follow-up 1.27.108) |
| IndexedDB / data | 15% | 90% | 13.5 | `js/db/*` v4, facade, миграции, soft-delete workouts |
| Backend wiring | 10% | 75% | 7.5 | `server.js` 242 строки; `routes/coach.js` 655, `_buildSystemPrompt` в нём же (`routes/coach.js:600`), `lib/prompts/` нет (A10 open) |
| Sync / privacy enforcement | 10% | 85% | 8.5 | `safeFetch` + LWW; airgap закрыт на всех четырёх выходах — `process()`, `pull()`, keep-alive, `signIn()` (#345, `_netBlocked()`), поведенческий гард `test/sync-privacy-gate.test.js`. Не 100%: барьер не общий, см. §5 |
| PWA / SW / boot graph | 5% | 100% | 5.0 | `build:sw`, two-phase; с бута сняты Athlete Room / Integrity / panda (#321) и `privacy.view` / `rest-timer` / `pip` (#328) |
| Контракты / Integrity | 5% | 80% | 4.0 | `integrity.js` жив, A2 (14.09): `Integrity.check()` зовётся после каждого lazy load (Workout/Profile/Analytics/Claude/Athlete Room, `js/app.js`). Не 100%: сам гард best-effort, не покрывает все контракты исчерпывающе |
| **Итого** | 100% | | **75.71 ≈ 75.7** | сумма столбца «Вклад»: 20.46+8.25+8.5+13.5+7.5+8.5+5.0+4.0 |

### Store/View по экранам (среднее → 68.2%)

| Поверхность | % | Статус |
|---|---:|---|
| Journal | 100 | Закон: store без DOM, view без `DB` |
| Privacy | 95 | Store владеет режимом, паспортом и стиранием (A15, 17.10: `privacy.view` без `DB.*`); **с бута снят (#328)** — `app.js` держит только `privacy.store` |
| Workout | 90 | Store + `workout.view/*`; A1/A4 закрыты — `completeSession` персистит через `workout.store.js`, handlers только UI/тосты; A5 закрыта (16.09) — `BLOCK_NAMES_EN` переехал в `block-names.js`, store больше не тянет DOM-adjacent `chamber-pill.js` |
| Body stats | 60 | `.core` чистый (`DB.` только в JSDoc); `body-stats.js` зовёт `DB.Settings`/`DB.Metrics` 5 раз (`:87-91`, `:351-352`), `body-stats.store.js` нет |
| Analytics | 80 | `analytics.store.js` 687 строк; в `analytics.*` ноль `DB.*` (A15 14.09, `removeCalendarEntry`). Не 100 — `analytics.view.js` 833 строки |
| Claude FAB | 80 | A15-claude (20.09): `claude.view.js` ноль `DB.*`, ключ и маскот через `claude.store.js` / `ai-settings.store.js`. Не 100 — стор 131 строка, часть логики осталась во view (331) |
| Profile | 85 | A13 (18.09): настройки, маскот, паспорт, бэкап и удаление в `profile.store.js`; во всех трёх файлах экрана ноль `DB.*`. Не 100 — `profile.js` всё ещё держит разметку экрана рядом с хендлерами настроек |
| Onboarding | 35 | F-7/F-8 закрыты; один гибрид-файл 632 строки, 11 `DB.*` (`onboarding.js:126-173`), стора нет |
| Intel | 85 | A9 (17.09): сеть, SSE, IDB и окно недели в `intel.store.js`; view без единого `DB.*` и `fetch`. Не 100 — разметка отчёта и виджетов всё ещё в экране |
| Dashboard / Home | 20 | `dashboard.store.js` 136 строк — тоннаж/streak/next-type (zero DOM, A8); `dashboard.js` 1303 строки, 8 `DB.*` (`:538-562`, `:890-892`, `:1137`) |
| Athlete Room | 20 | **Новая строка 22.11.** `shared/athlete-room.js` 1166 строк, 17 `DB.*` (`:289-296`, `:830-1112`: имя, цвет, рамка, фото), стора нет. Раньше в таблицу не входила — прирост Analytics/Claude (+5 к среднему по 10 строкам) ушёл на честный знаменатель 11 |

---

## 2. Уже сделано (baseline + закрытое после аудита)

### Baseline (было до аудита — считать «сделанным»)

- [x] ES-модули везде, без циклов на горячем пути
- [x] `js/db.js` facade + `js/db/core.js` миграции (`DB_VERSION = 4`)
- [x] Thin `server.js` → `routes/coach` + `routes/integrations` → `lib/aiOrchestrator`
- [x] Zod + раздельные rate-limit на AI-маршрутах
- [x] Privacy tri-state + `safeFetch(kind)` (дефолт airgap)
- [x] LWW sync (`lww.js`, `sync-merge.js`, tombstones, secret strip)
- [x] Nav: 4 вкладки, View Transitions queue, CSS-before-paint
- [x] Overlay registry (Athlete Room + Back/Escape)
- [x] SW генерируется (`npm run build:sw`), two-phase precache
- [x] Feature flags + kill-switch (`flags.js`)
- [x] Workout разрезан: `workout.store` + `workout.view/{render,handlers,modals,summary}`
- [x] Journal — эталон Store/View
- [x] Сторы `*.store.js` без DOM API (закон «store = zero DOM» держится)

### Закрыто после аудита / параллельно

| Пункт | Версия / PR | Доказательство |
|---|---|---|
| F-7 / F-8 — явный пол и приватность | 1.27.87 | `blankOnboardingData`; `canAdvanceFromStep`; `test/onboarding-defaults.test.js` |
| Motion bars без двойного драйвера | 1.27.91 | Spring-only на `.orm-bar-fill` |
| Analytics field charts | 1.27.92+ | period 7/30/90; Strength Index tap; monotone cubic |
| **BOOT-TRIM** — Athlete Room / Integrity / panda с critical path | PR #321 | `test/boot-graph.test.js`; lazy `athlete-room`; Integrity не в графе |
| **A4** — `Workout.load` без log и утечки interval | **1.27.95** | один `_staleTimer` + снятие по `ap-nav-change`; `test/workout-load.test.js` |
| **BOOT-TRIM, второй заход** — `privacy.view` / `rest-timer` / `pip` с критического пути | PR #328 · 1.27.99 | `app.js` держит только `privacy.store`; `rest-timer` ушёл в динамический `import()` — закрывает хвост A14 по privacy |
| Полевая аналитика — период 7/30/90, тап по индексу, монотонные кривые | PR #314 · 1.27.99 | `test/analytics-charts.test.js`; движок sparkline вынесен в `js/shared/sparkline.js` |
| Недельный отчёт переживает падение ИИ; огрызок BYOK не уезжает | PR #297 · 1.27.99 | `test/coach-weekly-fallback.test.js` — **но гард зелёный только без ключа провайдера, см. §7** |
| **A11** — airgap закрывает отправку синка, а не только приём | PR #345 · 1.27.101 | `_netBlocked()` на `process`/`pull`/keep-alive/`signIn`; `test/sync-privacy-gate.test.js`. Ломался не дефолт, а **отзыв согласия**: вошёл в Cloud → переключился в airgap → сессия жива → очередь продолжала отгружать. Очередь при этом не выбрасывается — вернулся в Cloud, накопленное доезжает |

---

## 3. Долг аудита — backlog (→ 94% закрыто, замер 22.11)

Статусы: `open` · `partial` · `done`. Считать «закрытым» только `done`.
Карточки с пояснениями — `docs/handoff/HANDOFF_cursor_arch_cards.md`.

| # | Пункт | Статус | Где смотреть (2026-09-13) | Next |
|---|---|---|---|---|
| A1 | `completeSession` → `workout.store` | **done** (09-14) | `workout.store.js` — `persistFinalSession()`; `handlers.js` больше не импортирует `DB.Workouts`/`DB.Events`/`DB.OneRM` для complete; юнит `test/persist-final-session.test.js` без DOM (fake-indexeddb). PR — см. хендофф Cursor · 1.27.109 | — |
| A2 | Вызвать `Integrity.check` после lazy load | **done** (14.09) | `js/app.js` — `Integrity.check()` после каждого lazy load (Workout/Profile/Analytics/Claude/Athlete Room). `f038f4f6` · 1.27.111 | — |
| A3 | Единый Haptic Gate | **done** (13.09) | Прямой `navigator.vibrate` вычищен по всему `js/`; `haptic()` из `utils.js` единственный вход; гард `test/haptic-gate.test.js`. 1.27.106 | — |
| A4 | Утечка `setInterval` + `console.log` в `Workout.load` | **done** | `workout.view.js` — `_startStaleCleanup` / `_stopStaleCleanup` | — |
| A5 | `BLOCK_NAMES_EN` вне `chamber-pill.js` | **done** (16.09) | Константы (`BLOCK_NAMES`/`blockLabel`/`BLOCK_NAMES_EN`) переехали в `js/shared/block-names.js` (zero DOM); `workout.store.js:7` берёт их напрямую, `chamber-pill.js` реэкспортирует для старых вызовов. 1.27.115 | — |
| A6 | `nav:back` на `s-body` | **done** (13.09) | Кнопка назад заведена, затем follow-up (14.09) вовсе снёс мёртвый `s-body` — контент уже был во вкладке «Замеры» Athlete Room. Гард `test/nav-law.test.js`. 1.27.107→1.27.108 | — |
| A7 | Intel закрывается через history, не hard `s-home` | **done** (13.09) | `intel.view.js` — `intel:close` теперь через `history.back()`, не hard `Nav.go('s-home')`. Гард `test/nav-law.test.js`. 1.27.107 | — |
| A8 | Тонкий `dashboard.store` (read-модель) | **done** (09-14) | `js/dashboard.store.js` — `getVolumeSummary`/`getNextType`/`computeStreak` (zero DOM); `dashboard.js` зовёт store вместо инлайна, HTML не резал; `test/dashboard-store.test.js`. PR #367 · 1.27.110 | Нарезка HTML — отдельная карточка |
| A9 | Intel: сеть/DB из view → store/engine | **done** (17.09) | `js/intel.store.js` — `streamCoachReply`/`synthesizeSpeech`/`fetchWeeklyReport`/`fetchBiometricsScan`/`savePlannedWorkout`/`probeKeyState`/`getAutoSpeech`; в `intel.view.js` ноль `DB.*` (baseline A15 11 → 0) и ноль `fetch`. Гарды `test/intel-engine-wiring.test.js` переехали на стор. 1.27.117 | — |
| A10 | Промпты коуча в `lib/prompts/` | **open** (22.11) | `lib/prompts/` нет; `_buildSystemPrompt` по-прежнему в `routes/coach.js:600`, файл 655 строк | Не менять SSE; только вынести строки |
| A11 | Airgap-гейт в `SyncManager.process()` / `push` | **done** (09-13) | `_netBlocked()` в `js/sync.js` закрывает `process()`, `pull()`, keep-alive и `signIn()`; гард `test/sync-privacy-gate.test.js` шпионит по объекту `supabase`, а не по исходнику. PR #345 · `7b8304e` · 1.27.101 | — |
| A12 | Снять Firebase-призрак (CSP + endpoint) | **done** (10-10) | Взята в PERIM-2: `/api/firebase-config` снят (smoke ждёт 404), `connect-src` = `'self'` + `*.supabase.co`, гард `test/perimeter-guard.test.js`. `FIREBASE_*` в `.env.example` и Vercel — за Gio | — |
| A13 | Профиль: один владелец экрана | **done** (18.09) | `js/profile.store.js` — `getAllSettings`/`getStoredLang`/`adjustRestDuration`/`toggle*Pref`/`getNotifyRest`+`setNotifyRest`/`togglePandaHidden`+`revealMascot`+`hideMascot`+`getPandaHidden` (последние два — 20.09, A15-claude)/`loadPassportSources`/`getAvatarAppearance`/`exportBackupJson`+`saveLastExportAt`/`importBackupJson`/`deleteAllUserData`/`getAllWorkouts`/`deduplicateWorkouts`/`getGymPlace`+`saveGymPlace`/`loadTxtExportSources`; baseline A15 39 → 0 (`profile.js`), 6 → 0 (`profile.view.js`), 1 → 0 (`profile.view/settings.js`). Гард удаления переехал на стор, новый `test/profile-store.test.js`. 1.27.119 | — |
| A14 | Athlete Room / Island не на critical path | **done** (22.11) | Комната lazy (#321); `privacy.view` с бута снят (#328, `app.js` импортирует только `privacy.store`). Island снят с бута в 1.27.198: `import()` в idle + шим на `window.DynamicIsland` (`test/island-shim.test.js`) | — (HUD на восстановленной сессии проверен Playwright на 1.27.198: `47b212eb`; условие `done` из прежнего Next выполнено) |
| A15 | Views не пишут в IDB напрямую (кроме store) | **done** (18.10) | правило в `architecture.md` + `test/import-guard.test.js`; мигрированы `analytics.view.js::removeCalendarEntry` (14.09), весь `intel.view.js` (17.09, A9: 11 → 0), экран профиля (18.09, A13: 46 → 0 на трёх файлах), `claude.view.js` (20.09, 5 → 0), `ai-settings.view.js` (3 → 0, `getAllSettings` в `ai-settings.store.js`, 1.27.187) и `privacy.view.js` (6 → 0, `loadPassportData`/`eraseAllUserData` в `privacy.store.js`, 1.27.188; обе влиты 17.10) и `workout.view/render.js` (2 → 0, `loadWorkoutHistory`/`loadRecentWorkouts` в `workout.store.js`, 1.27.192) и `workout.view/handlers.js` (4 → 0, `loadWorkoutHistory`/`loadRestDurationSetting`/`loadKeepAwakeSetting` в `workout.store.js`, 1.27.193) — прямых вызовов `DB.*` в `*.view.js` и `profile.js` нет. **Оговорка 22.11:** гард (`test/import-guard.test.js`, `isViewFile`) не смотрит `dashboard.js`, `onboarding.js`, `body-stats.js`, `shared/athlete-room.js`, `app.js`, `rest-timer.js`, `shared/avatar-ring.js` — там 47 прямых вызовов (grep `DB.[A-Z]`), статус `done` честен по формулировке карточки, не по духу закона. Гард с 18.09 режет комментарии: JSDoc больше не считается вызовом | — (новый долг режет BASELINE в `test/import-guard.test.js`) |
| A16 | Мёртвый `lib/tokenUsage.js` | **done** (10-22) | Файл снесён: ноль импортёров, динамической загрузки из `lib/` нет, конфиги его не перечисляли | — |
| A17 | `longTermStats` в схеме без использования | **done** (10-22) | Поле убрано из схемы coach в CORE-4 (`1338a293` · 1.27.131); `test/coach-validate.test.js:123` сторожит, что до промпта не доходит. Отмечена 22.10 | — |

**Чистый `done`: 16/17 (A1–A9, A11–A17).**  
**Open: A10.**  
**94%** = `16 / 17` = 94.1, округление вниз.

Продуктовые закрытия (F-7/F-8, motion, analytics field, BOOT-TRIM) в A1–A17 не входят, кроме пересечения A14.

---

## 4. Next задачи — фазы (пересортировано 13.09)

Полные карточки — `docs/handoff/HANDOFF_cursor_arch_cards.md`, там же метки и «где стоп».
Каждый пункт ≤1 PR, база `origin/main`.

> **Что не отвечает этот скоркард.** Проценты выше мерят зрелость слоёв, и ни один из них не
> двигается от плавности. Ни одна из A1–A17 не касается рендер-цикла, жестов и анимаций —
> цель «ровные 60fps» этой метрикой не измеряется в принципе. Поэтому порядок ниже идёт от
> кадра, а не от процента, а перф-карточки живут своим замером и знаменатель 17 не меняют.

| Фаза | Порядок | Карточки |
|---|---|---|
| **0** | вернуть измеримость | `GATE-WEEKLY` · `MEASURE-1` |
| **1** | кадр и отзыв | `PERF-HIST` · `PERF-INLINE` · `PERF-BLUR` → `MOTION-FIX` (ждёт LAUNCH-10) |
| **2** | стабильность ввода | `NAV-1` · `DRUM-TICK` (+`A3`) · `A6+A7` |
| **3** | архитектура под рост | `A1`+`A8`+`A2`+`A5`+`A9` закрыты, `A15` закрыта (18.10) → `A13` |
| **4** | гигиена и поверхность | `A10` (остальное закрыто: A14-хвост, A16+A17) |
| **вне фаз** | блокер ссылки | `AI-1` |

Фаза 0 идёт первой не по важности, а по зависимости: пока локальный `npm test` красный от
`.env` (§7), «зелёный гейт» на любой карточке ниже — гипотеза, а без baseline перф-PR меряет
заплатку вместо проблемы.

Порядок фаз 1 и 2 упирается в поле: `MOTION-FIX` заморожен до закрытия `LAUNCH-10`, которое
закрывается тремя полевыми пунктами Gio. Три перф-карточки фазы 1 от него не зависят и
берутся сразу.

Параллельно Gio: `LAUNCH-10` поле. React / бандлер / TypeScript-миграция — **не брать**.

---

## 5. Чего не хватает архитектуре (кратко)

| Пробел | Почему важно |
|---|---|
| Симметрия Store/View | Сторы чистые; Dashboard, Onboarding, Body stats и Athlete Room пишут в IDB сами, мимо гарда A15 → новый код копирует гибрид |
| Доменный API сессии | Complete/cancel размазаны; тесты бьют UI |
| Контракт-first | Исправлено: Integrity снят с бута, но `Integrity.check()` зовётся после каждого lazy load (`js/app.js:36,52,71,321,370`, `test/integrity-wired.test.js`). Остаётся: гард best-effort |
| Privacy enforcement = политика, а не барьер | A11 закрыта, но способом «проверка в каждой функции»: `safeFetch()` прикрывает общий `fetch`, а Supabase SDK ходит своим — под него подложить обёртку нельзя, поэтому `_netBlocked()` стоит вручную на четырёх точках. Пятая появится молча: новая функция с сетью в `sync.js` попадёт наружу в airgap, и гард #345 её не увидит — он перечисляет вызовы поимённо. Настоящее закрытие — один барьер на выходе модуля |
| Промпты ≠ транспорт | Этап 6 роадмапа упирается в `routes/coach.js` |
| Нет слоя чтения над IDB | `DB.Workouts.getAll()` зовётся из 19 живых мест (grep 22.11) и каждый раз выгружает всю таблицу заново (`js/db/workouts.js:63`). `PERF-HIST` (1.27.102) убрал N-кратное чтение на конкретно этих двух путях — Train теперь читает историю раз на экран, а не на упражнение, бут зовёт `getLast(1)` вместо полного скана; многократность за пределами этих двух путей никуда не делась — кэша как не было, так и нет. Симметрично A15: там views пишут в IDB, здесь — читают без кэша |
| Закон кадра не записан | `.claude/rules/design.md` не содержит ни `transform`, ни `ease`, ни reduced-motion. Моторику судили по тексту промпта, который дрейфует вместе с чекаутом; PERF-2 сторожит только `css/**` и по своей же шапке слеп к инлайн `<style>` (`PERF-INLINE`) |

Не долг и не опция: React (и другие UI-фреймворки) — **не ставить**; стек остаётся Vanilla JS.

---

## 6. Формулы пересчёта

```
Архитектура% = Σ (вес_слоя × done%_слоя)
Долг%        = (n_done + 0.5×n_partial) / n_total × 100
Этап2%       ≈ среднее(Store/View%, Нарезка%)
```

При обновлении:
1. Проставь статусы в §3.
2. Пересмотри Done% в §1 по поверхностям (grep `DB.` в `*.view.js`, размеры топ-файлов).
3. Смени дату и версию в шапке.
4. Числа и SHA **не** копировать в `NEXT_SESSION.md`.

---

## 7. Мина в гейте: `coach-weekly-fallback` зависит от окружения (найдено 09-12)

`test/coach-weekly-fallback.test.js` (пришёл с PR #297) построен на допущении, записанном в
нём же: «В тестовой среде ключа провайдера нет, значит путь всегда запасной». Допущение
верно для CI и неверно для машины с `.env`:

- **на машине Gio три кейса падают** — `degraded` приходит `false`, потому что маршрут реально
  зовёт Gemini и получает живой ответ («Zero training volume or cardiovascular stimulus…»
  вместо ожидаемого «Zero sessions this week»);
- **в CI они зелёные** — ключей там нет, срабатывает fallback;
- каждый локальный `npm test` отправляет **три настоящих запроса в Gemini** и платит за них
  временем (6 с, 5 с, 14.5 с в замере) и квотой.

Итог: локальный `npm test` теперь всегда красный, и следующий агент будет искать причину в
своём диффе. Закрывать — мокая провайдера или форся режим fallback переменной на время теста,
а не правкой ожиданий. Заводить карточкой, в этом файле только протокол находки.

## Связанные файлы

| Файл | Роль |
|---|---|
| `.claude/rules/architecture.md` | Канон Store/View |
| `docs/ROADMAP_elite_athlete-pro.md` | Этапы 1–8 (aspirational) |
| `docs/THREAT_MODEL.md` | Следующая фаза аудита — безопасность |
| `docs/handoff/HANDOFF_launch_track.md` | LAUNCH / поле / BOOT-TRIM / AI-1 |
| `docs/handoff/HANDOFF_cursor_arch_cards.md` | Открытые карточки Cursor с метками приоритета |
| `docs/LAUNCH_CHECKLIST.md` | Gio gate |
| `docs/DELEGATION-PLAN.md` | Другая очередь (UI/токены/фазы 0–5) — не путать |
| `npm run scorecard` | Другой scorecard — агенты/PR, не архитектура |
