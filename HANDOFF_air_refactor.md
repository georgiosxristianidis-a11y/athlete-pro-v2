# HANDOFF — AIR-рефакторинг поверхностей (OLED near-black + AIR)

> Программа: единая система высоты Tier 0/1/2. Blur остаётся ТОЛЬКО на плавающих слоях.
> 1 карточка = 1 сессия = 1 атомарный коммит. Порядок строго сверху вниз.
> Решение Gio: полная раскатка, откат = git revert по фазам, runtime-флаг НЕ делаем.

## Чекпоинты отката (НЕ ПУТАТЬ)

| Тег | Коммит | Что это |
|---|---|---|
| `checkpoint-2026-07-03-drum-0` | `c39f33f` | Релиз 1.19.1, НА ПРОДЕ. Стабильная база «вчера» |
| `checkpoint-2026-07-04-pre-air` | `ac0f1e5` | Барабан AIR (фаза 0), ветка trusting-antonelli. Стабильная база «перед раскаткой» |

Откат фазы: `git revert <sha фазы>` → `npm run build:sw` + бамп `CACHE_NAME` (ОБЯЗАТЕЛЬНО, иначе PWA держит старый CSS) → гейт → коммит.

## Правила для агентов (каждая сессия)

1. **База:** ветка от свежего trunk (`claude/csp-soft-delete`), сверить хеш с NEXT_SESSION.md. ✅ Пререквизит закрыт: `ac0f1e5` (drum AIR) влит в trunk merge queue 2026-07-04 — AIR-1 разблокирована.
2. **Гейт:** `npm test` + `npm run lint` зелёные ДО и ПОСЛЕ. Тесты не править. CSS-only (исключение — AIR-0.5, там inline-стили в body-stats.js).
3. **SW-ритуал:** после каждой фазы `npm run build:sw` + бамп `CACHE_NAME` в sw.js. Номер брать следующий свободный — после AIR-1 = v91, следующий v92.
4. **Verify (обязательный блок):**
   - preview порт 3001 (конфиг athlete-pro), mobile 375, dark;
   - `preview_inspect` затронутых селекторов: `background-color` = `rgb(12, 12, 18)` (`--c-bg-2`), `backdrop-filter` = `none`;
   - Tier-2 (modal-sheet, toast, dynamic-island, nav, ar-crop-modal) — blur СОХРАНЁН, проверить явно;
   - `preview_console_logs` без ошибок; скрины before/after в коммит-сообщение или комментарий;
   - полевой чек Gio на OLED в темноте на минимальной яркости — 1 на фазу; фаза не закрыта без него.
5. **Мёрж:** FF-only в trunk сразу после зелёного гейта + полевого чека. При мёрже в main — бамп VERSION (`js/version.js` + `package.json`).
6. **Хендофф:** после фазы отметить карточку здесь (DONE + sha), НЕ генерить новые планы/чеклисты.

## Рецепт AIR (Tier 1) — применять дословно

```css
background: var(--c-bg-2);
border: 1px solid var(--c-border);   /* hairline вместо плашки */
/* УДАЛИТЬ: backdrop-filter и -webkit-backdrop-filter */
/* УДАЛИТЬ/смягчить тяжёлые box-shadow (на near-black невидимы) */
/* border-radius НЕ трогать */
```

Active-состояния контролов: вместо белых градиентов — плоский `--c-chrome-t` + hairline `--c-border-h`. Цветной текст/glow active-кнопки (PPL) оставить.

## НЕ ТРОГАТЬ НИКОГДА (Tier 2 — glass остаётся)

- `css/base.css:353` (.modal-overlay), `:368` (.modal-sheet/.claude-sheet ~:771), `:563` (toast)
- `css/dynamic-island.css:40`
- `css/athlete-room.css:792` (.ar-crop-modal — это модалка, НЕ карточка; в старом плане ошибочно была в scope)
- nav
- Токены палитры в `:root`. Новые токены НЕ добавлять.
- Логику/DB/JS (кроме inline-стилей в AIR-0.5).

---

## Карточки

### AIR-0.5 — Token Heal: фантомный `--c-surface-deep` — ✅ `2d737dd` (wizardly-chatelet, SW v89)

- **ЦЕЛЬ:** токен `--c-surface-deep` нигде не определён → фон падает в transparent (живой баг). Заменить все использования на `var(--c-bg-2)`: `css/workout.css:149`, `css/analytics.css:85`, `css/base.css:436`, `css/body-stats.css:18` + inline-стили в `js/body-stats.js` (6 мест: строки ~108, 154, 161, 170, 175). Определение токена НЕ добавлять.
- **ГДЕ СТОП:** grep `--c-surface-deep` по репо = 0 вхождений (кроме .planning/ архива), гейт зелёный, SW-бамп, 1 коммит. Это баг-фикс, отдельный от визуала — дальше не идти.
- **НЕ ТРОГАТЬ:** blur-свойства, Tier 2, остальные карточки.

### AIR-1 — Workout + Dashboard — ✅ `674553d` (happy-tereshkova, SW v91; остаток: полевой OLED-чек Gio)

- Сделано: `.live-bar` + группа 11 карточек base.css → рецепт AIR; дубль `.stat-chip` (analytics) погашен ПЛЮС найденные при verify дубли `var(--c-surface)` поверх базы: `.cal-card`/`.chart-card` (analytics), `.profile-card` (profile), `.bs-stat-card` (body-stats), `.heatmap-card`/`.coach-card` (claude) → все на `var(--c-bg-2)`. PPL-тинты `.type-card[data-type]` сохранены (семантика). Verify: 12 классов bg=rgb(12,12,18)/blur none/shadow none; Tier 2 blur жив (island/modal-sheet/toast). Гейт 229/229, lint 0 err (warnings 39→38). Скрины не сняты — preview_screenshot висел, доказательство = inspect-значения в коммите.
- **ЦЕЛЬ (была):** применить рецепт AIR к: `.live-bar` (`css/workout.css:121` — снять `--c-surface`-плашку и тень) и группе карточек `css/base.css:746-769` (11 классов: exercise-card, type-card, stat-chip, profile-card, plan-row, cal-card, heatmap-card, coach-card, chart-card, checklist-card, bs-stat-card). ПЛЮС сразу погасить дубль `.stat-chip` в `css/analytics.css:122-130` (локальный blur перекроет base и фаза будет выглядеть провальной) — это перенос из фазы 2, делать здесь.
- **НЕ ТРОГАТЬ:** `base.css:697-741` (контролы), Tier 2, `.modal-sheet` блок (теперь `:762-768`).

### AIR-2 — Controls + Analytics — [ ]

- **ЦЕЛЬ:** сегмент-группа `css/base.css:697-709` (week-segment, bs-sex-segment, stats-subnav, bs-tab-bar, plan-tabs) → рецепт AIR. Active-состояния `:710-741`: белые градиенты и тройные тени → плоский `--c-chrome-t` + hairline; PPL-подсветку текста week-seg (green/purple text-shadow) оставить. Попутно уходят hardcoded rgba этого блока. Остаток blur в `css/analytics.css` (если что-то осталось после AIR-1) — снять.
- **ГДЕ СТОП:** verify-блок, полевой чек, 1 коммит + SW-бамп.
- **НЕ ТРОГАТЬ:** Tier 2, summary/intel/athlete-room (это AIR-3).

### AIR-3 — Остальные экраны — [ ]

- **ЦЕЛЬ:** `css/summary.css:98-107` (.summ-island) → рецепт AIR (цветной border-top по PPL оставить). `css/intel.css:74-85` (.intel-cmd-bar) — СНАЧАЛА классифицировать на живом экране: если бар плавает/sticky над скроллом — это Tier 2, blur остаётся, в карточке отметить «Tier 2, skip»; если лежит в потоке — рецепт AIR. body-stats blur-поверхности, если есть — рецепт AIR.
- **ГДЕ СТОП:** verify-блок, полевой чек, 1 коммит + SW-бамп.
- **НЕ ТРОГАТЬ:** `css/athlete-room.css:792` (.ar-crop-modal — Tier 2, исключена из scope), Tier 2.

### AIR-4 — Sweep + защита + финал — [ ]

- **ЦЕЛЬ:**
  1. grep `backdrop-filter` и полупрозрачных `rgba(255,255,255,0.0x)` фонов по css/ — добить остатки Tier 1 рецептом;
  2. тест-гард: unit-тест, который грепает css/ и падает, если `backdrop-filter` появился вне whitelist (base.css modal/toast-строки, dynamic-island.css, athlete-room.css .ar-crop-modal, nav) — регрессию ловит гейт, не глаза;
  3. DESIGN.md синхронизировать с реальностью: убрать Champagne Gold/Vantablack/#131313/Plus Jakarta Sans, вписать OBSIDIAN-палитру, 3 яруса Tier 0/1/2, рецепт AIR (сейчас спека описывает другое приложение — мина для мультиагентки);
  4. финальный OLED-чек всех экранов.
- **ГДЕ СТОП:** гейт зелёный (вкл. новый гард), 1 коммит + SW-бамп; при мёрже в main — бамп VERSION 1.19.x → 1.20.0 (визуальный релиз).
- **НЕ ТРОГАТЬ:** токены `:root`, Tier 2, логику.
