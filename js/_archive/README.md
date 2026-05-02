# Archived JS Modules

Files in this folder are **NOT loaded** by the application. They are kept for reference / reuse.

| File | Original size | Archived | Reason | Live replacement |
|---|---:|---|---|---|
| `claude.js` | 758 lines | 2026-04-25 | Pre-Store/View split. App.js imports `claude.view.js` instead | `claude.view.js` + `claude.store.js` |
| `workout.js` | 1512 lines | 2026-04-25 | Pre-Store/View split. App.js imports `workout.view.js` instead | `workout.view.js` + `workout.store.js` |
| `db-firebase.js` | 480 lines | 2026-04-25 | Firebase backend abandoned. App uses IndexedDB (`db.js`) + Express API | `db.js` |
| `analytics.js` | 705 lines | 2026-04-25 | Pre-Store/View split. Shell loads `analytics.view.js` dynamically | `analytics.view.js` + `analytics.store.js` |

> **Do NOT delete** without checking with project owner.
> **Do NOT import** from this folder — files are excluded from the live module graph.

If you need to recover a function:
1. `git log --follow js/_archive/<file>` — see history
2. Copy the function to the relevant `.view.js` / `.store.js`
3. Add `// @ts-check` and JSDoc on the way

---

Last updated: 2026-04-25 (Phase 1 cleanup)
