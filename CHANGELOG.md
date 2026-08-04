# Changelog

All notable changes to Fit Elite (Athlete Pro) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.27.1] — 2026-08-03

### Новый логотип «A» во всех размерах
- Заменены `icon-192` · `icon-512` · `apple-touch-icon`; добавлены `icon-384`, `icon-maskable-512` (с safe-zone под круглые маски Android) и настоящий `favicon.ico`.
- `index.html`: `.ico` идёт первым с `sizes="any"` — его берут закладки и старые браузеры, PNG-фавикон они игнорируют. `server.js` перестал отдавать PNG под именем `/favicon.ico`: настоящий `.ico` теперь есть.
- `manifest.json`: 192 `any` + 384 `any` + 512 `any` + `icon-maskable-512` `maskable`. Раньше в `maskable` был подставлен обычный 192-й — без safe-zone Android обрезал бы его по кругу. Поле `version` подтянуто с 1.22.0 до текущего.
- Удалён `icons/favicon.png` — старая фиолетовая марка, потребителя не имела, висела только в прекеше.
- **`scripts/build-sw.mjs` больше не прекеширует крупные иконки установки** (384 · 512 · maskable-512, суммарно 564 КБ). Их читает ОС при установке PWA, приложение в рантайме трогает только `icon-192`. Без исключения прекеш прыгал 1.46 → **2.02 МБ**, мимо потолка 1.5 МБ, и каждый установивший тянул их дважды. Логика та же, что у медиа-исключения (карточка F-7). Сейчас 126 файлов, 1.47 МБ.

### Кнопки данных — два блока по формату (заявка Gio)
- Было: три равные кнопки в ряд и главная зелёная над ними. Стало: **Резервное копирование** — «Экспорт JSON» (зелёная, с датой последнего бэкапа) + «Импорт» под ней; **Выгрузка** — «Экспорт TXT» + «Экспорт CSV». Граница между блоками не «важное/неважное», а наличие обратной дороги: JSON умеет вернуться импортом, TXT и CSV уходят насовсем.
- Отдельной кнопки «Экспорт JSON» рядом с зелёной нет намеренно — это было бы одно действие в двух местах экрана, ровно тот дубль, что убрали в 1.26.0. Вместо этого зелёная кнопка и называется «Экспорт JSON», дата бэкапа осталась её подписью.
- Имена форматов вернулись к «Экспорт TXT/CSV» вместо «Журнал .txt / Таблица .csv» из 1.27.0 — по полевой проверке Gio ряд перестал узнаваться.

## [1.27.0] — 2026-08-02

### Тумблер уведомлений — сигнал об отдыхе (полевая заявка Gio)
- Тумблера не было вовсе: `js/rest-timer.js` дёргал `Notification.requestPermission()` на первом же отдыхе — системный диалог посреди тренировки, без повода и без объяснения. Отказ «не сейчас» закрывал уведомления навсегда, и починить это из приложения было нельзя.
- Теперь строка «Сигнал об отдыхе» стоит в ОСНОВНОМ сразу под «Временем отдыха» — это одна мысль: сколько ждать и как узнать, что дождался. Разрешение спрашивается только по тапу (`Profile.toggleNotify`).
- Тумблер отражает два состояния сразу — настройку в базе И ответ браузера: разрешение отзывают в настройках телефона мимо приложения, и тумблер, который об этом не знает, врал бы «включено». Отказ виден подписью «Запрещено в настройках браузера».
- `_triggerNotification()` сверяется с настройкой: выданный permission означает «можно», а не «нужно».

### Экспорт TXT — шапка, чистка плана, воздух в кнопках
- Шапка отвечает «кто, где и сколько» до первой тренировки: паспорт (имя · возраст · вес), место (зал · страна), блок ИТОГО (тренировки, упражнения, подходы, время в зале, тоннаж) и РЕКОРДЫ (1ПМ) по убыванию. Пустые поля молчат, а не печатают прочерк.
- Нетронутые упражнения (ни одного выполненного подхода) в текст больше не попадают — раньше 80% файла занимали строки «— пропущен». Факт не потерян: в шапке тренировки стоит «сделано 1 из 3». Частично сделанное упражнение свои skipped-строки сохраняет.
- Числительные склоняются: «1 подход · 2 подхода · 5 подходов», «38 лет · 21 год». Время — «2 ч 05 мин» вместо «125 мин».
- Зал и страну спрашивает один диалог перед первой выгрузкой (`promptFieldsDialog` — многополевой вариант `promptDialog`), дальше подставляются молча из настроек.
- Кнопки выгрузки: `.btn-soft` вместо прозрачного `.btn-ghost` 36px. В поле ряд не читался — hairline 6% почти невидим, подпись 13px `--c-text-2` висит в воздухе. Теперь поверхность есть, подпись полной яркости, высота 44 (WCAG 2.5.8). Раскладка 2+1 задана явно: «Журнал .txt» · «Таблица .csv», под ними «Импорт .json».
- Эмодзи в TXT не заводили осознанно (решение Gio 2026-08-02): структуру держат отступы и разделители, правило DESIGN_DNA и `test/txt-export.test.js` остаются целы.

## [1.26.0] — 2026-08-02

### Светлая тема (dark / light / auto)
- Токены светлой палитры — `css/base.css` `:root[data-theme='light']`. Тема = только переопределение токенов: ни одного нового селектора компонента. Бренд и семантика сохраняют хюи, светлота опущена до AA (неоновый `#00e676` на белом давал ~1.5:1).
- `js/theme-boot.js` — классический синхронный скрипт, ставит `data-theme` ДО первой отрисовки (module отложен = вспышка тёмным; инлайн нельзя из-за курса на выпил `unsafe-inline`). Ключ и развилка продублированы из `js/shared/theme.js`, совпадение сторожит `test/theme.test.js`.
- `auto` следует `prefers-color-scheme` и переключается на лету (`matchMedia`), дефолт — тёмная.
- Dynamic Island остаётся тёмной в обеих темах: внутри её поддерева возвращается тёмный набор токенов целиком, а не перекраска детей поимённо.
- Контраст-проба по всем экранам (порог 3:1) нашла три реальные дыры и все три вылечены: подложка спарклайна `--c-spark-bg` на дашборде (1.01:1), текст в острове (1.07:1), меню упражнения в `workout.view/handlers.js` (белый по светлому). Заодно сырые цвета в `profile.view/settings.js` переведены на токены.

### Тумблеры 54×28 → 44×26 (полевая заявка Gio)
- Опоры регламентов — iOS HIG 51×31, Material 3 52×32; оба тяжелее, потому что там тумблер сам себе цель нажатия. Здесь нажимается вся строка, цель 44×44 держит `.switch-wrap` (WCAG 2.5.5). 26px = высота соседней строки текста.

### Экспорт TXT + единый путь выгрузки
- `js/shared/txt-export.js` — журнал тренировок обычным текстом (для человека: тренеру, в заметки, на печать). RU/EN, чистая функция, `test/txt-export.test.js`.
- `js/shared/download.js` — одна реализация «текст → файл» вместо трёх прошитых по месту (JSON в `profile.js`, CSV в `csv-export.js`).
- Блок DATA: главная кнопка бэкапа (JSON) + ряд TXT · CSV · Импорт. Дату последнего бэкапа обновляет только JSON — вернуть данные умеет лишь он.

## [1.25.20] — 2026-07-26

### F-1-хвост — static import guard (AR-SAVE-CRASH class)
- **TEST-IMPORT-GUARD** (`cc0f310`) — `test/import-guard.test.js`: сканирует `js/shared/*.js` на динамические `import('./x.js')` и проверяет, что цель реально существует на диске. Ловит целый класс регрессий (не только один случай AR-SAVE-CRASH, где `saveName()` кидала на несуществующем пути к `profile.store.js`).

## [1.18.x] — 2026-06-12 → 2026-07-02 (сводка, перенесено из NEXT_SESSION.md при DOC-SYNC)

### Air Cleanup (2026-07-02, HANDOFF_air_cleanup.md)
- **BUG-NAV** (`6637719`) — системная «назад» больше не закрывает PWA: History API в `js/shell.js` (pushState/popstate).
- **CI** (`4ec2e0b`) — GitHub Actions: lint → test → audit; e2e отдельным job (retries=2).
- **ARCH-DEL** (`84660fb`) — удалён `js/_archive` (−3482 строк), SW v82.
- **DB-SPLIT** (частично, `2af782b`/`ad7b769`) — `js/db/` фасад: вынесены core/Settings/OneRM, публичный API не менялся; SW v83 (`9a5c1ae`).
- **STYLE-LINT** (`2d24f7d`) — stylelint запрещает сырые hex/rgba вне `base.css :root` (139 legacy → warnings).

### SSE hardening + reconcile (2026-07-01)
- Coach-стрим: error-frame, heartbeat, обработка disconnect; `errors.js` headersSent-guard; +3 теста (214/214). Линии trunk↔origin/main примирены → FF push `a599d9d`.

### Кэш и деплой (2026-06-27)
- esbuild content-hash → `dist`, immutable cache; dev = source, prod = dist. Vercel прод = athlete-pro-v7; `vercel.json` includeFiles + SPA-fallback (`7aab4a1`).

### Island / workout (2026-06-24 → 2026-06-29)
- **CSP Phase 2** — inline-хендлеры 158→0, `scriptSrcAttr 'none'`; `events.js` +onInput/onBlur (тег `checkpoint-2026-06-24-csp-done`).
- **FAB→Intel** (`580e0ae`) — e2e 29/29.
- **Sync Indicator в Island** (`f8fa53c`) — deriveDotState: synced/syncing/no-cloud/offline/airgap.
- **W-1 Add Exercise Live** — фича была с `3925863`, e2e-гард `d160903`.
- **BUG-3** layout thrashing `_initDrag` (`412f0ce`); **BUG-2** `window._coreCheckedState` устранён.
- **Drum weight fix** (`fd99a2e`) — скрытый барабан (display:none → scrollTop 0) обнулял вес + стейл `.set-done-summary`.
- **Q1 prefill** — drum стартует с веса прошлой сессии (`_getLastSessionWeight` в render.js).
- CSS/island полиш frosty-nobel влит FF (`3221af7`).

### Merge-спринт + PANDA (2026-06-22 → 2026-06-24)
- Фаза M: merge Gemini-линии (`7c9afd1`), fmtVol-рекурсия (`a4b6e34`), BUG-7 set-logger (`b7bab66`); тег `checkpoint-2026-06-24-merged`.
- SW → network-first для JS/CSS/HTML, убран синтетический 408, прекэш с лимитом 6 (`39404de`); DHL 4-камерный трекер в острове + Cool Steel chrome (`5f76ac1`); drum-центровка (`96fe049`); error-boundary benign-фильтр (`4d01a2c`); e2e regressions (`e90f2ec`).
- PANDA: per-engine BYOK-ключ (`0d46ecb`), esc() на ключе (`db4127e`), модель в env-конфиг + симметричный BYOK (`50855ee`); гибрид движков — отклонён.
- XSS-аудит S1 (`cc145bd`); 5-6 onboarding progress готов; `.env` чист.

### Дизайн-лок + CRDT (2026-06-18 → 2026-06-20)
- Design Lock: 4 камеры ▣▥◆○ (геометрия, не цвет), DHL-трекер, Cool Steel B (`--c-chrome`), Камера 4 UI-only (фильтр `!coreOnly`).
- CRDT-UUID Фаза 6: `DB_VERSION` 3→4 без autoIncrement, legacy int→UUID; `SyncManager.pull()` мёрдж-вниз + `sync-merge.js`.
- Импорт истории из Excel: ETL `scripts/import-etl.py` → 128 тренировок (2023-05→2025-09, 0 unmatched).
- Strength Progression кривые + scrub, PPL semi-donut gauge, Strength Index хиро; Lighthouse a11y 88→100.

---

## [1.17.0] — 2026-06-08

### Phase 5: Smart UX & Micro-interactions — COMPLETE

#### Added

**Phase 5.1: Core Scenario Optimization**
- **Workout Creation Flow:** Staggered entry animations for Training Hub sections.
- **Profile Update UX:** Responsive feedback loop for stat/name updates (toast + auto-refresh).
- **Spring Progress Bar:** Dynamic animation for active plan progress in Training Hub.

**Phase 5.2: Elite Micro-interactions**
- **Staggered Animations:** Applied `stagger-item` globally for smoother screen transitions.
- **Progress Bar Polish:** Integrated `Spring` physics for Dashboard 1RM bars and Analytics progress bars.
- **View Transitions API:** Verified and optimized native cross-fade transitions.

**Phase 5.3: Feedback & Empty States**
- **Elite Empty States:** Upgraded Analytics screen with helpful guidance and calls-to-action for new users.
- **Skeleton Loaders:** Multi-line shimmering skeletons for AI responses (Claude Coach, Workout AI) and heavy stats cards.

#### Technical Details

**Modified Files (Phase 5):**
- `js/workout.view/render.js` — Added Training Hub animations and Spring progress bar.
- `js/dashboard.js` — Added Spring physics to 1RM bars.
- `js/analytics.view.js` — Added elite empty states and animated ORM bars.
- `js/shared/athlete-room.js` — Improved stat saving responsiveness with toasts and auto-refresh.
- `js/claude.view.js` — Replaced dots with multi-line skeleton loaders.
- `js/workout-ai.view.js` — Integrated proactive skeleton loaders for AI messages.
- `css/base.css` — Centralized global skeleton (`.sk`, `.sk-lines`) and shimmer animation.
- `css/dashboard.css` — Cleaned up redundant skeleton styles.

#### Verified
- ✅ All Phase 5 requirements met.
- ✅ GIO Standards (Minimalism & Air, No System Emojis) applied.
- ✅ Animations verified at 60fps.

---

## [1.0.0] — 2026-03-29

### 🎉 Milestone 1.0 — Elite Foundation — COMPLETE

#### Added

**Phase 1: Architecture Foundation**
- Store/View separation for workout, analytics, claude modules
- ES Modules migration (removed global namespace pollution)
- JSDoc type annotations on all public APIs
- Server refactor: routes/ + lib/ structure

**Phase 2: Performance & Reliability**
- Conditional Firebase SDK load (100KB savings)
- DB coalescing: 1 IndexedDB transaction instead of 4
- Lazy initialization for analytics + AI modules
- Service Worker: all JS files cached for offline use
- **Lighthouse Score: 97/100**

**Phase 3: Design System**
- css/base.css with unified components
- WCAG AA contrast compliance (#9ca3af for --c-text-3)
- focus-visible indicators on all inputs
- aria-labels on all icon buttons
- 44px minimum touch targets for streak dots
- Breakpoint system (<360px, 768px tablet)

**Phase 4: AI Autopilot**
- **AI-1:** AI-powered PPL program generation
  - Auto-generation for new users
  - On-demand regeneration via Claude panel
  - Preview modal with Accept/Regenerate buttons
- **AI-2:** Adaptive load recommendations
  - Post-workout summary modal
  - Dashboard card with next-session weights
  - localStorage persistence (7-day expiry)
- **AI-3:** In-workout AI dialog
  - Floating AI bubble (proactive visibility)
  - Mini chat overlay with quick actions
  - SSE streaming for real-time responses
- **AI-4:** Progressive overload engine
  - Inline suggestions in set cards
  - Color-coded indicators (🟢 PR / 🔵 Recommended / ⚪ Normal)
  - Plateau detection (3+ sessions without progress)
  - Weekly summary modal with PRs and alerts

#### Changed

- Updated CLAUDE.md with Phase 4 features
- Updated STATE.md with final milestone status
- All verification tests passing (21/21, 100%)

#### Technical Details

**New Files Created (Phase 4):**
- `js/workout-ai.view.js` — In-workout AI bubble and chat
- `js/progressive-overload.js` — Overload calculation and plateau detection
- `test/phase4-verification.js` — Automated verification tests
- `.planning/phases/04-ai-autopilot/*.md` — Planning documentation

**Modified Files (Phase 4):**
- `routes/coach.js` — Added POST /generate-plan endpoint
- `js/workout.store.js` — Added program generation functions
- `js/claude.store.js` — Added generatedPlan property
- `js/claude.view.js` — Added plan preview modal functions
- `js/app.js` — Added new user onboarding logic
- `js/workout.view.js` — Integrated AI features + inline suggestions
- `js/dashboard.js` — Added weekly summary modal
- `index.html` — Added plan preview modal DOM
- `css/claude.css` — Added plan preview styles
- `css/workout.css` — Added AI bubble, chat, and progression styles

#### Verified

- ✅ 21 automated verification tests (100% pass rate)
- ✅ All Phase 4 requirements met (AI-1, AI-2, AI-3, AI-4)
- ✅ Milestone 1.0 complete (4/4 phases)

---

## [0.9.0] — 2026-03-23

### Added

- Initial v0 feature-complete release
- PPL workout logging
- 1RM estimation
- Muscle fatigue heatmap
- AI chat via Claude Opus (SSE streaming)
- Dashboard/analytics/body stats/profile screens
- Offline PWA with Service Worker
- Rest timer
- Plate calculator
- Optional cloud sync (Supabase + Firebase)

---

## Pre-release — Before 2026-03-15

### Foundation

- Initial project setup
- Basic workout tracking
- IndexedDB storage
- Express server with Claude AI integration

---

## Future (v2.0 - TBD)

Potential features for next milestone:

- Cloud sync enhancements
- Advanced analytics and insights
- Mobile app (React Native?)
- Social features (workout sharing)
- Exercise video library
- Periodization programming
- Deload week auto-scheduling
- Integration with wearables (Fitbit, Garmin)
