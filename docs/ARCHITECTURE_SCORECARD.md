# Architecture Scorecard — Athlete Pro

> Проф-метрики фазы «Архитектура». Не роутер задач (тот — `NEXT_SESSION.md`).
> Карточки Cursor с метками — `docs/handoff/HANDOFF_cursor_arch_cards.md`.
> Обновлено: **2026-09-14** · база замера: `1.27.111` · дерево: `main`
> Источник аудита: сессия 2026-08-31 (Store/View × backend × data × sync).
>
> **Пересчёт под закрытую A11 (09-13).** PR #345: `_netBlocked()` на process/pull/keep-alive/signIn.
> **Пересчёт под A1/A8/A3/A6/A7 (09-14).** §3 не подтягивался за фазой 2 перф-трека (A3/A6/A7
> закрыты 13.09, статус тут остался «open») — поймано при закрытии A1; A8 (read-модель
> `dashboard.store`) добавлен тем же днём. Архитектура **69.1%**, долг **48%**. Карточки для
> сортировки — handoff Cursor.

## Сводка

| Метрика | Значение | Как читать |
|---|---|---|
| **Архитектура в целом** | **69.1%** | Зрелость слоёв (ниже). Не «сколько фич». |
| **Долг аудита закрыт** | **48%** | 7 `done` + 2 `partial` из 17 (A1/A3/A4/A6/A7/A8/A11 + A14/A15). |
| **Этап 2 роадмапа** (`ROADMAP` §2) | **~56%** | Store/View + нарезка монолитов. |
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

## 1. Зрелость слоёв (→ 69.1%)

Веса фиксированы. «Done%» — экспертная оценка по коду на дату замера.

| Слой | Вес | Done% | Вклад | Доказательство |
|---|---:|---:|---:|---|
| Store/View по поверхностям | 30% | 57.0% | 17.1 | Journal эталон; Intel/Onboarding гибриды; A1/A4 закрыты, A8 частично (read-модель) |
| Нарезка монолитов | 15% | 55% | 8.25 | `workout.view/*` да; `dashboard.js` монолит нет |
| Навигация / shell | 10% | 85% | 8.5 | 4 вкладки + overlay registry; A6/A7/NAV-1 закрыты — `s-body` снесён (не просто чинён, follow-up 1.27.108) |
| IndexedDB / data | 15% | 90% | 13.5 | `js/db/*` v4, facade, миграции, soft-delete workouts |
| Backend wiring | 10% | 75% | 7.5 | Thin `server.js`; жир в `routes/coach.js` |
| Sync / privacy enforcement | 10% | 85% | 8.5 | `safeFetch` + LWW; airgap закрыт на всех четырёх выходах — `process()`, `pull()`, keep-alive, `signIn()` (#345, `_netBlocked()`), поведенческий гард `test/sync-privacy-gate.test.js`. Не 100%: барьер не общий, см. §5 |
| PWA / SW / boot graph | 5% | 100% | 5.0 | `build:sw`, two-phase; с бута сняты Athlete Room / Integrity / panda (#321) и `privacy.view` / `rest-timer` / `pip` (#328) |
| Контракты / Integrity | 5% | 15% | 0.75 | `integrity.js` жив, **импорта и вызова нет** (снят с бута) |
| **Итого** | 100% | | **69.10 ≈ 69.1** | сумма столбца «Вклад» |

### Store/View по экранам (среднее → 57.0%)

| Поверхность | % | Статус |
|---|---:|---|
| Journal | 100 | Закон: store без DOM, view без `DB` |
| Privacy | 95 | Store владеет режимом; view — export/wipe; **с бута снят (#328)** — `app.js` держит только `privacy.store` |
| Workout | 85 | Store + `workout.view/*`; A1/A4 закрыты — `completeSession` персистит через `workout.store.js`, handlers только UI/тосты; A5 (`BLOCK_NAMES_EN` DOM-adjacent импорт) ещё открыт |
| Body stats | 60 | `.core` чистый; часть метрик в view / localStorage |
| Analytics | 55 | Store ок; view пишет/удаляет workouts |
| Claude FAB | 55 | Толстый store; view читает Settings |
| Profile | 40 | Три слоя (`profile.js` / `.store` / `.view`), экран-гибрид |
| Onboarding | 35 | F-7/F-8 закрыты; всё ещё один гибрид-файл |
| Intel | 25 | Store тонкий; view толстый (SSE/DB/сеть) |
| Dashboard / Home | 20 | `dashboard.store.js` — тоннаж/streak/next-type (zero DOM, A8); рендер/HTML ещё в `dashboard.js` |

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

## 3. Долг аудита — backlog (→ 48% закрыто)

Статусы: `open` · `partial` · `done`. Считать «закрытым» только `done`.
Карточки с пояснениями — `docs/handoff/HANDOFF_cursor_arch_cards.md`.

| # | Пункт | Статус | Где смотреть (2026-09-13) | Next |
|---|---|---|---|---|
| A1 | `completeSession` → `workout.store` | **done** (09-14) | `workout.store.js` — `persistFinalSession()`; `handlers.js` больше не импортирует `DB.Workouts`/`DB.Events`/`DB.OneRM` для complete; юнит `test/persist-final-session.test.js` без DOM (fake-indexeddb). PR — см. хендофф Cursor · 1.27.109 | — |
| A2 | Вызвать `Integrity.check` после lazy load | **open** | `js/shared/integrity.js` жив; **нет импорта в `app.js`** | Вернуть точечный import + вызов после lazy Workout/Profile/Analytics/Claude |
| A3 | Единый Haptic Gate | **done** (13.09) | Прямой `navigator.vibrate` вычищен по всему `js/`; `haptic()` из `utils.js` единственный вход; гард `test/haptic-gate.test.js`. 1.27.106 | — |
| A4 | Утечка `setInterval` + `console.log` в `Workout.load` | **done** | `workout.view.js` — `_startStaleCleanup` / `_stopStaleCleanup` | — |
| A5 | `BLOCK_NAMES_EN` вне `chamber-pill.js` | **open** | `workout.store.js:7` | Константы в нейтральный модуль |
| A6 | `nav:back` на `s-body` | **done** (13.09) | Кнопка назад заведена, затем follow-up (14.09) вовсе снёс мёртвый `s-body` — контент уже был во вкладке «Замеры» Athlete Room. Гард `test/nav-law.test.js`. 1.27.107→1.27.108 | — |
| A7 | Intel закрывается через history, не hard `s-home` | **done** (13.09) | `intel.view.js` — `intel:close` теперь через `history.back()`, не hard `Nav.go('s-home')`. Гард `test/nav-law.test.js`. 1.27.107 | — |
| A8 | Тонкий `dashboard.store` (read-модель) | **done** (09-14) | `js/dashboard.store.js` — `getVolumeSummary`/`getNextType`/`computeStreak` (zero DOM); `dashboard.js` зовёт store вместо инлайна, HTML не резал; `test/dashboard-store.test.js`. PR #367 · 1.27.110 | Нарезка HTML — отдельная карточка |
| A9 | Intel: сеть/DB из view → store/engine | **open** | `intel.view.js` | Вынести fetch/SSE/planned |
| A10 | Промпты коуча в `lib/prompts/` | **open** | `routes/coach.js` `_buildSystemPrompt` | Не менять SSE; только вынести строки |
| A11 | Airgap-гейт в `SyncManager.process()` / `push` | **done** (09-13) | `_netBlocked()` в `js/sync.js` закрывает `process()`, `pull()`, keep-alive и `signIn()`; гард `test/sync-privacy-gate.test.js` шпионит по объекту `supabase`, а не по исходнику. PR #345 · `7b8304e` · 1.27.101 | — |
| A12 | Снять Firebase-призрак (CSP + endpoint) | **open** | `routes/integrations.js` `/firebase-config`; smoke ждёт endpoint | Отдельный PR + smoke |
| A13 | Профиль: один владелец экрана | **open** | `profile.js` + store + view | Разблокирована (A8 закрыт) — по фазе 3, после A15/A2/A5/A9 |
| A14 | Athlete Room / Island не на critical path | **partial** | Комната lazy (#321); `privacy.view` с бута снят (#328, `app.js` импортирует только `privacy.store`). Island **всё ещё eager**: static import `app.js:14` + `modulepreload` в `index.html:111` | Остался один Island. Отдельная карточка — снимать вместе с `dynamic-island.css` |
| A15 | Views не пишут в IDB напрямую (кроме store) | **partial** (14.09) | правило в `architecture.md` + `test/import-guard.test.js`; мигрирован `analytics.view.js::removeCalendarEntry` — остальные поверхности (profile/intel/claude/privacy/workout) ещё прямые | Миграция по A9/A13, не одним PR с A8 |
| A16 | Мёртвый `lib/tokenUsage.js` | **open** | нет импортеров | Удалить или подключить |
| A17 | `longTermStats` в схеме без использования | **open** | `coach.js` принимает и передаёт в `_buildSystemPrompt`, в шаблон **не попадает** | Убрать поле или прокинуть в prompt |

**Чистый `done`: 7/17 (A1, A3, A4, A6, A7, A8, A11).**  
**Partial: A14, A15.**  
**48%** = `(7 + 0.5×2) / 17` = 47.1, округление вверх.

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
| **3** | архитектура под рост | `A1`+`A8` закрыты, `A15` правило заведено → `A2` → `A5` → `A9`/`A13` |
| **4** | гигиена и поверхность | `A14-хвост` · `A12` · `A16+A17` · `A10` |
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
| Симметрия Store/View | Сторы чистые; данные пишут views → новый код копирует гибрид |
| Доменный API сессии | Complete/cancel размазаны; тесты бьют UI |
| Контракт-first | Integrity снят с бута и не вызывается — канон в `architecture.md` врёт |
| Privacy enforcement = политика, а не барьер | A11 закрыта, но способом «проверка в каждой функции»: `safeFetch()` прикрывает общий `fetch`, а Supabase SDK ходит своим — под него подложить обёртку нельзя, поэтому `_netBlocked()` стоит вручную на четырёх точках. Пятая появится молча: новая функция с сетью в `sync.js` попадёт наружу в airgap, и гард #345 её не увидит — он перечисляет вызовы поимённо. Настоящее закрытие — один барьер на выходе модуля |
| Промпты ≠ транспорт | Этап 6 роадмапа упирается в `routes/coach.js` |
| Нет слоя чтения над IDB | `DB.Workouts.getAll()` зовётся из 27 живых мест и каждый раз выгружает всю таблицу заново (`js/db/workouts.js:63`). `PERF-HIST` (1.27.102) убрал N-кратное чтение на конкретно этих двух путях — Train теперь читает историю раз на экран, а не на упражнение, бут зовёт `getLast(1)` вместо полного скана; многократность за пределами этих двух путей никуда не делась — кэша как не было, так и нет. Симметрично A15: там views пишут в IDB, здесь — читают без кэша |
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
