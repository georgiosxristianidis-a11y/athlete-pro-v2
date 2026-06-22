# NEXT SESSION — Athlete Pro · Канонический хэндофф

> Обновлено: 2026-06-20 (сессия 2, Opus 4.7, LEAD). **byoi == main == `a0c8673`**. Тег-чекпоинт **`checkpoint-2026-06-20-s2`**. Worktree `claude/compassionate-black-30cbfd` fast-forward'нут с `claude/brave-brown-d5209a` до `594f72d` + 3 коммита этой сессии + merge `claude/agitated-satoshi-6f04f0` (Sonnet 5-1/5-4/5-5). Предыдущий: `checkpoint-2026-06-20`.
> Это **единый источник правды**: план, делегирование, философия Air, дизайн-система, done-list, остаток.
> Табличный дубль — `docs/DELEGATION-PLAN.md`.

---

## ⏭️ СЕССИЯ 2026-06-22 (Opus 4.8, LEAD) — load-fix + чистка + Cool Steel живьём

Ветка `claude/hungry-johnson-0c2950` (была впереди handoff'а: W-1/W-2-A/B/C/D, BUG-1/2/3, компоненты Phase 1B уже закоммичены). Триггер: пользователь не мог загрузить app после очистки Application (408-шторм), видел чужие символы ▣▥◆○ в аналитике и «не видел разницы после рефактора».

### Диагноз (3 связанные причины)
1. **408-шторм** — SW сам фабриковал `408` в `.catch` (старый sw.js:198) → `import()` падал намертво. + `install` делал ~90 параллельных `cache.add` (thundering herd) → dev-сервер захлёбывался, аборт модулей.
2. **«Нет разницы после рефактора»** — SW был **cache-first** на JS/CSS → отдавал старый код, изменения не доезжали до экрана до ручной очистки (после которой ловился п.1).
3. **Символы ▣▥◆○ в аналитике** — временный `_renderDesignPreview()` стенд Phase 1.4, забытый смонтированным на живой Analytics.

### ✅ Сделано (3 коммита)
- **Phase 0 (`39404de`)** — `sw.js`: JS/CSS/HTML → **network-first** (фреш-код сразу), статика → cache-first; убран синтетический 408 → `Response.error()`; **прекэш с лимитом конкурентности 6**; `app.js` — авто-reload один раз на `controllerchange`. `v68→v69`.
- **Phase 1 (`39404de`)** — удалён design-preview стенд из `analytics.view.js` (блок, вызов, функция, неиспользуемые импорты `renderChamberPill/renderIslandTracker`).
- **Phase 2 (`5f76ac1`)** — `dynamic-island.js`: **DHL 4-камерный трекер живьём** в расширенном острове (камеры = упорядоченные уникальные `ex.block`; current = блок активного упр.; per-chamber прогресс + `BLOCK_LABEL`; тап маркера → скролл к блоку). `dynamic-island.css`: **Cool Steel chrome** на декор-контролах (+30s `--c-chrome`, rest Skip CTA `--c-chrome-h/-t`, sets-badge chrome-rim). `--c-accent` оставлен ТОЛЬКО на set-pulse/online-dot/данных. `v69→v70`.

Все три верифицированы в preview (seeded push-сессия: трекер 4 маркера, current-pulse + `SHAPE 1/6`, chrome-токены резолвятся, 0 ошибок консоли). **Тесты 189/189.**

### 🔜 Остаток
- ✅ **5-6** — уже было (инлайн glow на текущем шаге `onboarding.js:72`); аудит дал ложный минус (искал класс `ob-progress`).
- ✅ **1-5** (`b9e2c18`) — FAB rgba токенизирован через `color-mix`; новый токен `--c-gemini` в base.css.
- 🟩 **GEMINI** (остаток механики): 1-6 (`#000`→токены), 2-6 (`toFixed`→`format.js`, 15+ мест), BUG-6 (rgba в `workout.css`/`athlete-room.css`). LEAD сделает код-ревью после.
- 🟦 **SONNET**: 2-7 (тесты форматтера), 3-3 (метафоры иконок), 4-2 (Edit Plan→фабрики), 4-3 (CORE-унификация).

### 🔴 За пользователем
Верифицировать P0/P1/P2 на телефоне (`:3000`, ветка hungry-johnson): модули 200, символы ушли, остров с трекером. Затем — полевой CRDT 2-девайс + влить ветку в byoi/main.

---

## ⏭️ СЕССИЯ 2026-06-20 (вторая) — Design Lock + scrub + gauge

### 🎯 ПЕРВОЕ ДЕЛО ДАЛЬШЕ: Phase 1 — Cool Steel B foundation

Перед любой UI-работой — добавить `--c-chrome*` токены, написать `chamber-pill.js` (4-знаковая) + `island-tracker.js` (DHL), проверить B в browser на одном экране. После ✓ — Gemini массовый sweep `var(--c-accent)`. Стэк задач: см. таблицу phases ниже.

### ✅ Locked в этой сессии (durable design-DNA)

**См. memory:** `design-2026-06-20-chambers-and-cool-steel.md` (полные обоснования).

1. **4 камеры, не 3 и не "Блок I/II/III/IV".** Имена контекстные по дню из PPL | GIO blueprint: Push = Chest Power / Chest Shape / Biceps / Core; Pull = Back Width / Back Thickness / Triceps & Traps / Core; Legs = Legs Heavy / Legs Isolation / Shoulders / Alignment. **Камера 4 — UI-only**, `_executeFinalSave` обязан фильтровать `!e.coreOnly` перед `IDB.put()`.
2. **Геометрические сигнатуры (не цвет).** `▣` Heavy / `▥` Shape / `◆` Accent / `○` Core. PPL = цвет сессии (контейнер), форма = роль камеры. Forms = constant grammar, color = current voice.
3. **DHL-трекер в Dynamic Island.** 4 маркера + 3 линии. Past=filled, current=filled+pulse-ring, future=30%, Камера 4=всегда open ring. Заменяет chamber-pill в шапке in-workout (Island и есть навигация). Опция `tracker.violetAccent` — уникальный нав-акцент через `--c-secondary`.
4. **Cool Steel B палитра.** Бренд-хром перестаёт быть зелёным неоном. Новые токены: `--c-chrome` #cfd1d8 (rims/outlines), `--c-chrome-h` #e9eaed (hover/CTA fill), `--c-chrome-t` #1a1a22 (тёмный текст). `--c-accent` остаётся ТОЛЬКО для celebration (PR-badge, set-pulse, success-toast) и data-glow (sparklines, Strength Index). PPL-токены не трогать.

### ✅ Build done & committed (этой сессии)

- **Curve scrub** на Strength Progression — touch+hover вертикальный маркер + readout (вес/дата), passive listeners, `transform`-driven 60fps. (`analytics.strength-curves.js` + `analytics.css`)
- **PPL semi-donut gauge** — заменил тонкие bars на dashboard PPL Split + analytics PPL Balance. Полукольцо push/pull/legs с гэпами, тоннаж в центре, легенда внизу. `js/shared/ppl-gauge.js` (новый shared компонент, реюзается в обоих местах). SW → v65.

### 📋 ФАЗОВЫЙ ПЛАН (по криту, с делегированием)

| Фаза | Заголовок | Owner | Effort | Crit | Блокирует |
|---|---|:--:|:--:|:--:|---|
| **0** | Commit pending (curve+gauge+docs) | 🔒 LEAD | S | 🔴 | Phase 1 |
| **1** | Palette B foundation | 🔒 LEAD | M | 🔴 | весь новый UI, Phase 6 |
| **2** | Critical bugs (parallel) | 🔒/🟦/🟩 | M | 🔴/🟠 | — |
| **3** | W-1 Add Exercise Live | 🔒 LEAD | M | 🟠 | Phase 4 |
| **4** | W-2-A Block timings | 🔒 LEAD | S | 🟠 | Phase 5 |
| **5** | W-2-B `buildSessionSummary` в store | 🔒 LEAD | M | 🟠 | Phase 6, **закрывает BUG-1** |
| **6** | W-2-C UI 4-chamber отчёт | 🟦 SONNET | L | 🟡 | — |
| **7** | W-2-D Save & analytics | 🔒 LEAD | S | 🟡 | — |
| **8** | Delegated residuals (массово) | 🟦/🟩 | parallel | 🟢 | — |

**Phase 1 — детально (LEAD foundation):**
- 1.1 `--c-chrome*` tokens в `base.css` (additive, безопасно)
- 1.2 `js/shared/chamber-pill.js` (4-знаковая) — three modes: preview / mastery / completed
- 1.3 `js/shared/island-tracker.js` (DHL) — + опциональный violet-mode
- 1.4 verify B в browser на 1 экране — **gate**: B заходит → 1.5; не заходит → revert токенов
- 1.5 🟩 GEMINI — token-sweep `var(--c-accent)` триаж (после ✓ на 1.4)

**Phase 2 — критические баги (параллельно с Phase 1):**
- 2.1 🔒 LEAD — **BUG-3 CRITICAL** — Layout Thrashing `_initDrag` (forced sync layout на 60fps при drag сета): batch reads → writes через rAF, кэш `getBoundingClientRect`
- 2.2 🟦 SONNET — **BUG-2 HIGH** — `window._coreCheckedState` глобал → `State.coreChecked`
- 2.3 🟩 GEMINI — **BUG-6 LOW** — хардкод rgba в `workout.css`/`athlete-room.css` (AIR rule №2)

**Phase 8 — delegated параллельно:**
- 🟩 **GEMINI** (mechanical, дешёвая): 1-5/1-6 (FAB/Claude rim → система, тонир. фон); 2-6 (формат чисел через `format.js`); 3-2/3-4 (SVG sweep, currentColor); 5-2/5-3/5-6 (text-overflow, "X" cleanups, onboarding bar); BUG-6 sweep
- 🟦 **SONNET** (scoped logic): 2-7 (formatter tests); 3-3 (метафоры иконок); 4-2/4-3 (Edit Plan → factory, CORE-карты унификация); 5-1/5-4/5-5 (компакт set input, Volume Trend, motion tokens)
- ⏸ **DEFERRED**: BUG-5 (`getAll()` → cursor) — преждевременная оптимизация

### 🛠 Engineering constraints из PPL | GIO blueprint (mandatory при W-1/W-2)

- `isUnilateral: true` → `tonnage += weight × reps × 2`. **Unit test обязателен** (Iso-Lateral Row иначе ползёт).
- Камера 4 `db.put()` блок — `exercises.filter(e => !e.coreOnly)` перед записью.
- Event Delegation на dynamic set-cards (`closest('[data-set-id]')`) — direct listeners ломаются на `+ add set`.
- RPE-цвет через `:active` + JS-toggle (Haptic Gate), НЕ `:hover` (sticky bug на тач).
- Block timings — timestamps `{ startedAt, endedAt }`, не аккумулированные мс (рефреш-safe, CRDT-friendly).

### 🎯 Шпаргалка: модель ↔ задача

| Метка | Модель | Брать | НЕ брать | Цена* |
|:--:|---|---|---|:--:|
| 🔒 LEAD | Opus 4.7/4.8 | data correctness · schema · security · кросс-секущее · design-DNA · новая архитектура | grep+replace · тесты по готовому спеку | **5×** |
| 🟦 SONNET | Sonnet 4.6 | scoped рефактор · тесты · компонент по готовому спеку · нормализация | оригинальный креатив · новая архитектура | **1×** |
| 🟧 HAIKU | Haiku 4.5 | мелкие правки в 1 файле · переименование var · удалить флаг из 3 мест | анализ · дизайн · логика > экрана | **0.2×** |
| 🟩 GEMINI | Gemini 3.1 | массовый CSS sweep · SVG batch · find/replace на десятки файлов | логика с условиями · дизайн | **0.1×** |
| 🟪 FABLE | Fable 5 | creative UX концепты · ideation · мокапы | code-correctness · точная инженерия | ~Sonnet |

*относительно Sonnet baseline. **Антипаттерн:** LEAD на mechanical sweep = 50× переплата vs Gemini.

### 🔴 За пользователем (унаследовано)
Полевой тест CRDT 2-девайс (cloud) → влить `claude/brave-brown-d5209a` (+ эту ветку) в byoi/main. Залить импорт-JSON (128 тренировок) через Profile → Import.

---

## ⏭️ СЕССИЯ 2026-06-20 — премиум-визуал прогресса + импорт-история

### ✅ Сделано (всё на `claude/brave-brown-d5209a`, коммиты)
- **Импорт истории из Excel** (`081b4a8`, `3f5800b`): ETL `scripts/import-etl.py` → бэкап-JSON `C:\Users\Zephyrus\Downloads\qBit\athlete-pro-import.json` — **128 тренировок** (pull 54/legs 30/push 44, 2023-05→2025-09, 0 unmatched). `Backup.import` теперь штампует `withMeta` (синк-чисто). Заливать через Profile→Import — **за Gio**.
- **Strength Progression кривые** (`6fa03ff`): `js/analytics.strength-curves.js` — per-lift неон-кривые (PPL-цвета), пик/текущий маркеры, помесячная агрегация (max рабочий вес), кламп Catmull-Rom. Топ-6 упр.
- **Strength Index хиро** (`09672ce`): сверху Stats — индекс = средн. относит. рост весов (НЕ DOTS: данные машинные без большой тройки) + журней-статы (596т/128/2.4г) + спарклайн. Статичный SVG, 60fps.
- **Core/accessory UX** (`2f5cc09`): `.core-*` стили в workout.css — стеклянный чеклист (чекбокс+accent-заливка, remove, empty-state) для BLOCK IV CORE/разминки во всех PPL.
- **GPT product-review** разобран: forecasting/recovery отклонены (фейк-точность / нет данных + airgap); Strength Score/Plateau/AI — движки уже в коде (`athleteProScore`/`dotsScore`, `detectPlateau`, aiOrchestrator).

### 🔜 ПЛАН ДАЛЬШЕ (чеклист, согласовано с Gio — лёгкое, 60fps)
1. **#2 Scrub значений на кривых** — touch (мобила) + hover (десктоп): вертикальный маркер + readout (вес/дата) к ближайшей точке; двигать через `transform` (без ре-рендера), passive. Zoom/timeframe — **отложено** (помесячная агрегация уже сжимает).
2. **#3 PPL split → 3-сегментный semi-donut гейдж** — вместо тонких баров (dashboard + analytics PPL-balance): полукольцо push/pull/legs (green/cyan/purple), тоннаж в центре. Статичный SVG, 60fps. НЕ батарея (одна шкала не ложится на 3 категории).
3. Верифицировать в preview на 128 импортных, sw-бамп, коммит каждой фичи.

### 🔴 За пользователем (не меняется)
Полевой тест CRDT 2-девайс (cloud) → затем влить ветку в byoi. + залить импорт-JSON.

---

## ⏭️ СЕССИЯ 2026-06-18 — итог + ПЕРВОЕ ДЕЛО ДАЛЬШЕ

### 🔴 ПЕРВОЕ ДЕЛО ДАЛЬШЕ: полевой тест CRDT 2-девайс конвергенции (cloud-режим)
Фаза B (`pull()` мёрдж-вниз) проверена логически (юниты) и не падает офлайн, но **настоящая конвергенция двух устройств не верифицирована** — нужен живой Supabase + 2 устройства в cloud-режиме. Сценарий: на двух девайсах под одним анон-аккаунтом залогировать сеты офлайн → обоим выйти онлайн → убедиться, что сеты/тренировки сошлись (никто не затёр чужое), удаление на одном (тумбстоун) долетело до другого. Если рассинхрон — смотреть `SyncManager.pull()` в `js/sync.js` (маппинг snake_case, курсор `ap-sync-pulled-at`) и `mergeWorkoutExercises` в `js/shared/sync-merge.js`. План сессии: `~/.claude/plans/jazzy-forging-raven.md`.

### ✅ Остров-flex (`2f998c1`) — ВЕРИФИЦИРОВАН 2026-06-18
Измерено в preview на живой тренировке: все режимы центрированы (contentCenter == islCenter), ширины точны (ultra-min 140 / mini 184 / detailed 240, timer 232×44), нет overflow, имя обрезается ellipsis, во время морфа offset контента = 0 на каждом кадре — «сосиски» нет. Rest HUD ок. Изменения/revert не требуются.

### ✅ Фаза 6 CRDT-UUID — СДЕЛАНО 2026-06-18 (ветка `claude/brave-brown-d5209a`)
Открытие: фундамент уже был (`newId`/`getDeviceId`/`withMeta` + `lwwWins` + 25 тестов; новые записи давно UUID; межхранилищных FK нет). Сделано:
- **Фаза A (`js/db.js`):** `DB_VERSION` 3→4; в `onupgradeneeded` дроп+пересоздание 5 стора (workouts/bodyMetrics/events/nutritionLogs/plannedWorkouts) **без autoIncrement**, легаси-int id → UUID + бэкфилл `updatedAt`/`deviceId` (индексы сохранены, атомарный откат при ошибке). v3-бэкфилл сужен до ORM+SETTINGS (анти-рейс). `Events.log`/`Backup.import` получают id; `deleteById` делегирует в `delete` (тумбстоун); +`DB._putRaw`/`_delRaw` (без `_triggerSync`).
- **Фаза B (`js/sync.js` + новый `js/shared/sync-merge.js`):** чистые `mergeWorkoutExercises`+`pickWinner` (push рефакторнут на них); `SyncManager.pull()` — недостающий мёрдж-вниз (gated non-airgap+auth, snake_case→local, set-level мёрдж workouts, тумбстоуны→`_delRaw`, курсор `ap-sync-pulled-at`), вызывается в signIn/online/keep-alive.
- **SW** v57→**v58** (+`sync-merge.js`). **Тесты 139/139.** В браузере верифицировано: реальная миграция v3→v4 (int 1/2→UUID, данные целы), `autoIncrement:false` на всех 5, fresh save=UUID, `_putRaw` без echo, `pull()` graceful no-op офлайн.

### 📥 SMART IMPORT истории из Excel — ✅ ETL СОБРАН + ВЕРИФИЦИРОВАН (2026-06-19)
Цель: импорт ~3 лет тренировок из личных Excel-таблиц Gio. Гранулярность выбрана: **макс. точность** (каждая неделя×сессия = тренировка).
- **Открытие:** это не лог, а **программные матрицы** (мезоциклы): блоки PULL/LEGS/PUSH × (месяц→неделя→сессия) сетка весов; колонки `# | название | повторы` (порядок плавает между листами); язык **EN + итальянский** (русского/прозы в данных НЕ найдено — сканил все 1000+ строк обоих файлов). Грязь: Excel-серийники дат протекли в веса (фильтр >500 кг), инлайн-аннотации (`28(Te)`,`6*`), даты приблизительные (месяц+неделя); у листа England — реальные даты.
- **Файлы:** `C:\Users\Zephyrus\Downloads\qBit\TRAINING 2024_It_Big Boy.xlsx` (листы: Italy GYM_2023, 2025, England_GYM_2023) и `My Trainings_2025.xlsx` (Training_2025).
- **ETL:** `scripts/import-etl.py` (единый: оба периодных режима — month/week глобальный + per-block Excel-серийники для England; чистка, транспонирование, матч, дедуп). PoC `_poc_import.py`/`_poc_scan_all.py` — оставлены как черновики. **Итог: 128 тренировок** (pull 54 / legs 30 / push 44), период 2023-05→2025-09, **0 unmatched**. England — реальные даты; Italy/2025 — приблизительные (месяц+неделя); Training_2025 — пустой шаблон (пропущен); England-блоки legs/push вставлены в листе дважды → схлопнуты дедупом по id.
- **Выход:** `C:\Users\Zephyrus\Downloads\qBit\athlete-pro-import.json` (бэкап-формат) → залить через **Profile → Import (JSON)**. Верифицировано в preview: импортируется чисто (128 легли), PPL-баланс читает (34/34/32), Analytics не падает. Нюанс: верхние карточки SESSIONS/VOLUME/AVG считают текущий период → 0 для истории (не баг); история в PPL-балансе (all-time) и heatmap при переходе на 2023–2025.
- **Названия:** `exercises-library.json` (170, поля name+nameRu+category+tags) + таблица ALIAS в скрипте → ~90% (на листе 2025: точно 12 / алиас 12 / пробел 7 из 29). Цели алиасов сверены с реальными именами либы: Lying Leg Curl, Dumbbell Lateral Raise, Chest Dip, Skull Crusher (Lying Tricep Extension), Rope Pushdown, Hip Abduction Machine, Pec Deck Fly, Tricep Pushdown, Machine Chest Press. 2 настоящих пробела либы — «Glutes», общий «Triceps Extension» → в ревью как кастом.
- **Стратегия:** разовый bespoke-ETL → единый бэкап-JSON → существующий `DB.Backup.import` (НЕ generic-фича в приложении — данные слишком идиосинкразичны).
- **Остаток (за пользователем / по желанию):** (A) залить JSON на устройстве через Import; (B) ✅ ETL закоммичен; (C) опц. доработки — `DB.Backup.import` НЕ штампует CRDT-мету (`updatedAt`/`deviceId`; импорт синкается по timestamp-fallback, но лучше `withMeta` на импорте) + bodyweight-лог (секции `WEIGHT`: вес/рост/жир) затянуть в body-metrics отдельным проходом.

### ✅ Сделано в сессии 2026-06-16/17 (всё в byoi/main)
- **Фаза 0 — COMPLETE (7/7):** 0-3 `errors-ui.js`/`toUserMessage()` (ноль сырых ошибок в UI), 0-4 тосты дедуп+лимит(3), 0-7 ноль нативных диалогов (alert→Toast, `prompt()`→новый `promptDialog()` на TextField).
- **Фаза 1 (5/7):** 1-3 PPL-закон в analytics+dashboard (была инверсия pull/legs везде), 1-4 Body Metrics по группам мышц+нейтраль. Остаток 1-5,1-6 → 🟩 Gemini.
- **Фаза 2 (5/7):** 2-3 единый `js/shared/format.js` (`fmtVol/fmtWeight/fmtDuration/fmtDate`, дубль fmtVol устранён), 2-4 запрет будущих дат в Recent. Остаток 2-6 🟩, 2-7 🟦.
- **4-1** vanilla-фабрики `js/ui/factory.js` (Button/TextField/NumberStepper/Card). **1-7** лого violet.
- **Dynamic Island:** DI-P0 (rest-таймер не мёрзнет в фоне: setInterval+timestamp), DI-1/2/4/5 (PPL-цвета, один CSS-морф, битые токены, −242 строки мёртвого CSS), DI-7 (бар больше не блюрит остров во время тренировки), **60fps** бар отдыха (одна GPU-транзишн), остров показывает **3/3 текущего упражнения** (не 0/22 сессии), DI-3 BPM оставлен как декор.
- **CSS root-fix:** в `base.css` не хватало `}` → весь хвост (spark-stroke glow, .badge-accent, .toast, --c-spark-bg, анимации) был вложен в `.modal-sheet` и не работал вне модалок. Закрыл блок → **вернулся зелёный неон Volume Trend** + бейджи/тосты.
- **Инфра:** порт по умолчанию **3000 = твой** (`npm run dev:lan`, телефон `http://192.168.1.8:3000`), **3001 = Claude** (preview, `--port=3001` в launch.json). SW v57.

### 📋 Остаток (делегируемое — параллельно)
🟩 **Gemini:** 1-5,1-6 (FAB/рамка→система, тонир. фон), 2-6 (формат чисел через format.js), 3-2/3-4 (иконки), 4-4/4-5, 5-2/5-3/5-6.
🟦 **Sonnet:** 2-7 (тесты форматтера), 3-3 (метафоры иконок), 4-2 (Edit Plan→фабрики, разблокировано 4-1), 4-3, 5-1/5-4/5-5, L-3 (i18n-литералы).
🔒 **LEAD:** все плановые закрыты. ✅ верификация острова (2026-06-18). ✅ Фаза 6 CRDT-UUID (2026-06-18, ждёт интеграции byoi + полевого теста). ✅ Фаза 6 Lighthouse (2026-06-18): a11y **88→100** (aria-label на nav, контраст onboarding text-3→text-2), perf 72 / best-practices 100 / seo 100; восстановлен сломанный ESM-раннер `scripts/lighthouse.js` (`npm run lhci`). ✅ BG-1 (2026-06-18): wake-lock дефолт ON через **opt-out** (unset='on'; явный 'off' остаётся и сохраняется) — 3 точки чтения `keep-awake` (handlers.selectType, profile.toggleKeepAwake, settings-свитч). SW v59→v60, тесты 139/139, toggle on→off→on верифицирован. **Все плановые LEAD-задачи закрыты.** Остаётся только интеграция CRDT-ветки `claude/brave-brown-d5209a` в byoi — **после полевого теста** (см. красный блок). Plan: `~/.claude/plans/jazzy-forging-raven.md`.

### ⏳ За пользователем
Полевой тест на телефоне (`:3000`, очистить SW-кэш): **CRDT 2-девайс конвергенция в cloud-режиме** (см. красный блок — главное на этой ветке) + миграция IDB v3→v4 на живых данных (workouts/metrics/1RM целы после апгрейда) + остров (вкл. **keep-awake** в настройках, чтобы таймер жил).

### 8.2 Аудит Gemini («всё сделано») — РЕАЛЬНОСТЬ

Gemini утверждал, что Phase 8 residuals выполнены. Проверка по main (`46c42c9`):

| Таск | Gemini | Факт | Файл |
|---|---|---|---|
| **1-5** FAB-рамки в claude.css | done | ❌ НЕ СДЕЛАНО | `css/claude.css:14,20,47,51,95` — hardcoded rgba |
| **1-6** Тонир.фон вместо #000 | done | ❌ НЕ СДЕЛАНО | hardcoded rgba в claude.css |
| **2-6** Числа через format.js | done | ❌ НЕ СДЕЛАНО | `toFixed()` напрямую в 15+ местах в `js/` |
| **BUG-6** rgba sweep workout/room | done | ❌ НЕ СДЕЛАНО | `css/workout.css`, `css/athlete-room.css` — hardcoded rgba |
| **BUG-2** window._coreCheckedState | done | ❌ НЕ СДЕЛАНО | `js/workout.view/handlers.js:449-455` — `window._coreCheckedState`; `render.js:81` экспортирует module-level, но хэндлеры читают window |
| **5-2** text-overflow имён упражнений | done | ✅ УЖЕ БЫЛО | `css/workout.css` — `.exercise-name` уже имеет `text-overflow:ellipsis` |
| **5-3** «X» clean hero/имя | done | — | поиск не дал результатов; вероятно ОК или не критично |
| **5-6** Прогресс-бар онбординга | done | ❌ НЕ СДЕЛАНО | нет класса `ob-progress`/`ob-step-dot` в `js/onboarding.js` |
| **3-2/3-4** SVG stroke/currentColor | done | — | иконки SVG не содержат hardcoded hex; вероятно ОК |

**Итого:** из 9 «сделанных» Gemini задач — 2 подтверждены (5-2 уже было), 2 под вопросом, **5 реально не сделаны.**

### 8.3 Следующий LEAD-фокус (после merge)

По плану 2026-06-20 (checkpoint `compassionate-black`):

```
Phase 0 — Commit pending      → 8.1 выше (merge brave-brown)
Phase 1 — Palette B           → 🔒 LEAD  (chrome tokens, chamber-pill.js, island-tracker.js)
Phase 2 — Critical bugs       → 🔒 LEAD  BUG-3 layout thrashing + BUG-2 (window._coreState)
Phase 3 — W-1 Add Exercise    → 🔒 LEAD
Phase 4 — W-2-A Block timings → 🔒 LEAD
Phase 5 — W-2-B buildSummary  → 🔒 LEAD
Phase 6 — W-2-C 4-chamber     → ✅ DONE (46c42c9)
Phase 7 — W-2-D Save&Analytics→ 🔒 LEAD
Phase 8 — Delegated residuals → перечислены выше (Sonnet/Gemini)
```

**Рекомендуемый порядок:** merge (8.1) → Phase 1 Palette B → Phase 2 BUG-3/BUG-2 → Phase 3 W-1.

---

## 0. Как читать этот файл (мульти-агентный протокол)

Проект ведут параллельно: **Claude Opus (LEAD)**, **Antigravity·Sonnet 4.6**, **Antigravity·Gemini 3.1**.

**Перед любой задачей:**
1. Найди задачу ниже → проверь колонку «Кто».
2. Если `🔒 LEAD` — **не брать** (ведёт Opus, цена ошибки высока). Блокирует — оставь комментарий, файлы не трогай.
3. Поставь маркер `🚧 <agent>@<branch>` в строке, начни работу.
4. По завершении — `✅ <commit-hash>`.
5. **Незакоммиченный чужой WIP не откатывать** (GIO Context Integrity).
6. Один агент = один worktree/ветка. Файл с `🚧` другого агента не редактировать.

### Легенда: модель ↔ тип задачи (рациональный расход токенов)

| Метка | Кто | Тип задач | Почему |
|:--:|---|---|---|
| 🔒 **LEAD** | Claude Opus | Безопасность, корректность данных, архитектура, необратимое, кросс-секущее, дизайн-ДНК | Дорого — только туда, где цена ошибки высока |
| 🟦 **SONNET** | Antigravity·Sonnet 4.6 | Скоупленные рефакторы, компоненты, тесты, нормализация ошибок, применение готовых решений | Баланс цена/качество |
| 🟩 **GEMINI** | Antigravity·Gemini 3.1 | Массовое/механическое: CSS-свипы токенов, SVG, find/replace | Дёшево на объёме |

**Сложность:** S (≤30 мин механика) · M (скоуп+логика) · L (мультифайл) · XL (архитектура/риск).

---

## 1. ФИЛОСОФИЯ «AIR» — жёсткие правила (соблюдают ВСЕ агенты)

Инварианты, не пожелания. Нарушение = регрессия.

1. **Воздух вместо линий.** Никаких `<hr>` и нижних бордеров-разделителей. Разделение — только `padding`/`margin` и сдвиг цвета поверхности.
2. **Стеклянные hairlines — только через токены:** `var(--c-border)` (6%) / `var(--c-border-h)` (12%). НЕ хардкодить `rgba`. Непрозрачные сплошные 1px-рамки запрещены. Цветные подсветки (rgba ≤20%) — точечно.
3. **Щедрые отступы карточек/модалок:** 24/32px (`--sp-3`/`--sp-4`). Тесные 8-12px — только во вложенных рядах.
4. **Safe-area всегда:** `--safe-top`/`--safe-bottom` для хедера и нижней навигации.
5. **Mobile-first**, брейк 600px. Десктоп — колонка 412px (`@media (min-width:481px) and (hover:hover)`). Элементы НЕ должны вылезать за неё — НИКАКИХ `position:fixed` к окну (урок 5-7).
6. **Без эмодзи в UI и коде** — только SVG. (В чате/отчётах можно.) Типографика `→ ✓ ·` — НЕ эмодзи, не вычищать.

---

## 2. ДИЗАЙН-СИСТЕМА (актуальная)

### 2.1 Палитра — двухуровневая (решение 1-2, ACK: Green+Purple)
Цвета только через токены `css/base.css :root`.

**BRAND — единственные ДЕКОРАТИВНЫЕ акценты** (CTA/active/focus/бренд):
- `--c-accent` `#00e676` Neon Emerald — **primary**
- `--c-secondary` `#8b5cf6` Electric Violet (цвет лого) — **secondary**

**SEMANTIC — только по смыслу, НИКОГДА для декора:**
- PPL: `--c-push`(green) / `--c-pull`(cyan #00b8d4) / `--c-legs`(purple #8b5cf6). В коде типа тренировки — алиасы, не сырые hue.
- Статус: `--c-amber` #ffb300 (warning/PR) · `--c-red` #ff4d88 (error/danger/HR).
- Achievement: `--c-gold` #D4AF37 (PR/стрики).

**Закон PPL:** Push = green · Pull = cyan · Legs(+Shoulders) = purple.

### 2.2 Фон (OBSIDIAN)
`--c-bg #050507` · `-1 #08080c` · `-2 #0c0c12` · `-3 #12121a`. Чистый `#000` (`--c-black`) — только Dynamic Island.

### 2.3 Типографика
Веса **500** (текст) / **600** (акценты) / **800** (заголовки). НЕ 700/900. `letter-spacing:-0.02em` на заголовках. `--font-main` Manrope, `--font-heading` Instrument Sans.

### 2.4 Иконки
Stroke 1.5–2px, сетка 24×24, скруглённые углы, `fill=none` у неактивных, `currentColor`.

### 2.5 Моушн
- Кнопки: `transform:scale(0.96)` на `:active`. Экраны: fade-in. Токены `--t-fast/normal/slow`. Spring — `js/shared/spring.js`.
- Хаптик — ТОЛЬКО через gate `haptic()` (`js/shared/utils.js`), не сырой `navigator.vibrate`.
- **Ease-токены (5-5, `fe4deb7`):** `--ease-std`, `--ease-spring`, `--ease-island`, `--ease-pop`, `--ease-exit`, `--ease-decel`, `--ease-out`, `--ease-position` в `css/base.css :root`. 28 raw `cubic-bezier` заменены.
- `island-set-pulse` (зелёная вспышка завершения сета) — **НЕ ТРОГАТЬ** (жёсткий запрет пользователя).

### 2.6 i18n
Язык UI — ТОЛЬКО `getLang()`/`isRu()` из `js/locale.store.js` (ключ DB `lang`). ЗАПРЕЩЕНО `navigator.language`, `localStorage['ap-settings-lang']`. EN=только English, RU=только русский.

### 2.7 Безопасность
innerHTML — через `esc()` (`js/shared/utils.js`). API-ключи только через backend-прокси. PII plaintext в облако не синкать. `server.js` не заменять стабом (телеметрия → `scripts/telemetry-server.mjs`).

### 2.8 Дизайн-лок 2026-06-20 (4-chamber + Cool Steel B)
- **4 камеры:** ▣ Block · ▥ Streak · ◆ PR · ○ RPE — геометрия (не цвет), `js/shared/chamber-pill.js` (pending)
- **DHL-трекер в Island:** island-tracker.js (pending)
- **Cool Steel B:** `--c-chrome` для хромовых акцентов; PPL только на данных/celebration, не декоре
- **Камера 4 UI-only:** фильтр `!coreOnly` перед `IDB.put`

---

## 3. DONE-LIST (по фазам, с коммитами)

**Координация:** ✅ **C-1** WIP Antigravity зафиксирован (`92e29ac`), тег `checkpoint-pre-C1-2026-06-13`.

**Фаза 0 — Стабильность (7/7 ✅):**
- ✅ 0-1 Secure-context guard (`f9a7277`) · LEAD
- ✅ 0-2 LAN bind + CSP (`f9a7277`) · LEAD
- ✅ 0-3 `errors-ui.js` / `toUserMessage()` — ноль сырых ошибок в UI · SONNET
- ✅ 0-4 Тосты дедуп+лимит(3) · SONNET
- ✅ 0-5 `confirmDialog()` (`40b4458`) · LEAD
- ✅ 0-6 6 нативных `confirm()` → `confirmDialog()` (`40b4458`) · LEAD
- ✅ 0-7 `alert('Not implemented')` убран, `promptDialog()` · SONNET

**Фаза 1 — Токены/цвет (5/7):**
- ✅ 1-1 hex→токены + веса 500/600/800 (`b610b46`) · LEAD
- ✅ 1-2 Двухуровневая палитра BRAND vs SEMANTIC + алиасы PPL (`94c706a`) · LEAD
- ✅ 1-3 PPL-закон везде: инверсия pull/legs исправлена · SONNET
- ✅ 1-4 Body Metrics: радуга → PPL-категории + нейтраль · SONNET
- ✅ 1-7 Лого `Pro`: green → `--c-secondary` violet (`dca99f3`) · LEAD
- ⬜ **1-5** 🟩 GEMINI — Синие FAB + оранжевая рамка Claude → токены. `css/claude.css` (14,20,47,51,95 — hardcoded rgba). **Gemini утверждал done → НЕ СДЕЛАНО.**
- ⬜ **1-6** 🟩 GEMINI — Тонированный фон вместо `#000`. **Gemini утверждал done → НЕ СДЕЛАНО.**

**Фаза 2 — Данные (5/7):**
- ✅ 2-1 Root-fix агрегатов WEEK/MONTH (`0fa5b64`) · LEAD
- ✅ 2-2 Root-fix длительности (`0fa5b64`) · LEAD
- ✅ 2-3 Единый `js/shared/format.js` (`fmtVol/fmtWeight/fmtDuration/fmtDate`) · SONNET
- ✅ 2-4 Запрет будущих дат в Recent · SONNET
- ✅ 2-5 SCORE vs DOTS разведены (`e414d7c`) · LEAD
- ⬜ **2-6** 🟩 GEMINI — Числа через `format.js` повсюду. `toFixed()` прямой всё ещё в 15+ местах. **Gemini утверждал done → НЕ СДЕЛАНО.**
- ⬜ **2-7** 🟦 SONNET — `test/aggregates.test.js` (доп.тесты форматтера).

**Фаза 3 — Иконки (1/4):**
- ✅ 3-1 Эмодзи вычищены (`7aadd1b`) · LEAD
- ⬜ **3-2** 🟩 GEMINI — stroke 1.5/2px, 24×24. *(SVG-иконки без hardcoded hex — статус OK; inline JS-SVG проверить.)*
- ⬜ **3-3** 🟦 SONNET — Метафоры иконок (Hypertrophy→body, Home→house, AI→chat/sparkle).
- ⬜ **3-4** 🟩 GEMINI — `currentColor` + SVGO. *(SVG-файлы без hardcoded hex — возможно ОК.)*

**Фаза 4 — Компоненты (1/5):**
- ✅ 4-1 Vanilla-фабрики `js/ui/factory.js` (`1cc2a98`) · LEAD
- ⬜ **4-2** 🟦 SONNET — Edit Plan: нативные инпуты → `TextField`/`NumberStepper`. `js/workout.view/modals.js`.
- ⬜ **4-3** 🟦 SONNET — CORE унифицировать с карточками упражнений.
- ⬜ **4-4** 🟩 GEMINI — Один empty-state + одна кнопка.
- ⬜ **4-5** 🟩 GEMINI — Единый radius/высота кнопок через токены.

**Фаза 5 — UX (4/7):**
- ✅ **5-1** 🟦 SONNET — Compact done-sets: `W×R` summary, drum-пикеры скрыты. (`fe4deb7`) *(в agitated-satoshi, не в main)*
- ✅ **5-2** — text-overflow имён: `.exercise-name` уже имеет `text-overflow:ellipsis`. УЖЕ БЫЛО.
- ✅ **5-4** 🟦 SONNET — Volume Trend PPL: 3 линии push/pull/legs, `generateSparklineMulti()`. (`fe4deb7`) *(в agitated-satoshi, не в main)*
- ✅ **5-5** 🟦 SONNET — 28 raw `cubic-bezier` → 8 `--ease-*` токенов. `prefers-reduced-motion`. (`fe4deb7`) *(в agitated-satoshi, не в main)*
- ✅ **5-7** 🔒 LEAD — Rest-таймер в Dynamic Island, fixed-модалки убраны (`abd660c`).
- ⬜ **5-3** 🟩 GEMINI — «X» с hero-молнии и имени Gio. *(поиск дал 0 результатов — вероятно ОК)*
- ⬜ **5-6** 🟩 GEMINI — Прогресс-бар онбординга. **Gemini утверждал done → НЕ СДЕЛАНО** (нет `ob-progress` в `js/onboarding.js`).

**Фаза 6 — W-2-C 4-chamber report:**
- ✅ W-2-C 4-chamber report, Core cards, format tests (`46c42c9`) — **В MAIN**

**Analytics visuals (Phase 5 аудио, из brave-brown):**
- ✅ curve-scrub: touch/hover по strength curves (`c8199de`) *(в brave-brown, не в main)*
- ✅ PPL semi-donut gauge (`b30095a`) *(в brave-brown, не в main)*

**BUG-тикеты:**
- ⬜ **BUG-2** `window._coreCheckedState` — `js/workout.view/handlers.js:449-455` всё ещё читает `window._coreCheckedState`; `render.js:81` экспортирует module-level `_coreCheckedState` — связи нет. **НЕ ИСПРАВЛЕНО.**
- ⬜ **BUG-3** Layout thrashing `_initDrag` — 🔒 LEAD.
- ⬜ **BUG-6** Hardcoded rgba sweep — `css/workout.css`, `css/athlete-room.css`. **Gemini утверждал done → НЕ СДЕЛАНО.**

**Ad-hoc:**
- ✅ L-1 Единый источник языка (`69126a0`) · LEAD
- ✅ L-2 Аватар: палитра рамок + пикер + неон-рамка-бордюр (`e414d7c`) · LEAD
- ✅ Bugfix фиолетовой шкалы дня (`b381b68`) · LEAD

---

## 4. ОСТАТОК — делегирование + пояснения

### Фаза 1 — Palette B (🔒 LEAD)
- ⬜ **1-B-1** `--c-chrome` токен + chrome-accent palette в `css/base.css`
- ⬜ **1-B-2** `js/shared/chamber-pill.js` — 4-chamber geometry ▣▥◆○
- ⬜ **1-B-3** `js/shared/island-tracker.js` — DHL-tracker в Dynamic Island

### Фаза 2 — Critical bugs
- ⬜ **BUG-3** 🔒 LEAD — Layout Thrashing в `_initDrag`: batch DOM reads, use `ResizeObserver`.
- ⬜ **BUG-2** 🔒 LEAD — `window._coreCheckedState` в `handlers.js:449-455` → импортировать из `render.js`.

### Фаза 3 — W-1 Add Exercise Live (🔒 LEAD)
Live-поиск + добавление упражнений во время тренировки без выхода из неё.

### Фаза 4 — W-2-A Block timings (🔒 LEAD)
Таймер между блоками упражнений.

### Фаза 5 — W-2-B buildSessionSummary (🔒 LEAD)
Сводка сессии после завершения тренировки.

### Фаза 7 — W-2-D Save & Analytics (🔒 LEAD)
Сохранение с привязкой к аналитике + триггер обновления графиков.

### Gemini residuals (перезапустить с чистым заданием)
- ⬜ **1-5** Tokenize FAB rgba in `css/claude.css` (lines 14,20,47,51,59,80,95,97,113,157,197)
- ⬜ **1-6** Replace `#000` backgrounds → `--c-bg` / `--c-bg-1` where appropriate
- ⬜ **2-6** Replace direct `toFixed()` with `fmtWeight()`/`fmtNum()` from `js/shared/format.js` in `js/progressive-overload.js`, `js/profile.view/hexagon-radar.js`, etc.
- ⬜ **BUG-6** Tokenize hardcoded rgba in `css/workout.css` and `css/athlete-room.css`
- ⬜ **5-6** Onboarding progress dots: highlight active step in `js/onboarding.js`

### Sonnet residuals
- ⬜ **2-7** `test/aggregates.test.js` — формат/агрегат тесты
- ⬜ **3-3** Метафоры иконок
- ⬜ **4-2** Edit Plan → фабрики
- ⬜ **4-3** CORE унификация

---

## 5. ЗАДАЧИ ПОЛЬЗОВАТЕЛЯ (не агентов)
- [ ] Полевой прогон на телефоне: проверить острова flex-раскладку (commit `2f998c1` — верифицирован Sonnet 2026-06-18, revert не нужен; но финальная проверка на живом устройстве желательна).
- [ ] Код-ревью Gemini-работы после перезапуска задач (1-5, 1-6, 2-6, BUG-6, 5-6).

---

## 6. ТЕХНИЧЕСКИЕ ЗАМЕТКИ
- **Запуск:** `npm run dev` → http://localhost:3000 (LAN 0.0.0.0). Порт 3001 = Claude preview.
- **Тесты:** `npm test` = `node --test "test/*.test.js"`. Main: **154/154**. agitated-satoshi: **128/128** (разница = format.test.js +26 тестов в main).
- **SW:** main = `athlete-pro-v57`. agitated-satoshi = `athlete-pro-v58`. После merge обеих веток → v59.
- **AI-оркестратор:** модель `claude-3-5-sonnet-20241022` (устаревшая; обновление = решение пользователя).
- **Worktree compassionate-black:** содержит НЕЗАКОММИЧЕННЫЕ изменения (curve-scrub + ppl-gauge) — не коммитить туда, merge через brave-brown.

---

## 7. ПРОГРЕСС

```
Ф0 (7/7) ✅ · Ф1 (5/7) · Ф2 (5/7) · Ф3 (1/4) · Ф4 (1/5) · Ф5 (4/7+) · Ф6 ✅
brave-brown: curve-scrub+gauge ✅ (pending merge)
agitated-satoshi: 5-1/5-4/5-5 ✅ (pending merge)
Palette B → 🔒 LEAD (Phase 1-B)
W-1/W-2-A/B/D → 🔒 LEAD (Phase 3/4/5/7)
BUG-2/BUG-3 → 🔒 LEAD
Gemini residuals: 1-5/1-6/2-6/BUG-6/5-6 → ❌ НЕ СДЕЛАНО (перезапустить)
```
