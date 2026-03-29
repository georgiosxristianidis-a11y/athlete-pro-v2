# App Audit — Athlete Pro
Generated: 2026-03-16
Sources: Claude Code analysis + Cursor AI analysis

---

## Overall Score: 7 / 10

---

## Confirmed Issues

### 1. Full-scan IndexedDB на каждый запрос
**Severity:** High
**Files:** `js/db.js:106`, `js/dashboard.js`

`Workouts.getAll()` читает всю базу целиком. Dashboard делает 4 отдельных вызова при загрузке:
- `weeklyVolume()` → getAll
- `monthlyCount()` → getAll
- `pplTonnage()` → getAll
- `weeklyTrend()` → getAll

**Fix:** Один `getAll()` → передать массив во все функции как аргумент.

---

### 2. Firebase SDK грузится безусловно
**Severity:** High
**Files:** `index.html:456–457`

```html
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>
```

~100KB+ парсится при каждой загрузке, даже если Firebase не настроен.

**Fix:** Проверить `/api/firebase-config` → динамически вставить `<script>` только если `configured: true`.

---

### 3. Нет lazy-инициализации тяжёлых модулей
**Severity:** Medium
**Files:** `index.html:460–469`, `js/claude.js:733–738`

`analytics.js` (25KB), `claude.js` (30KB), `plate-calc.js` грузятся при старте независимо от того, куда идёт пользователь. `Claude.renderFAB()` вызывается сразу на DOMContentLoaded.

**Fix:** Инициализировать модули только при первом переходе на соответствующий экран через `Nav.go()`.

---

### 4. Body SVG пересоздаётся при каждом открытии AI-панели
**Severity:** Medium
**Files:** `js/claude.js:429`

`buildBodySVG(scores)` — ~200 строк HTML генерируется заново при каждом `Claude.open()`.

**Fix:** Кэшировать SVG строку, инвалидировать только если `scores` изменились.

---

### 5. Монолитные JS-файлы без явного разделения (Cursor)
**Severity:** Medium
**Files:** `js/workout.js` (~51KB), `js/claude.js` (~30KB), `js/analytics.js` (~25KB)

Логика UI, бизнес-логика и работа с данными смешаны в одном файле. Нельзя изолировать и оптимизировать конкретный участок без риска сломать соседний.

**Fix:** Разбить крупные файлы на логические под-модули (например, `workout-ui.js`, `workout-engine.js`, `workout-state.js`).

---

### 6. Нет метрик производительности (Cursor)
**Severity:** Medium

Отсутствуют: Lighthouse score, Web Vitals (LCP, CLS, FID), замеры рендеров через DevTools Performance. Текущая "плавность" держится на простоте стека, а не на активной оптимизации — проблемы роста не будут видны заранее.

**Fix:** Добавить Lighthouse CI в workflow, снять baseline Web Vitals сейчас.

---

### 7. Clock interval = 30 секунд
**Severity:** Low
**Files:** `index.html:483`

Время в статус-баре может отставать до 29 секунд.

**Fix:** `setInterval(updateClock, 1000)` либо `setInterval(updateClock, 10000)`.

---

---

---

# Design Audit — Athlete Pro
Score: 8.5 / 10 (Claude) | уточнён Cursor
Sources: Claude Code analysis + Cursor AI analysis

---

## Confirmed Issues

### 1. Возможны пробелы в единстве дизайн-системы (Cursor)
**Severity:** Medium

Дизайн-токены для цветов и spacing заданы (`--c-*`, `--sp-*`), но нет гарантии что они применяются консистентно во всех 6 CSS-файлах. Риски:
- Разные отступы в одинаковых компонентах (карточки в Dashboard vs Analytics vs Profile)
- Состояния `hover/active/disabled` могут быть реализованы по-разному в каждом модуле
- Иерархия заголовков (`screen-title` 26px → `section-label` 11px) может нарушаться в отдельных экранах

**Fix:** Аудит каждого CSS-файла на использование токенов. Вынести общие компоненты (кнопки, карточки, инпуты) в `css/base.css`.

---

### 2. Адаптивность без системного подхода к breakpoints (Cursor)
**Severity:** Medium
**Files:** `index.html` (inline CSS:322–327), все `css/*.css`

Единственный breakpoint — `min-width: 600px` для центрирования контента. Нет системы breakpoints для типографики, сеток, компонентов. При нестандартных размерах экрана (планшеты, fold-устройства) layout может ломаться.

**Fix:** Ввести 2–3 явных breakpoint-переменных, проверить длинные листинги тренировок и таблицы на узких экранах (<360px).

---

### 3. Контрастность и accessible-состояния частично не проработаны (Cursor)
**Severity:** Medium
**Files:** `index.html:271–280`, `css/*.css`

- `--c-text-3: #6b7280` на `--c-bg: #0a0a0f` — соотношение контраста ~3.5:1, ниже WCAG AA (4.5:1) для основного текста
- `focus-visible` outline задан глобально, но у `input` и `textarea` отключён (`outline: none`) — клавиатурные пользователи теряют индикатор фокуса на полях ввода
- ARIA-атрибуты есть только на FAB-кнопке (`aria-label="AI Coach"`), остальные иконочные кнопки без подписей

**Fix:** Поднять контраст `--c-text-3` до минимум `#9ca3af`. Добавить видимый `focus-visible` на инпуты через `box-shadow` вместо `outline`. Пройтись по иконочным кнопкам с `aria-label`.

---

### 4. Streak dots — малый touch target (Claude)
**Severity:** Low
**Files:** `css/dashboard.css:103`

`width: 28px; height: 28px` — меньше рекомендуемых Apple/Google 44px для тапа.

**Fix:** Увеличить до 36–44px или добавить padding вокруг.

---

## Roadmap к 9–10 / 10

### Плавность (Performance)
| Приоритет | Задача | Эффект |
|---|---|---|
| 🔴 High | DB coalescing — один `getAll()` на Dashboard | -3 IndexedDB транзакции при загрузке |
| 🔴 High | Conditional Firebase SDK load | -100KB+ при старте |
| 🟠 Medium | Lazy init Analytics + AI модулей | Быстрый первый экран |
| 🟠 Medium | SVG кэширование в `Claude` | Меньше аллокаций при открытии панели |
| 🟡 Low | Разбивка крупных файлов | Maintainability + точечный профайлинг |
| 🟡 Low | Lighthouse baseline + Web Vitals | Observability — знаем где мы |

### Дизайн
| Приоритет | Задача | Эффект |
|---|---|---|
| 🔴 High | Аудит CSS на использование токенов + `css/base.css` | Консистентность во всех экранах |
| 🔴 High | Контраст `--c-text-3` → `#9ca3af` | WCAG AA compliance |
| 🟠 Medium | `focus-visible` на инпуты через `box-shadow` | Keyboard accessibility |
| 🟠 Medium | `aria-label` на иконочные кнопки | Screen reader support |
| 🟠 Medium | Проверка layout на <360px и планшетах | Адаптивность |
| 🟡 Low | Streak dots → 44px touch target | Удобство на мобильном |

### Архитектура (Cursor)
| Приоритет | Задача | Эффект |
|---|---|---|
| 🔴 High | Store + View разделение в крупных модулях | Изоляция состояния, контроль перерендеров |
| 🟠 Medium | Разбивка `server.js` → `routes/`, `lib/anthropicClient`, `lib/storage` | Читаемость, тестируемость backend |
| 🟠 Medium | JSDoc-контракты на публичные API модулей | Явные типы данных, меньше runtime-ошибок |

---

# Architecture Audit — Athlete Pro
Score: 6.5 / 10 (Claude) | дополнен Cursor
Sources: Claude Code analysis + Cursor AI analysis

---

## Confirmed Issues

### 1. Нет разделения Store / View (Cursor)
**Severity:** High
**Files:** `js/workout.js`, `js/dashboard.js`, `js/analytics.js`

UI-логика, бизнес-логика и состояние смешаны в одном IIFE. Например, в `workout.js` в одном модуле живут: `State` (данные сессии), рендеринг DOM, обработка событий, сохранение в IndexedDB.

**Fix:** Разделить каждый крупный модуль на два слоя:
```
workout-state.js  — State, мутации, DB-операции
workout-view.js   — renderSelect(), renderActive(), обработчики событий
```
Без фреймворка — просто явные boundaries между слоями.

---

### 2. `server.js` — монолит (Cursor)
**Severity:** Medium
**File:** `server.js`

Все 153 строки в одном файле: конфигурация, 3 route-хендлера, `_buildSystemPrompt()`, инициализация Anthropic-клиента.

**Fix:**
```
server.js              — только app init + listen
routes/coach.js        — POST /api/coach
routes/integrations.js — GET /api/supabase-status, /api/firebase-config
lib/anthropicClient.js — инициализация SDK, buildSystemPrompt()
```

---

### 3. Нет контрактов данных (Cursor)
**Severity:** Medium
**Files:** `js/db.js`, `js/workout.js`, `js/claude.js`

Структуры данных нигде не задокументированы. Например, формат объекта `session` в `Workouts.save()` можно понять только читая весь `workout.js`. Нет защиты от передачи невалидных данных между модулями.

**Fix (минимальный — JSDoc):**
```javascript
/**
 * @typedef {Object} WorkoutSession
 * @property {'push'|'pull'|'legs'} type
 * @property {number} timestamp
 * @property {number} tonnage
 * @property {Exercise[]} exercises
 */

/**
 * @param {WorkoutSession} session
 * @returns {Promise<number>} id
 */
save(session) { ... }
```

**Fix (полный — TypeScript):** Миграция на `.ts` с `tsc --noEmit` для проверки типов без изменения бандлинга.
