# HANDOFF — AIR-рефакторинг поверхностей (OLED near-black + AIR)

> Программа: единая система высоты Tier 0/1/2. Blur остаётся ТОЛЬКО на плавающих слоях.
> Прополото 2026-07-17: фазы AIR-0.5 → AIR-3 закрыты и на проде — AIR-0.5 Token Heal (`2d737dd`) · AIR-1 Workout+Dashboard (`674553d`) · AIR-2 Controls (`6b5c515`, MERGE-QUEUE-3) · AIR-3 summary/intel (`c538300`, релиз 1.21.0). Детали — CHANGELOG/git.
> **Осталась одна карточка: AIR-4 (финал + защита).** Хвост AIR-2b (body-stats таб-каскад) — в `HANDOFF_next_cards.md`.

## Правила (для сессии AIR-4)

1. **База:** ветка от свежего trunk (`claude/csp-soft-delete`), сверить хеш с NEXT_SESSION.md.
2. **Гейт:** `npm test` + `npm run lint` зелёные ДО и ПОСЛЕ.
3. **SW-ритуал:** после фазы `npm run build:sw` + бамп `CACHE_NAME` (следующий свободный — сверить с NEXT_SESSION.md, сейчас v109).
4. **Verify:** preview 3001, mobile 375, dark; затронутые селекторы: `background-color` = `rgb(12, 12, 18)` (`--c-bg-2`), `backdrop-filter: none`; Tier-2 blur СОХРАНЁН (проверить явно); консоль чистая; полевой OLED-чек Gio в темноте на минимальной яркости — фаза не закрыта без него.
5. **Мёрж:** FF-only в trunk после гейта + полевого чека.

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

- `css/base.css` .modal-overlay / .modal-sheet / .claude-sheet / toast
- `css/dynamic-island.css`
- `css/athlete-room.css` .ar-crop-modal (это модалка, НЕ карточка)
- nav
- Токены палитры в `:root`. Новые токены НЕ добавлять.
- Логику/DB/JS.

---

## AIR-4 — Sweep + защита + финал — [x] код (1.25.8), ждёт полевой OLED-чек

- **ЦЕЛЬ:**
  1. grep `backdrop-filter` и полупрозрачных `rgba(255,255,255,0.0x)` фонов по css/ — добить остатки Tier 1 рецептом;
  2. тест-гард: unit-тест, который грепает css/ и падает, если `backdrop-filter` появился вне whitelist (base.css modal/toast-строки, dynamic-island.css, athlete-room.css .ar-crop-modal, nav) — регрессию ловит гейт, не глаза;
  3. DESIGN.md синхронизировать с реальностью: убрать Champagne Gold/Vantablack/#131313/Plus Jakarta Sans, вписать OBSIDIAN-палитру, 3 яруса Tier 0/1/2, рецепт AIR (сейчас спека описывает другое приложение — мина для мультиагентки);
  4. финальный OLED-чек всех экранов.
- **ГДЕ СТОП:** гейт зелёный (вкл. новый гард), 1 коммит + SW-бамп. Закрывает пункт DoD-2 (вместе с AIR-2b).
- **НЕ ТРОГАТЬ:** токены `:root`, Tier 2, логику.

**Сделано (2026-07-25, 1.25.8):**
1. Sweep: `backdrop-filter` в css/ уже был только на Tier 2 (modal-overlay/sheet/claude-sheet/toast · island · ar-crop-modal) — новых нарушений не найдено. Добито остальное: белый gloss-градиент `.privacy-seg-btn.active` → плоский `--c-chrome-t` + hairline `--c-border-h` (цветные режимы → плоские `--c-accent-bg`/`--c-secondary-bg`); удалён белый radial-sheen `.chart-card::before`; хардкод `rgba(255,255,255,0.02..0.05)` фонов → `var(--c-surface)`/`--c-surface-h` (privacy, summary, analytics), `border-bottom` `.summ-ex-row` → `var(--c-border)`. Stylelint-warnings 36 → 28.
2. Гард: `test/air-guard.test.js` (8 тестов) — парсит все css/, падает на `backdrop-filter`/`will-change: backdrop-filter` вне Tier-2 whitelist; зеркальная половина ловит ПОТЕРЮ blur на Tier 2. Негативно проверен канарейкой (инъекция blur в `workout.css` → 2 фейла).
3. DESIGN.md — закрыто раньше (файл заархивирован, живой спек = `CLAUDE.md` § Design).
4. Верифай preview 3001, 375, dark: `.chart-card` = `rgb(12,12,18)`, `bf: none`, sheen пуст; Tier 2 blur жив (overlay 8px / sheet 40px / toast 20px). Гейт: unit **340/340**, lint **0 err**, stylelint 0 err (28 warn).
- **Остаток:** полевой OLED-чек Gio в темноте (экраны Analytics / Профиль-privacy / сводка тренировки) — без него карточка не закрыта в DoD-2.
