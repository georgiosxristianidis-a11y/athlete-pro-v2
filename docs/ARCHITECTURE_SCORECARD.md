# Architecture Scorecard — Athlete Pro

> Проф-метрики фазы «Архитектура». Не роутер задач (тот — `NEXT_SESSION.md`).
> Обновлено: **2026-09-12** · база замера: `1.27.99` (`7c89255`) · дерево: `origin/main`
> Источник аудита: сессия 2026-08-31 (Store/View × backend × data × sync).
> Файл впервые создан 2026-09-08, ушёл в stash `wip-before-pr314-merge` и **не влился** —
> восстановлен и пересчитан по коду 2026-09-12.
>
> **Пересверка на `1.27.99`** (после влития #314 полевой аналитики, #328 boot-trim,
> #297 weekly-fallback и пачек HYG-6 A/B/C). Три правки по факту кода, все вниз по тексту
> помечены «09-12»: хвост A14 закрыт, арифметика §1 не сходилась, A11 опаснее, чем стояло.

## Сводка

| Метрика | Значение | Как читать |
|---|---|---|
| **Архитектура в целом** | **66%** | Зрелость слоёв (ниже). Не «сколько фич». |
| **Долг аудита закрыт** | **12%** | 1 `done` + 2 `partial` из 17 (A4 + A14/A15). |
| **Этап 2 роадмапа** (`ROADMAP` §2) | **~55%** | Store/View + нарезка монолитов. |
| **Этап 3 роадмапа** (`ROADMAP` §3) | **~70%** | Thin `server.js` есть; промпты/auth — нет. |
| **LAUNCH-код** | **~97%** | Код трека влит; осталось поле Gio. |
| **BOOT-TRIM** | **закрыт** | PR #321 + #328 · `test/boot-graph.test.js` |

> **Поправка арифметики (09-12).** Стояло «60%» при том, что сумма вкладов в §1 давала 65.0 —
> итог не пересчитывали после правок весов, и скоркард занижал себя на пять пунктов. Сейчас
> 66.0: +1 за `privacy.view` с бута (98→100% по boot graph, 85→95% по Privacy), −0.5 за
> честную оценку sync (65→60%, см. A11). Итог обязан равняться сумме столбца «Вклад» —
> если не равен, верить столбцу, а не шапке.

Пересчёт: при закрытии пункта меняй статус в таблицах → пересчитай две верхние строки.
Формулы внизу файла.

---

## 1. Зрелость слоёв (→ 60%)

Веса фиксированы. «Done%» — экспертная оценка по коду на дату замера.

| Слой | Вес | Done% | Вклад | Доказательство |
|---|---:|---:|---:|---|
| Store/View по поверхностям | 30% | 55% | 16.5 | Journal эталон; Dashboard/Intel/Onboarding гибриды; A4 закрыт |
| Нарезка монолитов | 15% | 55% | 8.25 | `workout.view/*` да; `dashboard.js` монолит нет |
| Навигация / shell | 10% | 85% | 8.5 | 4 вкладки + overlay registry; `s-body` без `nav:back` |
| IndexedDB / data | 15% | 90% | 13.5 | `js/db/*` v4, facade, миграции, soft-delete workouts |
| Backend wiring | 10% | 75% | 7.5 | Thin `server.js`; жир в `routes/coach.js` |
| Sync / privacy enforcement | 10% | 60% | 6.0 | `safeFetch` + LWW; airgap только в `pull()`; очередь `push`→`process()` бьёт в Supabase SDK напрямую, мимо `safeFetch` |
| PWA / SW / boot graph | 5% | 100% | 5.0 | `build:sw`, two-phase; с бута сняты Athlete Room / Integrity / panda (#321) и `privacy.view` / `rest-timer` / `pip` (#328) |
| Контракты / Integrity | 5% | 15% | 0.75 | `integrity.js` жив, **импорта и вызова нет** (снят с бута) |
| **Итого** | 100% | | **66.0** | сумма столбца «Вклад» |

### Store/View по экранам (среднее → 55%)

| Поверхность | % | Статус |
|---|---:|---|
| Journal | 100 | Закон: store без DOM, view без `DB` |
| Privacy | 95 | Store владеет режимом; view — export/wipe; **с бута снят (#328)** — `app.js` держит только `privacy.store` |
| Workout | 70 | Store + `workout.view/*`; A4 закрыт; `completeSession` всё ещё в handlers |
| Body stats | 60 | `.core` чистый; часть метрик в view / localStorage |
| Analytics | 55 | Store ок; view пишет/удаляет workouts |
| Claude FAB | 55 | Толстый store; view читает Settings |
| Profile | 40 | Три слоя (`profile.js` / `.store` / `.view`), экран-гибрид |
| Onboarding | 35 | F-7/F-8 закрыты; всё ещё один гибрид-файл |
| Intel | 25 | Store тонкий; view толстый (SSE/DB/сеть) |
| Dashboard / Home | 15 | Нет `dashboard.store`; монолит |

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

---

## 3. Долг аудита — backlog (→ 12% закрыто)

Статусы: `open` · `partial` · `done`. Считать «закрытым» только `done`.

| # | Пункт | Статус | Где смотреть (2026-09-12) | Next |
|---|---|---|---|---|
| A1 | `completeSession` → `workout.store` | **open** | `handlers.js:446` → `_persistFinalSession` → `DB.Workouts.save` | Persist финала в store; handlers только UI |
| A2 | Вызвать `Integrity.check` после lazy load | **open** | `js/shared/integrity.js` жив; **нет импорта в `app.js`** | Вернуть точечный import + вызов после lazy Workout/Profile/Analytics/Claude |
| A3 | Единый Haptic Gate | **open** | `navigator.vibrate` в handlers/modals/render/profile/privacy/drum/… | Заменить на `haptic()` из `utils.js` |
| A4 | Утечка `setInterval` + `console.log` в `Workout.load` | **done** | `workout.view.js` — `_startStaleCleanup` / `_stopStaleCleanup` | — |
| A5 | `BLOCK_NAMES_EN` вне `chamber-pill.js` | **open** | `workout.store.js:7` | Константы в нейтральный модуль |
| A6 | `nav:back` на `s-body` | **open** | `body-stats.js` — нет `nav:back` | Кнопка назад по закону навигации |
| A7 | Intel закрывается через history, не hard `s-home` | **open** | `intel.view.js:17` — `intel:close` → `Nav.go('s-home')` | `Nav.back` / `nav:back` |
| A8 | Тонкий `dashboard.store` (read-модель) | **open** | нет `js/dashboard.store.js` | Сначала данные дома, потом нарезка HTML |
| A9 | Intel: сеть/DB из view → store/engine | **open** | `intel.view.js` | Вынести fetch/SSE/planned |
| A10 | Промпты коуча в `lib/prompts/` | **open** | `routes/coach.js` `_buildSystemPrompt` | Не менять SSE; только вынести строки |
| A11 | Airgap-гейт в `SyncManager.process()` / `push` | **open** | `sync.js:52` — `push()` кладёт в очередь и дёргает `process()` без проверки режима; airgap стоит только в `pull()` (`:258`). **Хуже, чем выглядело (09-12):** `process()` шлёт через `supabase.from(table).upsert` напрямую, `safeFetch` его не прикрывает — в airgap данные всё равно уедут при живой сессии Supabase. Плюс комментарий на `:258` ссылается на «push privacy gate», которого нет | Как у `pull`; severity — приватность, не гигиена |
| A12 | Снять Firebase-призрак (CSP + endpoint) | **open** | `routes/integrations.js` `/firebase-config`; smoke ждёт endpoint | Отдельный PR + smoke |
| A13 | Профиль: один владелец экрана | **open** | `profile.js` + store + view | Не одним PR с A8 |
| A14 | Athlete Room / Island не на critical path | **partial** | Комната lazy (#321); `privacy.view` с бута снят (#328, `app.js` импортирует только `privacy.store`). Island **всё ещё eager**: static import `app.js:14` + `modulepreload` в `index.html:111` | Остался один Island. Отдельная карточка — снимать вместе с `dynamic-island.css` |
| A15 | Views не пишут в IDB напрямую (кроме store) | **partial** | analytics/profile/intel/handlers | Правило для нового кода + миграция hot path |
| A16 | Мёртвый `lib/tokenUsage.js` | **open** | нет импортеров | Удалить или подключить |
| A17 | `longTermStats` в схеме без использования | **open** | `coach.js` принимает и передаёт в `_buildSystemPrompt`, в шаблон **не попадает** | Убрать поле или прокинуть в prompt |

**Чистый `done`: 1/17 (A4).**  
**Partial: A14, A15.**  
**12%** = `(1 + 0.5×2) / 17`.

Продуктовые закрытия (F-7/F-8, motion, analytics field, BOOT-TRIM) в A1–A17 не входят, кроме пересечения A14.

---

## 4. Next задачи (порядок — хирургический)

Не переставлять без причины: каждый пункт ≤1 PR, база `origin/main`.

Скоростной трек (после BOOT-TRIM + A4):

1. **A2** — живой `Integrity.check` после lazy load *(S)* — файл есть, вызова нет
2. **A1** — `completeSession` в store *(M, главный флоу)*
3. **A3** — haptic gate, файл за файлом *(S–M)*
4. **A6 + A7** — `nav:back` body + Intel *(S)*
5. **хвост A14** — `privacy.view` с бута *(S; не вместе с Island)*
6. **A11** — airgap в `push`/`process()` *(S, privacy)*
7. **A5** — константы блоков без DOM-модуля *(S)*
8. **A8** — `dashboard.store` read-модель *(M)*
9. **A10 / A12 / A16 / A17** — backend hygiene *(S)*
10. **A9 / A13** — после Home store *(L)*

Параллельно продукту (не архитектура): поле Gio → `LAUNCH-10` (`docs/LAUNCH_CHECKLIST.md`).

React / бандлер / TypeScript-миграция — **не брать**.

---

## 5. Чего не хватает архитектуре (кратко)

| Пробел | Почему важно |
|---|---|
| Симметрия Store/View | Сторы чистые; данные пишут views → новый код копирует гибрид |
| Доменный API сессии | Complete/cancel размазаны; тесты бьют UI |
| Контракт-first | Integrity снят с бута и не вызывается — канон в `architecture.md` врёт |
| Privacy enforcement = политика | `pull` знает airgap; очередь `push`/`process` — слабее |
| Промпты ≠ транспорт | Этап 6 роадмапа упирается в `routes/coach.js` |

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
| `docs/handoff/HANDOFF_launch_track.md` | LAUNCH / поле / BOOT-TRIM |
| `docs/LAUNCH_CHECKLIST.md` | Gio gate |
| `docs/DELEGATION-PLAN.md` | Другая очередь (UI/токены/фазы 0–5) — не путать |
| `npm run scorecard` | Другой scorecard — агенты/PR, не архитектура |
