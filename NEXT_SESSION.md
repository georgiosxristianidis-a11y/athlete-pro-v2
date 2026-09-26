# NEXT SESSION — Athlete Pro

> Читать первым. **Роутер, а не состояние:** указатель на карточку, контекст — в хендоффе.
> Обновлено 2026-09-25 (`PERF-1..3` влиты PR#457; `CORE-8` закрыта, 1.27.138).
> Осталось поле: Gio

## Куда идти за работой

**Главная работа — `docs/handoff/HANDOFF_launch_track.md`.** Трек запуска: довести
приложение до состояния, в котором ссылку можно дать чужому человеку. Карточки отсортированы
по убыванию риска, порядок не переставлять без разбора.

- **`PROT-2`:** репо PRIVATE (Gio). Мёрж руками после зелёных, без `--auto`
- **№1 `LAUNCH-10`, поле Gio.** Кодовых блокеров нет — `CORE-S` закрыта целиком (25.09, 1.27.137).
  Держат квота Gemini и п. 1 на Android (KV закрыт 25.09)
- **№2 `CORE-7..10`** (`docs/handoff/HANDOFF_core.md`), `CORE-6`/`CORE-8` закрыты 25.09 — следующая
  `CORE-9` (`CORE-7` закрыта 26.09, TTFT −32 %). `CORE-10` вне порядка
- **№3 перф** (`docs/handoff/HANDOFF_perf_lhci.md`): прод 94, следующая `PERF-9` (стоп на мокап Gio)
- **Приоритет — стабильность, не косметика.** Маскот (PANDA-*/SKIN-1), TTS-голос, HUD ждут: сперва то, что не падает и не дёргается
- **Поле — Android** (Gio 20.09). iPhone отложен: хвост `LAUNCH-7` и `VOICE-2` не блокеры. **webkit в Playwright не снимать** — единственный сигнал по Safari
- После LAUNCH-10: `USAGE-4` (телеметрия)
- Свободно агенту: `MO-2b` 2/5 (остаток до поля) · архитектурный трек · `E2E-1` · `A18`
- **Архитектурный трек:** порядок — хендофф Cursor. Фазы 0-2 закрыты; фаза 3: `A15` partial → следующая поверхность (privacy · workout · ai-settings), по одной за PR
- **MOTION:** поле MO-2+MO-2b — один заход в Stats. Вторая волна `FRAME-1`→`PLATE-1`→`RANK-1`→`HOLD-SAVE`→`RPE-HEAT` — после MO-2b, `HANDOFF_motion_pro.md`
- Закрытое перечислено в шапке хендоффа трека — здесь третья копия статуса протухнет первой
- **Полевой хвост от HYG-6:** удаление данных, недельный отчёт без сети, шторка подтверждения, +15 с на острове, Quick Start после выбора пола — пять путей, где тесты кроют исходник, а не палец

- **Невлитые ветки** — счёт `npm run inventory`; вердикты **HYG-7** за Gio. `claude/changelog-deps-batch` влита **по содержимому** — мёрж откатит роутер. `claude/exercise-history-main-e57957` разобрана 20.09: в расход, ценность живёт в `PERIM-1`

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
- **Тесты:** `npm test`; `npx playwright test` — на тёплом сервере.
- **SW:** только `npm run build:sw` (`test/sw-cache-name.test.js`).
- **lhci** — только из worktree.
- **Прод:** Vercel `gio-g7/athlete-pro-v7`, репо athlete-pro-v2, с `main`.
- **Git worktree:** `GIT_PAGER=cat` и `</dev/null`.
- **Корневой чекаут делится с живой сессией** — ветка меняется под руками; работать из своего worktree.
