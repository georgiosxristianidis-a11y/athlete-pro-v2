# NEXT SESSION — Athlete Pro

> Читать первым. **Роутер, а не состояние:** указатель на карточку, контекст — в хендоффе.
> Обновлено 2026-11-15: SWAP-1b влита, пачка P0 закрыта.
> Осталось поле: Gio

## Куда идти за работой

**Трек запуска — `docs/handoff/HANDOFF_launch_track.md`.** Приоритет — стабильность, не косметика: сперва
числа и сбои, потом вид. Маскот (PANDA-*/SKIN-1), TTS, HUD ждут.

**За Gio (решения и поле), блокируют запуск.** Тумблеры — Профиль → Лаборатория; новые флаги OFF (`dedupe-content` ON с LAB-2):

1. HOME-2 — `home-feed-a`: поле Главной
2. `LAUNCH-10` п.1 на Android и `SERVER_KEY_MONTHLY_CAP_USD=1` на Vercel prod (BUDGET-1, Gio 12.10) — выставлен ли?
3. **Поле флагов:** `sw-cache-first`, затем `boot-cascade`; `working-sets` на живых данных
4. **CORE-9:** живой прогон `scripts/coach-eval.mjs` (`HANDOFF_core.md`)
5. HOME-1 — `streak-weeks`: поле на живых данных
6. WSET-2b — значки E (`badge-ladders` уже ON): поле на живых данных
7. FIELD-7 — `rest-next-set`: вес × повторы в паузе, зал
8. HOME-3 — `home-matter` (нужна `home-feed-a`): материя 12 с
9. FIELD-6 — `gym-equipment`: чек-лист снарядов, зал
10. REST-COUNT — `rest-island-count`: отсчёт паузы в острове, зал
11. DATA-1 — `exercise-registry`: гантели не жим штанги
12. DATA-2 — `history-records`: «Мой максимум», стаж, сверка на экспорте
13. DATA-3 — `stats-families`: жим ногами и штанга на Stats
14. PLATE-2 — `plate-toy`: тап по грифу, отскок 7 px, вибро 8 мс
15. Развилки и мокапы, флаг `muscles-ui` — `HANDOFF_data_logic.md` § Развилки Gio
16. SWAP-1b — `swap-quick` (влита 1.27.228): полоса замены на карточке, зал, узкий экран
17. ANL-A1/A2 — календарь Stats на телефоне: тап по дню, «Вернуть», скролл на месте

**Агенту, по порядку (карточка = PR = бамп версии; параллелить нельзя):**

0. UX — `HANDOFF_ux_irritants.md` § Порядок (UX-2b → 2c → 2e…), затем UX-1c…l
1. `ANL-ALT` — закрыть после поля п.13 (поглощена DATA-3)
2. Фон, по одной за PR: A10 и `AUD-*` (хендофф Cursor, § Аудит 09.11); **`SUPA-1`**: keep-alive зелёный 08–14.11 (14 прогонов) — закрыть карточку
3. Хвост HOME-1: `insights.engine._computeStreak` в днях — решение Gio
4. **`GEAR-1`** к коду; **`HOME-4` (флаг `burst-events`) и волна MOTION — косметика, `HANDOFF_motion_pro.md`

5. Аудиты (`docs/handoff/`): `ANL-A3…A11` — `HANDOFF_analytics_audit`; `UX-1c…l` — `HANDOFF_ux_mechanics_audit`; `UX-2b…p` — `HANDOFF_ux_irritants`

**После `LAUNCH-10`:** `USAGE-4`, `BOOT-2`/`BOOT-3`, `PERF-9` (стоп на мокап Gio), `PROG-0`.

- **Поле — Android**, iPhone отложен. **webkit в Playwright не снимать** — единственный сигнал по Safari
- **Невлитые ветки** — `npm run inventory`; вердикты **HYG-7** за Gio

Остальные семнадцать линий **заморожены в `docs/_archive/`** — пауза, не отмена; брать оттуда решением Gio после LAUNCH-10.

## Правило файла

**Числа и SHA здесь не хранятся** — протухают от мёржа. Добывать:

```bash
git fetch origin && git rev-parse --short origin/main
npm run preflight && npm run inventory && npm run smoke:prod && npm run docs:budget
```

Версия — `js/version.js`, done — `CHANGELOG.md`, дизайн — `.claude/rules/design.md`, долг — `docs/ARCHITECTURE_SCORECARD.md`.
**Строка роутера ≤200 символов** — иначе в хендофф.

## Барьеры репозитория

- **PROT-1:** чеки `test`+`e2e`+`drift` (strict), PR, linear history, `enforce_admins`; хук `pre-push`; состояние — preflight, сторож — `main-watchdog.yml`.
- **Галочка ≠ чеки:** Vercel `combined status` врёт при нуле check-runs → `gh api repos/:owner/:repo/commits/<sha>/check-runs`. Мёрж — по `CLAUDE.md`.

## Технические заметки

- **Запуск:** `npm run dev` → :3000 (Gio), 3001 = preview. **Тесты:** `npx playwright test` поднимает свой :3000 (занят — громкий отказ), против тёплого — `E2E_BASE`.
- **SW:** только `npm run build:sw`. **lhci** — только из worktree. **Git worktree:** `GIT_PAGER=cat` и `</dev/null`.
- **Корневой чекаут делится с живой сессией** — работать из своего worktree.
