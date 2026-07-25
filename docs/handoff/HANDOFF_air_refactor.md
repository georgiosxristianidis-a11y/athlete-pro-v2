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

## AIR-4 — Sweep + защита + финал — [ ]

- **ЦЕЛЬ:**
  1. grep `backdrop-filter` и полупрозрачных `rgba(255,255,255,0.0x)` фонов по css/ — добить остатки Tier 1 рецептом;
  2. тест-гард: unit-тест, который грепает css/ и падает, если `backdrop-filter` появился вне whitelist (base.css modal/toast-строки, dynamic-island.css, athlete-room.css .ar-crop-modal, nav) — регрессию ловит гейт, не глаза;
  3. DESIGN.md синхронизировать с реальностью: убрать Champagne Gold/Vantablack/#131313/Plus Jakarta Sans, вписать OBSIDIAN-палитру, 3 яруса Tier 0/1/2, рецепт AIR (сейчас спека описывает другое приложение — мина для мультиагентки);
  4. финальный OLED-чек всех экранов.
- **ГДЕ СТОП:** гейт зелёный (вкл. новый гард), 1 коммит + SW-бамп. Закрывает пункт DoD-2 (вместе с AIR-2b).
- **НЕ ТРОГАТЬ:** токены `:root`, Tier 2, логику.
