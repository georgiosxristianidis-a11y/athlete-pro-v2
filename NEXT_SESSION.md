# NEXT SESSION — Athlete Pro · Канонический хэндофф

> Обновлено: 2026-07-04 (Fable 5, AIR-1 влита).
> **Trunk: `claude/csp-soft-delete` @ `a2900c5`** — AIR-1 (`674553d`) FF-влита после полевого OLED-чека Gio. **НЕ запушено**; main/прод = 1.19.1 `c39f33f` (прод БЕЗ FS и DB-SPLIT 4b/4c).
> Гейт: unit **229/229** · lint **0 err** (stylelint warnings 38). SW `athlete-pro-v91` (следующий свободный v92), VERSION `1.19.1`.
> Теги: `checkpoint-2026-07-04-merge-queue` (`a62f3ee`) · `checkpoint-2026-07-04-pre-air` (`ac0f1e5`) · `checkpoint-2026-07-03-drum-0` (`c39f33f`, прод).
> Активная программа: **AIR-рефакторинг** — `HANDOFF_air_refactor.md` (AIR-1 ✅, next AIR-2). Стек карточек: `HANDOFF_next_cards.md`.
> Done-история — в `CHANGELOG.md`. Этот файл — только актуальное состояние и остаток.

---

## 🎯 АКТИВНАЯ ФАЗА — Air Cleanup

Карточки и правила — **`HANDOFF_air_cleanup.md`** (1 карточка = 1 сессия, по порядку). Статус:

| # | Карточка | Статус |
|---|---|---|
| 1 | BUG-NAV — системная «назад» | ✅ `6637719` (остаток: ручной тест на телефоне после деплоя) |
| 2 | CI — GitHub Actions гейт | ✅ `4ec2e0b` |
| 3 | ARCH-DEL — удалить `js/_archive` | ✅ `84660fb` |
| 4 | DB-SPLIT — `js/db.js` через фасад | 🔶 Settings + OneRM + Metrics/Events/Nutrition/Planned (4b) + Workouts (4c) — всё в trunk после merge queue 2026-07-04; остался Backup (4d) |
| 5 | STYLE-LINT — запрет сырых цветов | ✅ `2d24f7d` (39 legacy warnings — миграция фоном) |
| 6 | DOC-SYNC — этот файл | ✅ 2026-07-02 |

Стек следующих сессий — **`HANDOFF_next_cards.md`**: ~~R (RELEASE 1.19.0)~~ ✅ 2026-07-02 задеплоен (`4ef45b2`, прод v1.19.0 / SW v85; за Gio — ручной тест «назад» на телефоне) → 4b/4c/4d (DB-SPLIT остаток) → Q2 → A-4. Дальше по роадмапу: CRDT foundation — `ROADMAP_elite_athlete-pro.md`.

---

## 📦 ОТКРЫТЫЙ БЭКЛОГ (вне активной фазы; перед взятием перепроверить grep'ом)

- **Q2 🟩** PII console.log sweep — живо: `routes/integrations.js:69` логирует длины ключей (G=/A=).
- **A-4 🟦** unit/visual тест видимости цифр drum после Add Set.
- **Phase D 🟩** spacing sweep: hardcoded `padding:`/`margin:` → `--sp-*` (теперь ловится stylelint-подходом — расширить конфиг или ручной свип).
- **Phase E** Cool Steel residuals: E-1 декор `--c-accent`→`--c-chrome` · E-3 `#000`→`--c-bg*` · E-4 rgba в `workout.css`/`athlete-room.css` (39 stylelint-warnings = карта) · E-5 🟦 ревью.
- **Sonnet residuals 🟦:** 2-7 тесты форматтера · 3-3 метафоры иконок · 4-2 Edit Plan→фабрики · 4-3 CORE-унификация.
- **S0 (опц.)** gitleaks detect read-only.
- **D3 (опц.)** гард на pending `startViewTransition` в `shell.js` (benign VT-abort глушится boundary).
- UI-кнопка «назад» (Apple-паттерн, top-left шеврон на сабэкранах) — микро-карточка, обсудить дизайн с Gio.
- **Отложено осознанно (НЕ тащить):** zod на ответах AI · Signals/Proxy state (YAGNI) · выпил `unsafe-inline` целиком (XL-хвост Strangler после `` html`` ``-тега, D2) · роадмап Фаза 5 полиш.

### 🩸 DATA-SAFETY (срочное поле, за пользователем + LEAD)
- **DS1 🔴** поле-тест IDB v3→v4 миграции на живых данных (workouts/metrics/1RM целы).
- **DS2 🔴** CRDT 2-девайс конвергенция в cloud ДО merge CRDT-ветки.

### 🧭 Решения пользователя (не код)
- **D1** Capacitor go/no-go (локскрин-таймер = боль №1?).
- **D2** Декаплинг инкрементально за флагами; 1-й strangler-таргет = safe-by-default рендер `` html`...` `` с авто-`esc()` в `js/shared/utils.js`.

---

## 🔴 ЗА ПОЛЬЗОВАТЕЛЕМ

- Запушить trunk (Air Cleanup `9a5c1ae`+ не на remote) → FF в main + бамп VERSION (`js/version.js` + `package.json`) по правилу.
- Ручная проверка BUG-NAV «назад» на телефоне после деплоя (Vercel прод = **athlete-pro-v7**, не v2 — см. memory).
- Полевой CRDT 2-девайс (DS2) + миграция v3→v4 на живых данных (DS1).
- Гигиена: `.gitignore` не-UTF8 (UTF-16 → git может молча игнорить правила); `gitleaks.exe` в корне добавить в `.gitignore`; `js/shell.js` содержит не-UTF8 байт (grep видит как binary) — проверить и перекодировать.

---

## 🛡️ АНТИ-ХРУПКИЙ WORKFLOW (обязателен для всех агентов)

1. **Feature Flags (рубильник).** Рискованный/недописанный путь — за флагом `js/flags.js`:
   `import { flag } from './flags.js'; if (flag('v2-x')) renderV2(); else renderLegacy();`
   Дефолты OFF. Сломалось на устройстве → `Flags.setFlag('v2-x', false)` в консоли, без отката Git.
2. **Strangler-Fig.** Легаси не сносим. Новый код рядом за флагом, переключаем по микро-элементу, коммитим зелёным.
3. **Trunk-based (ветки < 24ч).** Задача дня = микро. Застрял > 24ч → `git checkout .`, дроби на два.
4. **Safety net:** перед крупным — тег `checkpoint-<date>`; CI (`.github/workflows/ci.yml`) + pre-push hook — зелёный гейт обязателен. SW-манифест только `npm run build:sw` + бамп `CACHE_NAME`.
5. **FF-only в trunk.** Влитие = `git merge --ff-only <ветка>`. Отказ FF → `git rebase <trunk>` у себя → гейт → FF. Старт от свежего trunk, влитие сразу после гейта, push пакетом. История — одна прямая линия, ноль развилок.

---

## 🤝 МУЛЬТИ-АГЕНТНЫЙ ПРОТОКОЛ

Проект ведут параллельно: **Claude (LEAD)** · **Antigravity·Sonnet** · **Antigravity·Gemini**.

1. Перед задачей — проверь владельца: `🔒 LEAD` не брать (цена ошибки высока).
2. Взял — поставь маркер `🚧 <agent>@<branch>`; закончил — `✅ <hash>`.
3. Чужой незакоммиченный WIP не откатывать (GIO Context Integrity). Один агент = один worktree; в trunk мёржит LEAD после гейта.

| Метка | Кто | Брать | НЕ брать |
|:--:|---|---|---|
| 🔒 LEAD | Claude Opus/Fable | data correctness · schema · security · кросс-секущее · design-DNA | grep+replace, тесты по готовому спеку |
| 🟦 SONNET | Sonnet | scoped рефактор · тесты · компонент по спеку | новая архитектура |
| 🟩 GEMINI | Gemini | массовый CSS/SVG sweep · find/replace | логика с условиями · дизайн |

---

## 🌬 ФИЛОСОФИЯ «AIR» — инварианты (нарушение = регрессия)

1. Воздух вместо линий: никаких `<hr>`/нижних бордеров — только padding/margin и сдвиг поверхности.
2. Hairlines только через `var(--c-border)` (6%) / `var(--c-border-h)` (12%); rgba не хардкодить (stylelint ловит). Цветные подсветки rgba ≤20% — точечно.
3. Отступы карточек/модалок 24/32px (`--sp-3`/`--sp-4`).
4. Safe-area всегда (`--safe-top`/`--safe-bottom`).
5. Mobile-first, брейк 600px; десктоп-колонка 412px, никаких `position:fixed` к окну.
6. Без эмодзи в UI и коде — только SVG. Типографика `→ ✓ ·` — не эмодзи.
7. `island-set-pulse` — НЕ ТРОГАТЬ (жёсткий запрет пользователя).

Полная дизайн-система: `DESIGN.md` + секция Design в `CLAUDE.md` (палитра BRAND/SEMANTIC, PPL-закон, Cool Steel B, 4 камеры ▣▥◆○, i18n через `getLang()`/`isRu()`).

---

## 🔧 ТЕХНИЧЕСКИЕ ЗАМЕТКИ

- **Запуск:** `npm run dev` → :3000 (порт 3000 = пользователь, 3001 = Claude preview). Телеметрия — `scripts/telemetry-server.mjs --lan`, `server.js` не подменять.
- **Тесты:** `npm test` = unit+integration (214). `npx playwright test` — e2e отдельно, **на тёплом сервере** (холодный/зомби :3000 → флаки goto-таймаутов).
- **SW:** `athlete-pro-v83`; ASSETS только через `npm run build:sw`, затем бамп `CACHE_NAME`.
- **Билд:** dev = source, prod = `dist` (esbuild content-hash, immutable) — см. memory cache-hash.
- **Версия:** стабильный мёрж в main = бамп `VERSION` в `js/version.js` + `version` в `package.json`.
