# NEXT SESSION — Athlete Pro · Канонический хэндофф

> Обновлено: 2026-06-18, сессия Claude (Opus 4.8, LEAD). **byoi == main == `a0c8673`** (всё интегрировано). CRDT-UUID этой сессии — на ветке `claude/brave-brown-d5209a` (**НЕ влито в byoi**, ждёт интеграции + полевого теста). Тег-чекпоинт `checkpoint-2026-06-17`. Последний полностью верифицированный (без cloud-полевого) коммит: остров `2f998c1`.
> Это **единый источник правды**: план, делегирование, философия Air, дизайн-система, done-list, остаток.
> Табличный дубль — `docs/DELEGATION-PLAN.md`.

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
🔒 **LEAD:** все плановые закрыты. ✅ верификация острова (2026-06-18). ✅ Фаза 6 CRDT-UUID (2026-06-18, ждёт интеграции byoi + полевого теста). Остаётся: BG-1 (wake-lock дефолт ON, отложено) → Фаза 6 **Lighthouse**-проход (perf/a11y/PWA).

### ⏳ За пользователем
Полевой тест на телефоне (`:3000`, очистить SW-кэш): **CRDT 2-девайс конвергенция в cloud-режиме** (см. красный блок — главное на этой ветке) + миграция IDB v3→v4 на живых данных (workouts/metrics/1RM целы после апгрейда) + остров (вкл. **keep-awake** в настройках, чтобы таймер жил).

---

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
- `island-set-pulse` (зелёная вспышка завершения сета) — **НЕ ТРОГАТЬ** (жёсткий запрет пользователя).

### 2.6 i18n
Язык UI — ТОЛЬКО `getLang()`/`isRu()` из `js/locale.store.js` (ключ DB `lang`). ЗАПРЕЩЕНО `navigator.language`, `localStorage['ap-settings-lang']`. EN=только English, RU=только русский.

### 2.7 Безопасность
innerHTML — через `esc()` (`js/shared/utils.js`). API-ключи только через backend-прокси. PII plaintext в облако не синкать. `server.js` не заменять стабом (телеметрия → `scripts/telemetry-server.mjs`).

---

## 3. DONE-LIST (по фазам, с коммитами)

**Координация:** ✅ **C-1** WIP Antigravity зафиксирован (`92e29ac`), тег `checkpoint-pre-C1-2026-06-13`.

**Фаза 0 — Стабильность (4/7):**
- ✅ 0-1 Secure-context guard для Web Crypto (`f9a7277`) · LEAD
- ✅ 0-2 LAN bind 0.0.0.0 + CSP upgrade-insecure (`f9a7277`) · LEAD
- ✅ 0-5 Общий `confirmDialog()` Promise<bool> — `js/shared/confirm.js` (`40b4458`) · LEAD
- ✅ 0-6 Все 6 нативных `confirm()` → `confirmDialog()` (`40b4458`) · LEAD (поднято из GEMINI: sync→async = корректность)

**Фаза 1 — Токены/цвет (3/7):**
- ✅ 1-1 hex→токены + веса 500/600/800 (`b610b46`) · LEAD
- ✅ 1-2 Двухуровневая палитра BRAND vs SEMANTIC + алиасы push/pull/legs (`94c706a`) · LEAD
- ✅ 1-7 Лого `Pro`: green → `--c-secondary` (violet, = иконке `icon-192.png`) (`dca99f3`) · LEAD

**Фаза 2 — Данные (3/7):**
- ✅ 2-1 Root-fix агрегатов WEEK==MONTH: `startOfWeek/startOfMonth` в `db.js` (`0fa5b64`) · LEAD
- ✅ 2-2 Root-fix длительности (228391m): `duration`=мс, 4 читателя починены (`0fa5b64`) · LEAD
- ✅ 2-5 SCORE vs DOTS разведены (`e414d7c`) · LEAD
- 🟡 2-7 `test/aggregates.test.js` (10) — остаётся форматтер

**Фаза 3 — Иконки (1/4):** ✅ 3-1 Эмодзи вычищены (`7aadd1b`) · LEAD

**Фаза 4 — Компоненты (1/5):** ✅ 4-1 Vanilla-фабрики `js/ui/factory.js` (Button/TextField/NumberStepper/Card → DOM-узлы, текст через textContent), токен-классы `.ui-*` + `.btn-danger` в base.css, SW→v48 (`1cc2a98`) · LEAD

**Фаза 5 — UX (1/7):** ✅ 5-7 Rest-таймер в Dynamic Island, fixed-модалки убраны (`abd660c`) · LEAD

**Ad-hoc:**
- ✅ L-1 Единый источник языка, убраны 2 класса багов, 9 точек (`69126a0`) · LEAD
- ✅ L-2 Аватар: палитра рамок + пикер + неон-рамка-бордюр + кроп i18n (`e414d7c`) · LEAD
- ✅ Bugfix фиолетовой шкалы дня `#workout-progress-fill` (`b381b68`) · LEAD

---

## 4. ОСТАТОК — делегирование + пояснения

### Фаза 0 — добить (3, все 🟦 SONNET)
- ⬜ **0-3** `toUserMessage()` — ноль стектрейсов в UI. new `js/shared/errors-ui.js`; точки: `js/boot.js:10` (сейчас сырой `'ERR:'+e.message`), `js/intel.view.js:279`, `js/workout-ai.view.js:409`, `js/claude.view.js` onError.
- ⬜ **0-4** Дедуп + лимит тостов. `js/shell.js` (Toast).
- ⬜ **0-7** Реализовать/спрятать `alert('Not implemented')`. `js/workout.view/handlers.js:301-304`.

### Фаза 1 — разблокировано (1-2 ✅)
- ⬜ **1-3** 🟦 SONNET — Закон PPL везде (`--c-push/pull/legs`). `js/intel.view.js`, `js/body-stats.js`, `js/analytics.view.js`.
- ⬜ **1-4** 🟦 SONNET — Body Metrics: радуга → PPL-категории + нейтраль. `js/body-stats.js` (BS_FIELDS).
- ⬜ **1-5** 🟩 GEMINI — Синие FAB + оранжевая рамка Claude → в систему. `css/claude.css`, `css/profile.css`.
- ⬜ **1-6** 🟩 GEMINI — Тонированный фон вместо `#000` (кроме острова). `css/*`.

### Фаза 2 — разблокировано (2-1/2-2 ✅)
- ⬜ **2-3** 🟦 SONNET — Единый форматтер число/единицы/дата. `js/shared/format.js` (переиспользовать `startOfWeek/Month`).
- ⬜ **2-4** 🟦 SONNET — Запрет будущих дат в Recent + валидация. `js/analytics.view.js`, `js/dashboard.js`.
- ⬜ **2-6** 🟩 GEMINI — Единый формат чисел (488 vs 6.9k) через форматтер 2-3.
- 🟡 **2-7** 🟦 SONNET — Дотесты форматтера.

### Фаза 3 — Иконки
- ⬜ **3-2** 🟩 GEMINI — stroke 1.5/2px, 24×24, `fill=none` неактивным. `index.html` nav, `js/*` SVG.
- ⬜ **3-3** 🟦 SONNET — Метафоры: Hypertrophy→тело, Home→house, AI-бабл→chat/sparkle. `js/onboarding.js`, navbar, `js/claude.view.js`.
- ⬜ **3-4** 🟩 GEMINI — `currentColor` + SVGO + «тест 16px». Весь SVG-набор.

### Фаза 4 — Компоненты (4-1 ✅ — разблокировано)
- ⬜ **4-2** 🟦 SONNET — Edit Plan: нативные инпуты → `TextField`/`NumberStepper`. `js/workout.view/modals.js`. **Контракт:** `import { Button, TextField, NumberStepper, Card } from '../ui/factory.js'` (возвращают DOM-узлы → `.append()`, не innerHTML).
- ⬜ **4-3** 🟦 SONNET — CORE унифицировать с карточками упражнений. `js/workout.view/render.js`, `css/workout.css`.
- ⬜ **4-4** 🟩 GEMINI — Один empty-state + одна кнопка (Home==Analytics). `js/dashboard.js`, `js/analytics.view.js`.
- ⬜ **4-5** 🟩 GEMINI — Единый radius/высота кнопок через токены. `css/*`.

### Фаза 5 — UX
- ⬜ **5-1** 🟦 SONNET — Компактный ввод сета (гигантские инпуты при 22 подходах). `js/workout.view/render.js`, `css/workout.css`.
- ⬜ **5-2** 🟩 GEMINI — text-overflow имён упражнений. `css/workout.css`.
- ⬜ **5-3** 🟩 GEMINI — Убрать «X» с hero-молнии и у имени Gio. `js/dashboard.js`, `js/profile.*`.
- ⬜ **5-4** 🟦 SONNET — Volume Trend: реальный график или честный empty. `js/dashboard.js`, `js/analytics.view.js`.
- ⬜ **5-5** 🟦 SONNET — Микроанимации на motion-токенах + `prefers-reduced-motion`. `css/base.css`, `js/shared/spring.js`.
- ⬜ **5-6** 🟩 GEMINI — Прогресс-бар онбординга: подсветка текущего шага. `js/onboarding.js`.

---

## 5. ЗАДАЧИ ПОЛЬЗОВАТЕЛЯ (не агентов)
- [ ] Полевой прогон на телефоне: `node scripts/telemetry-server.mjs --lan` → проверить **миграцию IndexedDB v3 на живых данных** (workouts/metrics/1RM целы).
- [x] **main синхронизирован** (2026-06-15): clean FF `main` → `229886d` (byoi), без конфликтов. **Остаток интеграции:** коммиты сессии `dca99f3` (1-7) + `1cc2a98` (4-1) на `claude/epic-meninsky-baae59` (+2 к byoi) — влить в byoi из главного worktree (где byoi выписан), чтобы Sonnet брал 4-2 с актуальной базы. Старые worktree (`frosty-payne` и пр.) — не использовать.

---

## 6. ТЕХНИЧЕСКИЕ ЗАМЕТКИ
- **Запуск:** `npm run dev` → http://localhost:3000 (LAN 0.0.0.0).
- **Тесты:** `npm test` = `node --test "test/*.test.js"` → **128/128** (e2e — playwright отдельно).
- **SW:** `sw.js` cache `athlete-pro-v48`. **Бамп при любой правке JS/CSS.** `npm run build:sw` автогенерит ASSETS. Cache-first + нормализует URL (отбрасывает query) → при разработке свежий код = hard-reload ×2 или Unregister SW.
- **AI-оркестратор:** модель `claude-3-5-sonnet-20241022` (устаревшая; обновление = решение пользователя).

---

## 7. ПРОГРЕСС
✅ C-1 · 🟨 Ф0 (4/7) · 🟨 Ф1 (3/7) · 🟨 Ф2 (3/7) · 🟨 Ф3 (1/4) · 🟨 Ф4 (1/5) · 🟨 Ф5 (1/7) · 🌐 i18n L-1/L-2 ✅

**Все плановые 🔒 LEAD-задачи закрыты** (последние — 1-7, 4-1 в этой сессии). Следующий LEAD-фокус: интеграция ветки сессии → byoi, затем ревью/мёрж делегируемых выходов и Фаза 6 (CRDT-UUID / Lighthouse). Делегируемое — Sonnet/Gemini параллельно: Ф0 (0-3/0-4/0-7), 1-3..1-6, 2-3/2-4/2-7, 3-2..3-4, **4-2..4-5 (разблокировано 4-1)**, 5-x.
