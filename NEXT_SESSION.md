# NEXT SESSION — Athlete Pro

> Читать первым. **Роутер, а не состояние:** указатель на карточку, контекст — в хендоффе.
> Обновлено 2026-08-30 (F-10 влита; motion #290). Карточек новой сессии нет. Осталось поле: Gio

## Куда идти за работой

**Главная работа — `docs/handoff/HANDOFF_launch_track.md`.** Трек запуска: довести
приложение до состояния, в котором ссылку можно дать чужому человеку. Карточки отсортированы
по убыванию риска, порядок не переставлять без разбора.

- **Сейчас — только поле, и только Gio.** Кодовых блокеров нет: живой iPhone (`LAUNCH-7`), полевой п. 1 на чистом телефоне, чек PC-2 (Stats/Профиль, тёмная+светлая, Cloud без перезагрузки)
- **Gio gate:** `docs/LAUNCH_CHECKLIST.md` § «Блокеры до…». **LAUNCH-10** закрывается этими тремя. #243 не вливать
- Свободно агенту: **LAUNCH-9** пункты 6–7 — F-11 (доступность), затем F-7/F-8
- Свободны также: **AGENT-7/8**, **HYG-5** (83 невлитых ветки в WARN). **AGENT-4** ждёт окно до 08.09 (`unsigned` = 6)
- Закрыты: LAUNCH-1/2, **3A**, **3B**, **4**, **5A**, **5B**, **6**, **7**, **8**, **9 pts 3–5 (F-10)**, **PC-1**, **PC-2** (линия PANDA Core в архиве), AGENT-1/2/3/5/6, **FLOW-5**

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
