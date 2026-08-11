# DISPATCH: Worker M3 — UI Motion Budget & Haptic Optimization

## Objectives
Implement Requirement R3: GPU Motion Budget Optimization and Stream Haptic Suppression.

## Mandatory Paths to Read First
- `C:\PROJECTS\athlete-pro\ORIGINAL_REQUEST.md`
- `C:\PROJECTS\athlete-pro\PROJECT.md`
- `C:\PROJECTS\athlete-pro\.agents\explorer_survey_3\handoff.md`

## Exclusive File Ownership
You exclusively own and may edit only these files:
- `css/intel.css`
- `js/intel.view.js`

## Requirements & Implementation Specifications
1. **GPU Motion Budget Optimization (`css/intel.css`)**:
   - Refactor `.intel-heat-bar` (around lines 209-216) to eliminate layout thrashing caused by animating `width`.
   - Set `width: 100%`, `transform-origin: left center`, `transform: scaleX(var(--heat-val, 0))`.
   - Add `will-change: transform`.
   - Update transition to `transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s linear;`.
2. **Stream Haptic Suppression (`js/intel.view.js`)**:
   - Locate line 602 in `js/intel.view.js` inside the SSE response chunk reader loop (`if (parsed.text) { haptic(2); ... }`).
   - Remove `haptic(2)` from the streaming text chunk handler.
   - Retain gesture-based single-tap haptic triggers (`startVoice`, `stopVoice`, module cards) intact.

## Verification Instructions
- Inspect `css/intel.css` and `js/intel.view.js` syntax.
- Verify CSS transform properties on `.intel-heat-bar`.
- Verify `haptic(2)` is removed from streaming text chunk loop.
- Document all verification methods and findings in your handoff report (`C:\PROJECTS\athlete-pro\.agents\worker_m3\handoff.md`).

## Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
