# NEXT SESSION — Athlete Pro

> Читать первым. **Роутер, а не состояние:** указатель на карточку, контекст — в хендоффе.
> Обновлено 2026-08-26 (LAUNCH-2 — один трек вместо семнадцати линий).

## Куда идти за работой

**Работа только одна — `docs/handoff/HANDOFF_launch_track.md`.** Трек запуска: довести
приложение до состояния, в котором ссылку можно дать чужому человеку. Карточки отсортированы
по убыванию риска, порядок не переставлять без разбора.

- **LAUNCH-3B** — следующая (ссылки на документы из экрана приватности, по `getLang()`)
- **LAUNCH-5B** — русский за пределами дома; дальше LAUNCH-4 (счётчик, PR #243), 6..10
- Закрыты: LAUNCH-1/2, **3A**, **5A**, AGENT-1/2/3, **FLOW-5**. Нарядов в работе нет
- Разбор мультиагента 27.08 → **AGENT-5** (генерируемое вне наряда), **AGENT-6** (счётчик
  сломан на дефолте, блокирует AGENT-4), **AGENT-7**, **AGENT-8**, **HYG-5** — в треке

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
