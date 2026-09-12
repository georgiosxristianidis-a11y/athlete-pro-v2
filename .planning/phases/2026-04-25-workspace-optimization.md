# Workspace Optimization Roadmap

**Created:** 2026-04-25
**Last updated:** 2026-09-12 — сверка с кодом `origin/main`, закрытое вычеркнуто
**Внимание:** каталог `.planning/` стоит в `.claudesignore` и `.cursorignore` — агенты его не
читают. Всё живое отсюда надо переносить в `docs/` или `.claude/rules/`, иначе оно не работает.
**Goal:** Premium / elite-tier organization of the codebase for fast AI-assisted edits with minimum token waste.
**Why:** User runs Claude via subscription (no IDE plugins), so token economy matters. Smaller, well-structured files = fewer reads = lower cost per task.

## Status snapshot

| Phase | Status | Wall time actual | Tokens actual |
|---|---|---|---|
| 1 — Cleanup | ✅ DONE | ~12 min | ~12k |
| 2.1 — `@ts-check` coverage | ✅ DONE | ~5 min | ~3k |
| 2.2 — `types.d.ts` | ✅ DONE | ~5 min | ~9k |
| **2.3 — Split `workout.view.js`** | ✅ DONE | — | — |
| 2.4 — Inline-handler audit | ✅ DONE (09-12) | — | — |
| 2.5 — Split `claude.view.js` (if painful) | ✅ не нужен (09-12) | — | — |
| Phase 3 (premium tooling) | 🟨 4 из 6 (09-12) | — | — |

> **Сверка 2026-09-12.** 2.4 закрылась сама: `onclick=` в `js/` не осталось ни одного —
> обработчики ушли на делегирование `data-action`. 2.5 отпала: `claude.view.js` = 410 строк,
> порог 800 не перейдён. Из Phase 3 живыми остались только 3.5 и 3.6.

---

## How to read this document

Each task has 5 dimensions:

| Field | Values | Meaning |
|---|---|---|
| **Priority** | P0 / P1 / P2 | P0 = do first, P2 = nice-to-have |
| **Complexity** | S / M / L / XL | S = trivial, XL = multi-day refactor |
| **Critical** | yes / no | "yes" = blocks future work or causes bugs |
| **Wall time** | minutes | Real-world time including review/test |
| **Token cost** | low / mid / high | Estimated context-window usage per task |

### Token cost reference

Approximate per-task cost (input + output combined):

| Tier | Range | Equivalent |
|---|---|---|
| **Low** | < 5k tokens | 1-2 small edits, 1-2 greps |
| **Mid** | 5-20k tokens | Several edits, 3-5 file reads, 1 sanity check |
| **High** | 20-50k tokens | Multi-file refactor, full audit |
| **Very high** | 50k+ | Full screen rewrite, architecture migration |

> Daily budget on Claude subscription is ~200k tokens of usable context per session reset.
> Plan accordingly: 1× Very-high task = full session, 4× Mid tasks = full session.

---

## Phase 1 — Cleanup (Tier 1)

**Goal:** Remove dead code, fix workspace hygiene. Highest ROI / lowest cost.
**Estimated total:** ~25 min wall, ~12k tokens.

| # | Task | Priority | Complexity | Critical | Wall time | Tokens | Notes |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 1.1 | Archive `js/claude.js` (legacy) — move to `js/_archive/` | P0 | S | no | 5m | low | Confirmed dead via grep — `app.js` only imports `claude.view.js` |
| 1.2 | Add `.editorconfig` — `indent_size: 2`, UTF-8, LF line endings | P0 | S | no | 3m | low | Future edits stay consistent across editors |
| 1.3 | Add `.claude/worktrees/` to `.gitignore` if missing | P1 | S | no | 2m | low | Prevents accidental commits + reduces grep noise |
| 1.4 | Audit `// @ts-check` coverage — list files missing it | P1 | S | no | 5m | low | One grep + report. Doesn't add @ts-check yet (Phase 2) |
| 1.5 | Document module dependency graph in `.planning/codebase/MODULES.md` | P2 | M | no | 10m | mid | Visualize who imports who, e.g. `app.js → workout.view → workout.store + claude.store` |

**Done criteria:**
- ✓ Dead files archived
- ✓ `.editorconfig` exists
- ✓ Module graph readable in 30s

---

## Phase 2 — Type safety + size (Tier 2)

**Goal:** Smaller files, predictable types, faster AI navigation. Medium ROI / medium cost.
**Estimated total:** ~3-4h wall, ~80k tokens (split across 2-3 sessions).

| # | Task | Priority | Complexity | Critical | Wall time | Tokens | Notes |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 2.1 | Add `// @ts-check` to all js/*.js missing it | P1 | S | no | 15m | low | One-line addition per file. AI gets type hints |
| 2.2 | Create `js/types.d.ts` with global JSDoc types: `Plan`, `Session`, `Set`, `Exercise`, `WorkoutDay` | P1 | M | no | 30m | mid | Centralizes types. AI can reference instead of re-deriving |
| 2.3 | **Split `workout.view.js` (~2200 lines)** into 4-5 modules | P0 | L | yes | 90m | high | See Sub-tasks below. **Biggest cost-saver long-term** |
| 2.3a | → Extract `workout.view/render.js` (renderSelect, renderActive, renderExerciseCard, renderSetRow) | — | M | yes | 30m | mid | ~700 lines |
| 2.3b | → Extract `workout.view/modals.js` (openPlanEditor, openExercisePickerModal, openReplaceExModal) | — | M | yes | 30m | mid | ~600 lines |
| 2.3c | → Extract `workout.view/drag.js` (_initDrag, _initPlanDrag) | — | S | no | 15m | low | ~150 lines |
| 2.3d | → Extract `workout.view/handlers.js` (stepWeight, stepReps, toggleSet, etc.) | — | M | yes | 30m | mid | ~400 lines |
| 2.3e | → `workout.view.js` becomes barrel: re-exports + init wiring | — | S | yes | 10m | low | ~200 lines, public API |
| ~~2.4~~ | ~~Inline-handler audit: list `onclick=` count per file~~ | P2 | S | no | 5m | low | ✅ 09-12 — `onclick=` в `js/` ноль, всё на `data-action` |
| ~~2.5~~ | ~~Split `claude.view.js` (~700 lines) similarly if becomes painful~~ | P2 | M | no | 45m | mid | ✅ 09-12 — 410 строк, делить нечего |

**Done criteria:**
- ✗ No JS file > 800 lines — **не выполнен (09-12):** семь файлов за порогом —
  `dashboard.js` 1207, `shared/athlete-room.js` 1098, `intel.view.js` 1086,
  `workout.store.js` 1072, `locale.store.js` 1061, `workout.view/handlers.js` 908,
  `workout.view/modals.js` 822. Порог перерос сам проект, а не рефакторинг провалился:
  словарь и стор режутся плохо. Критерий нужно либо переписать под реальность, либо снять.
- ✓ AI can read 1 module = 1 concern (render only / modals only / handlers only)
- ✓ `import` graph documented
- ✓ All edits to `workout.view` happen in 1 of 4 small files, not the 2200-line monolith

**⚠ Critical risk:** Phase 2.3 is the riskiest task in this whole roadmap. Splitting a 2200-line file with cross-references requires care. **Recommended approach:** create new files alongside old, gradually move functions, keep old file working until last commit. Single PR to flip everything.

---

## Phase 3 — Premium tooling (Tier 3)

**Goal:** Automated quality gates. Lowest ROI per hour but highest long-term value.
**Estimated total:** ~6-8h wall, ~40k tokens (mostly setup, not code).

| # | Task | Priority | Complexity | Critical | Wall time | Tokens | Notes |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| ~~3.1~~ | ~~Add `package.json` script `npm run lint`~~ | P2 | S | no | 15m | low | ✅ 09-12 — `npm run lint` есть, плюс `security:sast` |
| ~~3.2~~ | ~~Add `npm run format` (prettier via CLI)~~ | P2 | S | no | 15m | low | ✅ 09-12 — `format` + `format:check` |
| ~~3.3~~ | ~~Pre-commit hook: lint + format on staged files~~ | P2 | M | no | 30m | mid | ✅ 09-12 иначе, чем задумано — хук один, `.githooks/pre-push`, и он тяжелее: гейт + дрейф базы + донорские линии + защита `main` |
| ~~3.4~~ | ~~Lighthouse CI in `package.json`~~ | P2 | M | no | 45m | mid | ✅ 09-12 — `npm run lhci` (гнать только из worktree) |
| 3.5 | Storybook-lite: `/showcase` route showing all components isolated | P2 | L | no | 120m | high | ⬜ 09-12 — маршрута нет; в корне лежит `debug-storybook.log` от какого-то захода |
| 3.6 | Visual regression: Playwright screenshots of key screens | P2 | XL | no | 240m | high | ⬜ 09-12 — визуальных спек в `test/e2e/` нет |

**Done criteria:**
- ✓ `npm run lint` exits 0
- ✗ `/showcase` page renders all design tokens visually — не сделано
- ✓ Lighthouse score tracked over time (`npm run lhci`)

---

## Phase 4 — Continuous tasks (ongoing)

**Goal:** Hygiene tasks done after every feature, not as separate phases.

| # | Task | Trigger | Tokens |
|---|---|---|:-:|
| 4.1 | Update `MODULES.md` when new file added | per new file | low |
| 4.2 | Update `CLAUDE.md` rules when new convention emerges | per convention | low |
| 4.3 | Archive `.planning/phases/*.md` when phase done — move to `.planning/phases/_done/` | per phase | low |
| 4.4 | Run sanity-check (`node --check js/*.js`) before claiming task done | per task | low |
| 4.5 | One-line entry in `CHANGELOG.md` for user-visible changes | per merge | low |

---

## Token-budget cheat sheet (planning your sessions)

**Cold start cost** (first task in a fresh Claude session): **+2-3k tokens**
- AI reads CLAUDE.md, MEMORY.md, recent context
- Worth budgeting once per session

**Per task overhead** (independent of task size): **+500 tokens**
- Tool call schemas, system reminders, sanity checks

### Recommended session shapes

| Session goal | Tasks | Total tokens |
|---|---|---:|
| Quick polish | 3-5× P0/S tasks | ~15k |
| Feature day | 1× M + 2× S | ~30k |
| Refactor day | 1× L (with breaks) | ~80k |
| Architecture day | 1× XL split into chunks | ~150k+ |

> **Rule of thumb:** if a single task is projected > 50k tokens, **split it**. Better to land 3 small wins than 1 stuck-in-the-middle large refactor.

---

## Suggested execution order

**Week 1 (best ROI):**
1. Phase 1 entirely (one session, ~30 min)
2. Phase 2.1 + 2.2 (one session, ~45 min)

**Week 2 (after stable):**
3. Phase 2.3 — split `workout.view.js` (split across 2 sessions)
4. Phase 2.4 audit (decide if 2.5 needed)

**Week 3+ (when motivated):**
5. Phase 3 selectively — pick what helps your workflow
6. Phase 4 becomes habit

---

## Decision log

| Date | Question | Decision | Reason |
|---|---|---|---|
| 2026-04-25 | Use TS or stay vanilla? | Stay vanilla + JSDoc | Frozen project; TS migration too costly |
| 2026-04-25 | ESLint/Prettier as IDE plugins? | CLI only (Phase 3.1-3.2) | User uses Claude subscription, not IDE |
| 2026-04-25 | Worth splitting `workout.view.js`? | Yes (Phase 2.3) | 2200 lines = ~12k tokens per read; biggest single saving |
| 2026-04-25 | Storybook full or lite? | Lite (single HTML showcase page) | Avoid framework dependency |

---

## Out of scope

- Migration to React/Vue (project frozen — see CLAUDE.md)
- Backend changes (Express stable)
- Tailwind migration (rejected in 2026-04-25-byoi-ppl.md)
- Service Worker rewrite
- Database migration to Supabase (separate roadmap)
