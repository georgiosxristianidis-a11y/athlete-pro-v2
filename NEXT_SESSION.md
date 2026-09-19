# NEXT SESSION — Athlete Pro

> Читать первым. **Роутер, а не состояние:** указатель на карточку, контекст — в хендоффе.
> Обновлено 2026-09-19 (LAUNCH-10 пересверен, HYG-7 разобрана). Осталось поле: Gio

## Куда идти за работой

**Главная работа — `docs/handoff/HANDOFF_launch_track.md`.** Трек запуска: довести
приложение до состояния, в котором ссылку можно дать чужому человеку. Карточки отсортированы
по убыванию риска, порядок не переставлять без разбора.

- **Приоритет — стабильность и плавность хода.** Маскот (PANDA-*/SKIN-1), TTS-голос, HUD не отменены, а ждут: сперва то, что не падает и не дёргается
- **Сейчас — только поле, и только Gio.** Кодовых блокеров нет: живой iPhone (`LAUNCH-7`), п. 1 на чистом телефоне, чек PC-2 (Stats/Профиль, обе темы, Cloud без перезагрузки)
- **Gio gate:** эти три закрывают **LAUNCH-10** — `docs/LAUNCH_CHECKLIST.md` § «Блокеры до…»
- Свободно агенту: пусто — авточасть **LAUNCH-10** и **HYG-7** сданы 19.09
- **AGENT-9 ждёт токен Gio** (read-only origin для ночи); процедура и остаток — в хендоффе, § «Процедура ночи»
- **Префикс ветки — гард с 15.09 (AGENT-8):** имя сверяется с трейлером в pre-push и CI. Ветка без `cursor/`/`claude/` — блок; **HYG-7** разобрала пять, вердикты за Gio
- **Архитектурный трек:** порядок — хендофф Cursor. Фазы 0-2 закрыты; фаза 3: `A1`/`A2`/`A5`/`A8`/`A9`/`A13` закрыты, `A15` partial → следующая поверхность (claude · privacy · workout), по одной за PR
- **Не брать до закрытия трека: MOTION-FIX** — разбор моторики 1.27.82 (пилюля, reflow, гард на `transition`). Хендофф, § «После LAUNCH-10»
- **Следом MOTION-PRO** (заведена 17.09) — премиальная моторика, MO-1..MO-5: `docs/handoff/HANDOFF_motion_pro.md`. Зависит от MOTION-FIX
- Закрытое перечислено в шапке хендоффа трека — здесь третья копия статуса протухнет первой
- **VOICE-2 ждёт поля:** волна озвучки на живом iPhone — ходит ли по голосу и не пропадает ли звук (хендофф, § «Линия VOICE»)
- **Полевой хвост от HYG-6:** удаление данных, недельный отчёт без сети, шторка подтверждения, +15 с на острове, Quick Start после выбора пола — пять путей, где тесты кроют исходник, а не палец

- **Невлитые ветки** — счёт `npm run inventory`; шесть с вердиктом HYG-7 за Gio. Разбор 13.09 — `docs/_archive/HANDOFF_branch_salvage.md`

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
