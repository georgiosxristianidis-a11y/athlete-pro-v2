# NEXT SESSION — Athlete Pro

> Читать первым. **Роутер, а не состояние:** здесь указатель на карточку, контекст — в самом хендоффе.
> Обновлено 2026-08-19 (TOK-8: гейт доков откалиброван по /context).

## Правило файла

**Числа и SHA здесь не хранятся** — они протухают от собственного мёржа. Добывать командой:

```bash
git fetch origin && git rev-parse --short origin/main   # где main
npm run preflight      # старт сессии
npm run inventory      # ревизия веток
npm run smoke:prod     # доехал ли релиз до прода
npm run docs:budget    # цена системных доков в токенах
```

Версия — `js/version.js`. Done — `CHANGELOG.md`. Правила — `CLAUDE.md`, дизайн — `.claude/rules/design.md`;
здесь они не дублируются: две копии = одна протухшая. **Строка роутера ≤200 символов** — разрослась
в пересказ, значит её место в хендоффе.

## Барьеры репозитория

- **Branch-protection не включена, хотя доступна:** репо публичный с 2026-06-20, защита бесплатна — прежняя запись «приватный, free-план» неверна, решение 2026-08-06 переоткрыть (карточка **PROT-1**). Держит `.githooks/pre-push`: блокирует пуш в `refs/heads/main`, обход `MAIN_PUSH_OK=1`. Пуш из одних удалений выходит нулём до всех гардов — кода в нём нет.
- **preflight знает три состояния защиты** (`scripts/main-protection.mjs`): нет защиты или чека — FAIL, снятый `enforce_admins` — WARN, всё на месте — OK. Сторож мёржа мимо ворот — `main-watchdog.yml`.
- **Зелёная галочка ≠ чеки прошли:** `combined status` бывает `success` от одного Vercel при нуле check-runs. Считать: `gh api repos/:owner/:repo/commits/<sha>/check-runs`.
- `delete_branch_on_merge` включён — мёржить `gh pr merge --rebase --delete-branch`.

## Куда идти за работой (в `docs/handoff/`)

- `HANDOFF_boot_brand.md` → **SPLASH-1**, дальше MOTION-1; не параллелить, трогает `index.html`
- `HANDOFF_panda_core.md` — активных карточек нет, готова к полевому чеку Gio
- `HANDOFF_intel_readiness.md` → **INTEL-1**; порядок 1→3→4 фиксирован
- `HANDOFF_gemini_audit_triage.md` → **SCAF-1**, следом NOISE-1/PII-1; PERF-1/2/3 закрыты, бандл не берём; за Gio — снести Render, отозвать `ANTHROPIC_API_KEY`
- `HANDOFF_light_theme.md` → **THEME-6** (P2)
- `HANDOFF_design_system.md` → **SPACE-1 хвост → SCALE-1**, дальше NAV-BACK-1 + DEAD-1; линия DS (течёт `js/`, не CSS) → **DS-2**, следом DS-3
- `HANDOFF_field_check.md` — за Gio, один заход (DoD-5), флаги `fab-video`/`drum-window` заранее
- `HANDOFF_next_cards.md` → **DRUM-TOUCH-1** — за Gio, один тап; там же стек карточек, бэклог, DATA-SAFETY
- `HANDOFF_gym_grade.md` — DoD из 5 пунктов
- `HANDOFF_isl_tail.md` — островные хвосты
- `HANDOFF_orchestration.md` — роли LEAD/worker/verifier, DoD-лестница
- `HANDOFF_air_refactor.md` — хвост
- `HANDOFF_token_economy.md` → **TOK-1** (TOK-8 закрыта), дальше TOK-6, TOK-2, TOK-4; TOK-11 (сжатие закрытых карточек) — перед TOK-5; TOK-9/TOK-10 отдельно

Вне хендоффов, заведено 2026-08-14: **DOCS-3** (перевод горячего пути на английский, ждёт пересборки `docs/RULES.md`), **WEED-2** (прополка веток/ворктри, порог 30 дн, смежна с TOK-7), **FLOW-4** (TTL памяти ≤7500 ток, смежна с TOK-5).

## Порядок взятия

- **Дизайн:** NAV-BACK-1 + DEAD-1 не параллелить со SPACE-1/SCALE-1 — общий `css/base.css`.
- **Аналитика:** **AN-2** → AN-3 → OVW-1. После стека — роадмап CRDT foundation.
- **Вне очереди:** NAV-1 (потеря тапа в быстрой серии), NAV-2 (`s-intel` мимо конвенции выхода).

## Технические заметки

- **Запуск:** `npm run dev` → :3000 (3000 = Gio, 3001 = Claude preview). Телеметрия — `scripts/telemetry-server.mjs --lan`.
- **Тесты:** `npm test` = unit+integration; `npx playwright test` — отдельно, на тёплом сервере.
- **SW:** `ASSETS`/`CACHE_NAME` только через `npm run build:sw` — краснеет `test/sw-cache-name.test.js`, если забыть.
- **lhci гонять ТОЛЬКО из worktree** — корневой чекаут даёт фейковые цифры.
- **Прод:** Vercel `gio-g7/athlete-pro-v7`, git-репо athlete-pro-v2, деплой с `main`.
- **Git в worktree:** висящая команда держит pager — `GIT_PAGER=cat` и `</dev/null`.
