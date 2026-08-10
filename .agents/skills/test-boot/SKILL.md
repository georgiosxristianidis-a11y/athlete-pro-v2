---
name: test-boot
description: Runs the boot sequence validation block (State machine, restoring active screens, memory leaks). Silence = Success.
---
# Boot Block Validation (Block 1, 2, 8, 9)

## Philosophy: Silence = Success
If all checks pass, output exactly: "Boot Block Pass. No errors." Do NOT output detailed reports of what you checked. Only output details if a check FAILS.

## Execution:
1. Verify `history.state.screen` routing logic in `js/app.js` and `js/shell.js`.
2. Check for missing `await` calls during boot sequence in `js/app.js`.
3. Verify that `window.addEventListener` for global events (`error`, `unhandledrejection`) are properly configured in `js/boot.js`.
4. Output results based on the Zero-Trust philosophy.
