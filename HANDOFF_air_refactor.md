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

## AIR-4 — Sweep + защита + финал — 🔶 код ✅ (2026-07-26, Sonnet), ждёт полевой OLED-чек

Ветка `air-4-sweep-guard` от свежего trunk (`f1cbf67`), коммиты `2977a49` (гард) + `a113cca` (SW-бамп) — **не смёржена**.

- **п.1 sweep:** прогнан grep `backdrop-filter` по всему css/ — остатков вне Tier 1 рецепта не найдено, дерево уже чистое (предыдущие AIR-фазы всё выкачали).
- **п.2 тест-гард:** `test/air-tier-guard.test.js` — режет CSS-комментарии, находит ближайший селектор блока, падает если `backdrop-filter` вне вайтлиста. Вайтлист сузился против описания карточки: `nav` в кодовой базе больше не существует (нет ни css/nav.css, ни .nav-селектора с blur) — актуальный список: base.css (`.modal-overlay`/`.modal-sheet`/`.claude-sheet`/`.toast`), dynamic-island.css (весь файл), athlete-room.css (`.ar-crop-modal`). Гард проверен инъекцией фейкового нарушения — ловит.
- **п.3 DESIGN.md:** решение Gio 2026-07-26 — **закрыто без кода**, DESIGN.md уже архивирован (PR#13, 2026-07-24), живой спек в `CLAUDE.md` § Design.
- **п.4 OLED-чек:** SW-бамп сделан (`build:sw` → digest `9d90174c`, версия v114 та же). Финальный полевой OLED-чек всех экранов — **за Gio**.
- **ГДЕ СТОП:** гейт зелёный (unit 309/309, lint 0 err) + гард + 1 коммит-пара + SW-бамп — сделано. Закрывает DoD-2 код-часть (вместе с AIR-2b); полный DoD-2 = после полевого OLED-чека.
- **НЕ ТРОГАТЬ:** токены `:root`, Tier 2, логику.
