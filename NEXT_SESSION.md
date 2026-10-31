# NEXT SESSION — Athlete Pro

> Читать первым. **Роутер, а не состояние:** указатель на карточку, контекст — в хендоффе.
> Обновлено 2026-10-31 (1.27.199): очередь по приоритету.
> Осталось поле: Gio

## Куда идти за работой

**Трек запуска — `docs/handoff/HANDOFF_launch_track.md`.** Приоритет — стабильность, не косметика: сперва
числа и сбои, потом вид. Маскот (PANDA-*/SKIN-1), TTS, HUD ждут.

**За Gio (решения и поле), блокируют запуск:**

1. **`HOME-2`** — флаг `home-feed-a` в Лаборатории: поле Главной (Сегодня + неделя + CTA)
2. **`LAUNCH-10` п.1 на Android** и `SERVER_KEY_MONTHLY_CAP_USD=1` на Vercel prod (BUDGET-1, Gio 12.10) — выставлен ли?
3. **Поле флагов** (Профиль → Лаборатория): `sw-cache-first`, затем `boot-cascade`; `working-sets` на живых данных (жим, гантели)
4. **`CORE-9`:** живой прогон `scripts/coach-eval.mjs` (`HANDOFF_core.md`)
5. **`HOME-1`** — флаг `streak-weeks` тумблером в Лаборатории: поле на живых данных
6. **`WSET-2b`** — значки вариант E (флаг `badge-ladders` уже ON): поле на живых данных
7. **`FIELD-7`** — флаг `rest-next-set` (Лаборатория): вес × повторы в паузе острова, поле в зале
8. **`HOME-3`** — флаг `home-matter` в Лаборатории (нужна `home-feed-a`): поле Главной, материя 12 с
9. **`FIELD-6`** — флаг `gym-equipment` (Лаборатория): чек-лист снарядов, поле в зале

**Агенту, по порядку (карточка = PR = бамп версии; параллелить нельзя):**

0. **P0 «доверие»** (`HANDOFF_launch_track.md` § P0): `P0-AI-CONSENT` (развилка Gio), затем `P0-AIRGAP-NET`
1. **`ANL-ALT`**, `SWAP-1`, `PLATE-*` (`HANDOFF_working_sets.md`; WSET-2 влита 1.27.182)
2. Фон, по одной за PR: A10 (хендофф Cursor); A14-хвост закрыт 01.11 (HUD на восстановленной сессии живой)
3. Хвост HOME-1: `insights.engine._computeStreak` в днях — решение Gio
4. **`GEAR-1`** — решена (A, 1.5 с); **`HOME-4`** (всплеск искр на подходе и PR, флаг `burst-events`) и волна MOTION — косметика, `HANDOFF_motion_pro.md`

**После `LAUNCH-10`:** `USAGE-4`, `BOOT-2`/`BOOT-3`, `PERF-9` (стоп на мокап Gio), `PROG-0`.

- **Поле — Android**, iPhone отложен. **webkit в Playwright не снимать** — единственный сигнал по Safari
- **Невлитые ветки** — `npm run inventory`; вердикты **HYG-7** за Gio. `claude/changelog-deps-batch` влита по содержимому — мёрж откатит роутер

Остальные семнадцать линий **заморожены в `docs/_archive/`** — это пауза, не отмена.
Карточки живы; брать оттуда работу — после LAUNCH-10 и только явным решением Gio.

## Правило файла

**Числа и SHA здесь не хранятся** — протухают от мёржа. Добывать:

```bash
git fetch origin && git rev-parse --short origin/main
npm run preflight && npm run inventory && npm run smoke:prod && npm run docs:budget
```

Версия — `js/version.js`. Done — `CHANGELOG.md`. Правила — `CLAUDE.md`, дизайн — `.claude/rules/design.md`.
Архитектура % / долг — `docs/ARCHITECTURE_SCORECARD.md`. Карточки Cursor — `docs/handoff/HANDOFF_cursor_arch_cards.md`.
**Строка роутера ≤200 символов** — иначе в хендофф.

## Барьеры репозитория

- **PROT-1:** чеки `test`+`e2e`+`drift` (strict), PR, linear history, `enforce_admins`; локально `.githooks/pre-push` (`MAIN_PUSH_OK=1`). Состояние — preflight (`scripts/main-protection.mjs`); сторож — `main-watchdog.yml`.
- **Галочка ≠ чеки:** Vercel `combined status` врёт при нуле check-runs → `gh api repos/:owner/:repo/commits/<sha>/check-runs`.
- Мёрж — по `CLAUDE.md`.

## Технические заметки

- **Запуск:** `npm run dev` → :3000 (Gio), 3001 = preview; телеметрия — `scripts/telemetry-server.mjs --lan`.
- **Тесты:** `npm test`; `npx playwright test` поднимает свой :3000 (занят — громкий отказ), против тёплого — `E2E_BASE=http://localhost:3000`.
- **SW:** только `npm run build:sw` (`test/sw-cache-name.test.js`).
- **lhci** — только из worktree.
- **Прод:** Vercel `gio-g7/athlete-pro-v7`, репо athlete-pro-v2, с `main`.
- **Git worktree:** `GIT_PAGER=cat` и `</dev/null`.
- **Корневой чекаут делится с живой сессией** — ветка меняется под руками; работать из своего worktree.
