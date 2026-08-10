---
name: test-ui
description: Runs the UI layout validation block (AIR DNA, no system emojis, padding). Silence = Success.
---
# UI Block Validation (Block 6)

## Philosophy: Silence = Success
If all checks pass, output exactly: "UI Block Pass. No errors." Do NOT output detailed reports of what you checked. Only output details if a check FAILS.

## Execution:
1. Verify that standard CSS variables are used (no hardcoded px values for typography).
2. Verify AIR architecture: check that padding uses `min(vh, px)` for responsive air.
3. Verify no system emojis are hardcoded in the edited files.
4. Run `npm run lint` or `stylelint` (if available) on the target CSS file.
5. Output results based on the Zero-Trust philosophy.
