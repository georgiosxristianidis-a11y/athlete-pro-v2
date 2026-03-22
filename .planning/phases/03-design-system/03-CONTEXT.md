# Phase 3: Design System - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Consolidate six per-screen CSS files into a coherent design system with shared base components (css/base.css), achieve WCAG AA accessibility compliance (contrast, focus indicators, aria-labels), fix touch target gaps, and establish a breakpoint system. No visual redesign — focus on consistency, accessibility, and componentization.

</domain>

<decisions>
## Implementation Decisions

### Component consolidation
- Move design tokens from inline index.html `:root` into `css/base.css` — single source of truth
- Extract shared components into base.css: buttons (`.btn-primary`, `.btn-icon-sm`, `.btn-icon-nav`), cards (`.stat-chip` pattern), inputs/textareas, modals (`.modal-overlay`/`.modal-sheet`/`.modal-handle`)
- Keep per-screen CSS files (dashboard.css, workout.css, etc.) — they `@import` base.css for shared components
- Screen-specific variants stay in screen CSS files via modifier classes; base component styles live in base.css

### Accessibility — contrast
- `--c-text-3` changes from `#6b7280` (~3.5:1) to `#9ca3af` (meets WCAG AA 4.5:1 on dark backgrounds)

### Accessibility — focus indicators
- Replace all `outline: none` on inputs/textareas with `:focus-visible` using `box-shadow` ring in accent color with offset
- Visible on dark backgrounds, doesn't shift layout (box-shadow vs outline)

### Accessibility — aria-labels
- Comprehensive audit of all icon-only buttons in index.html and JS template literals
- Add `aria-label` to every icon button that lacks one (currently only FAB has a label)

### Touch targets
- Streak dots: increase visual dot + padding to meet 44px minimum tap target dimension
- Keep visual dot proportional — use padding/min-size to reach 44px, not oversized visuals

### Breakpoint strategy
- Two breakpoints: `360px` (small phone floor) and `768px` (tablet)
- Existing `600px` breakpoint may be adjusted or kept alongside — researcher to determine
- `<360px`: prevent overflow/clipping — wrap stat chips, shrink font sizes, ensure inputs don't overflow
- `>=768px` tablet: wider content area with max-width, 2-column stat chips on dashboard, more breathing room
- Define breakpoint values as CSS custom properties for consistency

### Visual consistency
- Minimal polish — only fix inconsistencies found during component extraction (different border-radius, shadow values, spacing across screens)
- No visual redesign beyond what's needed for componentization and accessibility

### Claude's Discretion
- Exact box-shadow values for focus indicators
- How to structure @import in screen CSS files (top-level import vs link in HTML)
- Whether to use CSS layers (@layer) for base vs screen specificity management
- Exact padding/size approach for streak dot 44px target
- How to handle the inline critical CSS in index.html (keep subset inline for FCP, move rest to base.css)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design requirements
- `.planning/REQUIREMENTS.md` — DESIGN-1 through DESIGN-6 acceptance criteria
- `.planning/ROADMAP.md` — Phase 3 success criteria (6 items)

### Existing CSS architecture
- `.planning/codebase/CONVENTIONS.md` — CSS conventions, design token system, class naming patterns
- `.planning/codebase/STRUCTURE.md` — CSS file layout, naming conventions

### Current implementation
- `index.html` — Inline `:root` design tokens (~300 lines critical CSS), nav buttons, screen shells
- `css/dashboard.css` — Streak dots at 28px (line 104-105), stat chips, hero section
- `css/workout.css` — `outline: none` instances (lines 379, 603), button/input patterns
- `css/body-stats.css` — `outline: none` instances (lines 337, 382)
- `css/claude.css` — `outline: none` instances (lines 26, 452)
- `css/profile.css` — `outline: none` (line 105), 44px button heights already

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Design tokens already comprehensive in `:root`: colors (9-color palette), spacing (8px grid --sp-1 through --sp-6), border-radius (--r-s/m/l/xl), shadows (--sh-sm/md/lg), transitions (--t-fast/normal/slow), safe areas
- `.stat-chip` component pattern exists in dashboard.css with label/val/unit children and color variants
- `.modal-overlay` / `.modal-sheet` / `.modal-handle` pattern used in plate-calc and workout screens
- `.btn-primary`, `.btn-icon-sm`, `.btn-icon-nav` class names used across screens

### Established Patterns
- Mobile-first: base styles for mobile, `@media (min-width: 600px)` for desktop
- BEM-ish kebab-case: `.component-element` (not strict BEM `__` / `--`)
- CSS custom properties for all design decisions — no hardcoded colors/spacing in component rules
- `* { box-sizing: border-box; margin: 0; padding: 0; }` global reset in inline CSS

### Integration Points
- `index.html` inline `<style>` contains tokens + shell CSS — base.css must coordinate with this
- 6 CSS files loaded via `<link>` in index.html (5 deferred via media=print onload trick from Phase 2, dashboard.css critical)
- `sw.js` ASSETS list must include new `css/base.css` file
- JS templates in `.view.js` files generate HTML with these CSS classes — class names must remain stable

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The goal is accessibility compliance and component consolidation, not a visual refresh.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-design-system*
*Context gathered: 2026-03-22*
