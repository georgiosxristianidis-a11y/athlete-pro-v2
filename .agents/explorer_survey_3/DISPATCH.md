# DISPATCH: Survey Explorer 3 (Motion Budget & Haptics)

## Mission
Investigate UI Motion Budget Optimization and Haptics requirements for Requirement R3.

## Path to Read
`C:\PROJECTS\athlete-pro\ORIGINAL_REQUEST.md`

## Objectives
1. Inspect `css/intel.css` and `js/intel.view.js`.
2. Locate all CSS rules for `.intel-heat-bar` and identify properties causing Layout Thrashing (`width`, `height`, etc.).
3. Formulate GPU-accelerated replacement using CSS `transform` (`scaleX`/`scaleY` or `translate3d`).
4. Locate high-frequency `haptic()` and `navigator.vibrate` calls in `js/intel.view.js` during AI text streaming chunk processing.
5. Formulate refactoring plan to remove or throttle stream haptic calls without breaking legitimate single-tap feedback.
6. Write handoff report to `C:\PROJECTS\athlete-pro\.agents\explorer_survey_3\handoff.md`.
