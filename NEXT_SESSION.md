# NEXT SESSION — Athlete Pro

> Читать первым. **Роутер, а не состояние:** указатель на карточку, контекст — в хендоффе.
> Обновлено 2026-10-14 (1.27.183): очередь по приоритету.
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

**Агенту, по порядку (карточка = PR = бамп версии; параллелить нельзя):**

1. **`FIELD-7`** — вес в паузе острова (вариант A). `HANDOFF_field_ux.md`; затем **`HOME-3`** (материя Главной за флагом, «12 с», Gio 14.10), `FIELD-3`, `FIELD-6`
2. **`PLAN-1`**, `ANL-ALT`, `SWAP-1`, `PLATE-*` (`HANDOFF_working_sets.md`; WSET-2 влита 1.27.182)
3. Фон, по одной за PR: архитектурный трек (`A15`, следующая поверхность — хендофф Cursor)
4. Хвост HOME-1: `insights.engine._computeStreak` тоже в днях; свести `weekKey` (badge-ladders) и `computeWeekStreak` в shared
5. **`GEAR-1`** — решена (A, 1.5 с), косметика; вторая волна MOTION — `HANDOFF_motion_pro.md`

**После `LAUNCH-10`:** `USAGE-4`, `BOOT-2`/`BOOT-3`, `PERF-9` (стоп на мокап Gio), `PROG-0`.

- **Поле — Android**, iPhone отложен. **webkit в Playwright не снимать** — единственный сигнал по Safari
- **Невлитые ветки** — `npm run inventory`; вердикты **HYG-7** за Gio. `claude/changelog-deps-batch` влита по содержимому — мёрж откатит роутер

Остальные семнадцать линий **заморожены в `docs/_archive/`** — это пауза, не отмена.
Карточки живы, вернуться к ним можно после LAUNCH-10. Брать оттуда работу — только явным
решением Gio, не «по дороге».

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
- Мёрж: `gh pr merge --rebase --delete-branch`.

## Технические заметки

- **Запуск:** `npm run dev` → :3000 (Gio), 3001 = preview; телеметрия — `scripts/telemetry-server.mjs --lan`.
- **Тесты:** `npm test`; `npx playwright test` поднимает свой :3000 (занят — громкий отказ), против тёплого — `E2E_BASE=http://localhost:3000`.
- **SW:** только `npm run build:sw` (`test/sw-cache-name.test.js`).
- **lhci** — только из worktree.
- **Прод:** Vercel `gio-g7/athlete-pro-v7`, репо athlete-pro-v2, с `main`.
- **Git worktree:** `GIT_PAGER=cat` и `</dev/null`.
- **Корневой чекаут делится с живой сессией** — ветка меняется под руками; работать из своего worktree.
