# NEXT SESSION — Athlete Pro

> Читать первым. **Роутер, а не состояние:** указатель на карточку, контекст — в хендоффе.
> Обновлено 2026-08-25 (линия DEBUG — intake/протокол).

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

## Куда идти за работой (в `docs/handoff/`)

- `HANDOFF_launch_track.md` → **LAUNCH-2**, дальше LAUNCH-3..10; LAUNCH-1 закрыта (находки + LAUNCH-9); AGENT-3/4 открыты
- `HANDOFF_boot_brand.md` → **SPLASH-1**, дальше MOTION-1; не параллелить (`index.html`)
- `HANDOFF_intel_readiness.md` → **INTEL-3** → INTEL-4
- `HANDOFF_gemini_audit_triage.md` → **SCAF-1**, NOISE-1/PII-1; за Gio — снести Render, отозвать `ANTHROPIC_API_KEY`
- `HANDOFF_light_theme.md` → **THEME-6** (P2)
- `HANDOFF_design_system.md` → **SCALE-1**, NAV-BACK-1 + DEAD-1; DS → **DS-2** → DS-3
- `HANDOFF_field_check.md` — Gio, DoD-5; флаги `fab-video`/`drum-window` заранее
- `HANDOFF_next_cards.md` → **DRUM-TOUCH-1** (поле); стек/бэклог/DATA-SAFETY
- `HANDOFF_orchestration.md` · `HANDOFF_gym_grade.md` — роли + DoD-5
- `HANDOFF_isl_tail.md` · `HANDOFF_air_refactor.md` — остров / AIR
- `HANDOFF_usage_stats.md` → **USAGE-1**, затем USAGE-2
- `HANDOFF_token_economy.md` → **TOK-1** → TOK-6/2/4; TOK-11 перед TOK-5
- `HANDOFF_seo_meta.md` → **SEO-2** (og:image); после PRECACHE-1 — в `ASSETS_WARM`
- `HANDOFF_toolchain.md` → **TOOL-1**…TOOL-5; правит `~/.claude/*`
- `HANDOFF_debug_protocol.md` → **INTAKE-1**, DBG-0…4; WIP **TOOL-PW-1**
- `HANDOFF_panda_core.md` → **SKIN-1** (за Gio), HUD-4 (LEAD)

Вне хендоффов: **DOCS-3**, **WEED-2** (≥30 дн); FLOW-4 закрыта — потолок памяти сторожит preflight.

## Порядок взятия

- **Дизайн:** NAV-BACK-1 + DEAD-1 не параллелить со SPACE-1/SCALE-1 (`css/base.css`).
- **Аналитика:** **AN-2** → AN-3 → OVW-1 → CRDT foundation.
- **Вне очереди:** NAV-1 (потеря тапа), NAV-2 (`s-intel` выход).

## Технические заметки

- **Запуск:** `npm run dev` → :3000 (Gio), 3001 = preview; телеметрия — `scripts/telemetry-server.mjs --lan`.
- **Тесты:** `npm test`; `npx playwright test` — на тёплом сервере.
- **SW:** только `npm run build:sw` (`test/sw-cache-name.test.js`).
- **lhci** — только из worktree.
- **Прод:** Vercel `gio-g7/athlete-pro-v7`, репо athlete-pro-v2, с `main`.
- **Git worktree:** `GIT_PAGER=cat` и `</dev/null`.
