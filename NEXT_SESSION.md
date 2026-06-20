# NEXT SESSION — Athlete Pro · Канонический хэндофф

> Обновлено: 2026-06-21, сессия Sonnet 4.6 (worktree `agitated-satoshi-6f04f0`). **Аудит чекпоинта 2026-06-20. Читать → сразу к разделу 8 (MERGE) и 9 (СЛЕДУЮЩИЙ LEAD).**
> Это **единый источник правды**: план, делегирование, философия Air, дизайн-система, done-list, остаток.
> Табличный дубль — `docs/DELEGATION-PLAN.md`.

---

## 8. ПЕРВООЧЕРЕДНО ДЛЯ LEAD OPUS — 2026-06-21

### 8.1 Три ветки ждут merge в main

| Ветка | Последний коммит | Что | Тесты |
|---|---|---|---|
| `claude/brave-brown-d5209a` | `b30095a` | curve-scrub (touch/hover по strength curves) + PPL semi-donut gauge | 139/139 (SW v65) |
| `claude/agitated-satoshi-6f04f0` | `b951ce0` | 5-1 compact done-sets + 5-4 PPL sparkline + 5-5 motion tokens (v58) | 128/128 |
| `main` | `46c42c9` | W-2-C 4-chamber report ← **уже в main** | 154/154 |

**Порядок merge:**
1. Мерж `brave-brown` → main (базируется на `a0c8673`, 2 коммита вперёд)
2. Мерж `agitated-satoshi` → main (базируется на `a0c8673`, 2 коммита вперёд)
3. Bump SW до v59 (или выше, если обе ветки дают разные файлы)
4. `npm test` → убедиться 154+ / 0 fail

> **Предупреждение:** `claude/compassionate-black-30cbfd` содержит НЕЗАКОММИЧЕННЫЕ изменения (те же curve-scrub + ppl-gauge что и в brave-brown) — это WIP другого агента. **Не трогать**, merge через brave-brown достаточен.

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
