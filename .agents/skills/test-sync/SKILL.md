---
name: test-sync
description: Runs the sync layer testing block (IndexedDB, Service Worker, Offline mode). Silence = Success.
---
# Sync Block Validation (Block 3 & 4)

## Philosophy: Silence = Success
If all checks pass, output exactly: "Sync Block Pass. No errors." Do NOT output detailed reports of what you checked. Only output details if a check FAILS.

## Execution:
1. Run `npm run test` (or specific sync tests if applicable).
2. Verify that there are no unhandled rejections or syntax errors in `js/db.js` and `sw.js` using `node -c`.
3. If the user requested a chaos spike (e.g. `chaos spike: flush() interrupted`), execute the specific stress test requested.
4. Output results based on the Zero-Trust philosophy.
