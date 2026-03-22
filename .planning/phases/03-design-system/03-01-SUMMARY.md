---
phase: 03-design-system
plan: "01"
subsystem: css
tags: [design-system, css, accessibility, wcag, tokens, refactor]
dependency_graph:
  requires: []
  provides: [css/base.css, design-tokens, shared-components, focus-visible]
  affects: [css/workout.css, css/claude.css, css/analytics.css, css/body-stats.css, css/profile.css, css/dashboard.css, index.html, sw.js]
tech_stack:
  added: []
  patterns: [design-tokens, shared-components, focus-visible, css-cascade]
key_files:
  created:
    - css/base.css
  modified:
    - index.html
    - sw.js
    - css/workout.css
    - css/claude.css
    - css/analytics.css
    - css/body-stats.css
    - css/profile.css
decisions:
  - "claude-sheet btn-icon-sm kept at 34px via .claude-sheet .btn-icon-sm override (vs 32px base)"
  - "base.css loaded synchronously (not deferred) as it contains all design tokens"
  - "outline:none in :focus-visible rules in base.css is correct — browsers only apply :focus-visible on keyboard nav"
metrics:
  duration: 5min
  tasks_completed: 2
  tasks_total: 2
  files_changed: 8
  completed_date: "2026-03-22"
---

# Phase 3 Plan 01: Design System Foundation Summary

**One-liner:** CSS design system foundation with shared token extraction to base.css, WCAG AA contrast fix, and global :focus-visible indicators replacing 8 inline outline:none declarations.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create css/base.css with design tokens, shared components, focus-visible | ba4e1b0 | css/base.css, index.html, sw.js |
| 2 | Remove duplicate components from screen CSS and replace outline:none | 624a0da | css/workout.css, css/claude.css, css/analytics.css, css/body-stats.css, css/profile.css |

## What Was Built

### css/base.css (165 lines)
Single source of truth for the design system, loaded synchronously before all screen CSS files:

- **Section 1 — Design Tokens:** Full `:root` block with all `--c-*`, `--sp-*`, `--r-*`, `--sh-*`, `--t-*`, `--safe-*`, `--nav-h` tokens. Fixed `--c-text-3` from `#6b7280` to `#9ca3af` (WCAG AA 4.5:1 contrast on dark backgrounds).
- **Section 2 — Buttons:** `.btn-primary`, `.btn-icon-sm`, `.btn-icon-nav` with active states.
- **Section 3 — Modals:** `.modal-overlay`, `.modal-sheet`, `.modal-handle`, `.modal-header`, `.modal-title` with keyframe animations.
- **Section 4 — Focus-Visible:** Global `input:focus-visible`, `textarea:focus-visible`, `select:focus-visible`, `button:focus-visible` with double-ring box-shadow pattern (2px bg gap + 4px accent ring).

### index.html
- Inline `:root` slimmed from 43 tokens to 5 critical-path tokens only (`--c-bg`, `--c-text-1`, `--nav-h`, `--safe-top`, `--safe-bottom`)
- Added `<link rel="stylesheet" href="css/base.css" />` before dashboard.css (synchronous, not deferred)

### sw.js
- Added `/css/base.css` to ASSETS precache array before `/css/dashboard.css`

### Screen CSS Files (duplicates removed)
- **css/workout.css:** Removed modal-overlay/sheet/handle/header/title, btn-icon-sm, btn-primary blocks (7 blocks removed). Removed outline:none from 3 rules.
- **css/claude.css:** Removed modal-handle and btn-icon-sm definitions. Added `.claude-sheet .btn-icon-sm` size override (34px × 34px, border-radius 10px). Removed outline:none from FAB and chat-input.
- **css/analytics.css:** Removed btn-icon-nav definition.
- **css/body-stats.css:** Removed outline:none from 2 focus rules. Preserved `.modal-overlay.bs-overlay` variant overrides (correct — these override base modal behavior).
- **css/profile.css:** Removed outline:none from metric-input focus rule.

## Accessibility Improvements
1. **WCAG AA contrast fix:** `--c-text-3` raised from #6b7280 (3.5:1) to #9ca3af (4.5:1+) on dark backgrounds
2. **Keyboard focus indicators:** Global `:focus-visible` box-shadow added to all inputs, textareas, selects, buttons — replacing 8 `outline: none` declarations that left keyboard users with no focus indicator

## Deviations from Plan

### Auto-fixed Issues
None.

### Design Decisions Made During Execution
**[Deviation — Minor] claude-sheet btn-icon-sm size override retained**
- **Found during:** Task 2
- **Issue:** claude.css used 34px × 34px btn-icon-sm vs workout.css 32px × 32px. Plan instructed to add override if claude needs larger size.
- **Decision:** Added `.claude-sheet .btn-icon-sm { width: 34px; height: 34px; border-radius: 10px; }` override to preserve visual design of claude panel header.
- **Files modified:** css/claude.css

## Self-Check: PASSED

- css/base.css: FOUND
- commit ba4e1b0 (Task 1): FOUND
- commit 624a0da (Task 2): FOUND
