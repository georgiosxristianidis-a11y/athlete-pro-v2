# NEXT SESSION — Athlete Pro

> Читать первым. **Роутер, а не состояние:** указатель на карточку, контекст — в хендоффе.
> Обновлено 2026-08-21 (заведена линия USAGE — счётчик установок за флагом).

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
здесь не дублируются: две копии = одна протухшая. **Строка роутера ≤200 символов** — разрослась в пересказ,
значит её место в хендоффе.

## Барьеры репозитория

- **Branch-protection с 2026-08-20** (PROT-1): `test`+`e2e`+`drift` (strict), PR обязателен, linear history, без force-push, `enforce_admins` — обхода нет ни у кого. Локально дублирует `.githooks/pre-push` (`MAIN_PUSH_OK=1`); пуш из одних удалений выходит нулём до гардов. Состояние защиты читает preflight (`scripts/main-protection.mjs`): нет защиты или чека — FAIL, снят `enforce_admins` — WARN. Сторож мёржа мимо ворот — `main-watchdog.yml`.
- **Зелёная галочка ≠ чеки прошли:** `combined status` бывает `success` от Vercel при нуле check-runs. Считать: `gh api repos/:owner/:repo/commits/<sha>/check-runs`.
- `delete_branch_on_merge` включён — мёржить `gh pr merge --rebase --delete-branch`.

## Куда идти за работой (в `docs/handoff/`)

- `HANDOFF_launch_track.md` → **LAUNCH-1**, дальше LAUNCH-2..10; AGENT-1/2 закрыты, открыты AGENT-3 и AGENT-4
- `HANDOFF_boot_brand.md` → **SPLASH-1**, дальше MOTION-1; не параллелить, трогает `index.html`
- `HANDOFF_intel_readiness.md` → **INTEL-3**, следом INTEL-4; порядок фиксирован
- `HANDOFF_gemini_audit_triage.md` → **SCAF-1**, следом NOISE-1/PII-1; бандл не берём; за Gio — снести Render, отозвать `ANTHROPIC_API_KEY`
- `HANDOFF_light_theme.md` → **THEME-6** (P2)
- `HANDOFF_design_system.md` → **SCALE-1** (радиусы там же), дальше NAV-BACK-1 + DEAD-1; линия DS → **DS-2**, следом DS-3
- `HANDOFF_field_check.md` — за Gio, один заход (DoD-5), флаги `fab-video`/`drum-window` заранее
- `HANDOFF_next_cards.md` → **DRUM-TOUCH-1** — за Gio, один тап; там же стек карточек, бэклог, DATA-SAFETY
- `HANDOFF_orchestration.md` — роли LEAD/worker/verifier, DoD-лестница; `HANDOFF_gym_grade.md` — DoD из 5 пунктов
- `HANDOFF_isl_tail.md` · `HANDOFF_air_refactor.md` — хвосты острова и AIR
- `HANDOFF_usage_stats.md` → **USAGE-1** (Web Analytics в Vercel, за Gio), затем USAGE-2 — флип флага
- `HANDOFF_token_economy.md` → **TOK-1**, дальше TOK-6, TOK-2, TOK-4; TOK-11 перед TOK-5; TOK-9/TOK-10 отдельно
- `HANDOFF_seo_meta.md` → **SEO-2** (og:image 1200x630); после PRECACHE-1 — в `ASSETS_WARM`
- `HANDOFF_toolchain.md` → **TOOL-1** (CLI отстал, Gio), **TOOL-2**, дальше TOOL-3/4/5; правит `~/.claude/*`

Вне хендоффов: **DOCS-3**, **WEED-2** (≥30 дн); FLOW-4 закрыта — потолок памяти сторожит preflight.

## Порядок взятия

- **Дизайн:** NAV-BACK-1 + DEAD-1 не параллелить со SPACE-1/SCALE-1 — общий `css/base.css`.
- **Аналитика:** **AN-2** → AN-3 → OVW-1. После стека — роадмап CRDT foundation.
- **Вне очереди:** NAV-1 (потеря тапа в быстрой серии), NAV-2 (`s-intel` мимо конвенции выхода).

## Технические заметки

- **Запуск:** `npm run dev` → :3000 (Gio), 3001 = Claude preview. Телеметрия — `scripts/telemetry-server.mjs --lan`.
- **Тесты:** `npm test` = unit+integration; `npx playwright test` — отдельно, на тёплом сервере.
- **SW:** `ASSETS`/`CACHE_NAME` только через `npm run build:sw` — краснеет `test/sw-cache-name.test.js`, если забыть.
- **lhci гонять ТОЛЬКО из worktree** — корневой чекаут даёт фейковые цифры.
- **Прод:** Vercel `gio-g7/athlete-pro-v7`, git-репо athlete-pro-v2, деплой с `main`.
- **Git в worktree:** висящая команда держит pager — `GIT_PAGER=cat` и `</dev/null`.
