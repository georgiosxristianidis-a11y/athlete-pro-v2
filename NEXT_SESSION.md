# NEXT SESSION — Athlete Pro

> Читать первым. **Роутер, а не состояние:** указатель на карточку, контекст — в хендоффе.
> Обновлено 2026-09-17 (A9 закрыта: сеть и IDB Intel в сторе). Осталось поле: Gio

## Куда идти за работой

**Главная работа — `docs/handoff/HANDOFF_launch_track.md`.** Трек запуска: довести
приложение до состояния, в котором ссылку можно дать чужому человеку. Карточки отсортированы
по убыванию риска, порядок не переставлять без разбора.

- **Сейчас — только поле, и только Gio.** Кодовых блокеров нет: живой iPhone (`LAUNCH-7`), полевой п. 1 на чистом телефоне, чек PC-2 (Stats/Профиль, тёмная+светлая, Cloud без перезагрузки)
- **Gio gate:** `docs/LAUNCH_CHECKLIST.md` § «Блокеры до…». **LAUNCH-10** закрывается этими тремя
- Свободно агенту: **LAUNCH-10** (сверка чеклиста; п. 7 — `npm run smoke:prod`), **HYG-7**
- **AGENT-9 ждёт токен Gio** (read-only origin для ночи); процедура и остаток — в хендоффе, § «Процедура ночи»
- **Префикс ветки — гард с 15.09 (AGENT-8):** имя сверяется с трейлером в pre-push и CI. Ветка без `cursor/`/`claude/` — блок; пять живых переименовать (**HYG-7**)
- **Архитектурный трек:** фазы 0-4 — хендофф Cursor § «Порядок работ». Фазы 0-2 закрыты. Фаза 3: `A1`+`A8`+`A15`(partial)+`A2`+`A5`+`A9` закрыты → следующая `A13` (профиль, три слоя)
- **Не брать до закрытия трека: MOTION-FIX** — разбор моторики 1.27.82 (пилюля, reflow на Train, гард на `transition`). Хендофф, § «После LAUNCH-10»
- Закрыты: LAUNCH-1/2, **3A**, **3B**, **4**, **5A**, **5B**, **6**, **7**, **8**, **9 pts 3–7 (F-10, F-11, F-7/F-8)**, **PC-1**, **PC-2**, AGENT-1/2/3/**4**/5/6/**7**/**8**, **FLOW-5**, **BOOT-TRIM**, **VOICE-2**, **HYG-6**, **EX-RU-1**, **AI-1**, **HYG-5**
- **VOICE-2 ждёт поля:** волна озвучки на живом iPhone — ходит ли по голосу и не пропадает ли звук (хендофф, § «Линия VOICE»)
- **Полевой хвост от HYG-6:** удаление данных, недельный отчёт без сети, шторка подтверждения, +15 с на острове, Quick Start после выбора пола — пять путей, где тесты кроют исходник, а не палец

- **Невлитые ветки разобраны 13.09** (36 → 20): пять карточек SALV — `docs/_archive/HANDOFF_branch_salvage.md`

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
