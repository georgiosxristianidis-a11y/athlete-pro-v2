# Handoff Report — Remediation Explorer R2 (HLC Integration & Security Fix Strategy)

## 1. Observation

### Reviewed Code & Audit Findings
1. **`js/sync.js` (Client Sync Engine)**:
   - **Line 119**: `const updated = records.filter(r => r.updatedAt > lastSync);` — Filters records using `r.updatedAt` only. Records with `r.hlc.l` without `r.updatedAt` are missed.
   - **Lines 144–157**:
     ```javascript
     if (pullData.changes) {
       for (const [store, records] of Object.entries(pullData.changes)) {
         for (const remoteRecord of records) {
           const key = store === 'settings' ? remoteRecord.key : remoteRecord.id;
           const localRecord = await DB._getRaw(store, key);

           // CRDT Last Write Wins
           if (!localRecord || remoteRecord.updatedAt > localRecord.updatedAt) {
             await DB._putRaw(store, remoteRecord);
             pulledCount++;
           }
         }
       }
     }
     ```
     - `DB.hlcReceive(remoteRecord.hlc, DB.getDeviceId())` is omitted during PULL processing.
     - Conflict resolution uses primitive `remoteRecord.updatedAt > localRecord.updatedAt` instead of `lwwWins(remoteRecord, localRecord)`. `lwwWins` from `./shared/lww.js` is not imported.

2. **`routes/sync.js` (Backend Push Endpoint)**:
   - **Lines 64–67**:
     ```javascript
     const PushPayloadSchema = z.record(z.string(), z.array(RecordSchema)).refine(
       (data) => typeof data === 'object' && data !== null && !Array.isArray(data) && Object.keys(data).every(k => ValidStoreNamesSet.has(k)),
       { message: 'Invalid store name or structure in sync payload' }
     );
     ```
     - In V8 JavaScript, `Object.keys` on a parsed object with `__proto__` returns valid store keys only (`['workouts']`), bypassing Zod refinement check.
   - **Empirical Failure Output** (`test/challenger-r1-stress.test.js` lines 245–251):
     ```text
     # Subtest: Rejects Prototype Pollution payloads containing __proto__ with HTTP 400
     not ok 10 - Rejects Prototype Pollution payloads containing __proto__ with HTTP 400
       ---
       failureType: 'testCodeFailure'
       error: |-
         Expected values to be strictly equal:
         200 !== 400
         expected: 400
         actual: 200
     ```

3. **Test Suite Execution Baseline**:
   - Command: `node --test test/crdt-foundation.test.js test/hlc-and-sync-security.test.js test/sync-resilience.test.js test/challenger-r1-stress.test.js`
   - Result: 51 passed, 1 failed (`Rejects Prototype Pollution payloads containing __proto__ with HTTP 400`).

---

## 2. Logic Chain

1. **Client Clock Advancement (`js/sync.js`)**:
   - When pulling remote changes, remote records contain `remoteRecord.hlc = { l, c, node }`.
   - If `DB.hlcReceive(remoteRecord.hlc, DB.getDeviceId())` is not invoked, the local client's HLC state remains behind when remote records originate from a clock-skewed node.
   - Subsequent client writes generate HLC timestamps with $l_{\text{local}} < l_{\text{remote}}$, causing the server to reject the client's writes as older records.
   - Calling `DB.hlcReceive(remoteRecord.hlc, DB.getDeviceId())` advances $L_{\text{local}} = \max(L_{\text{local}}, pt, L_{\text{remote}})$, guaranteeing causality for future writes.

2. **LWW Conflict Resolution & Push Filter (`js/sync.js`)**:
   - Using `lwwWins(remoteRecord, localRecord)` replaces raw `updatedAt` comparison with deterministic HLC comparison `(l, c, node)` and supports legacy fallbacks.
   - Updating the push filter to `(r.hlc?.l ?? r.updatedAt ?? 0) > lastSync` ensures records stamped with HLC timestamps are captured during synchronization even if `updatedAt` is missing.

3. **Prototype Pollution Protection (`routes/sync.js`)**:
   - `JSON.parse` attaches `__proto__` properties that are skipped by `Object.keys()`.
   - Adding explicit prototype checks (`Object.prototype.hasOwnProperty.call(req.body, '__proto__')`, `Object.getOwnPropertyNames(req.body).includes('__proto__')`, and `Object.getPrototypeOf(req.body) !== Object.prototype`) in both `PushPayloadSchema.refine` and the `POST /api/sync/push` handler guarantees immediate detection and HTTP 400 Bad Request response `{ error: 'Invalid sync payload format' }`.

---

## 3. Caveats

- `DB.hlcReceive` should be guarded with `if (remoteRecord.hlc)` to prevent errors on legacy records without HLC.
- Prototype pollution check must be applied both at the handler entry point and inside Zod `.refine` to provide defense-in-depth.
- No caveats regarding environment or test dependencies.

---

## 4. Conclusion

The fix strategy is completely formulated and ready for implementation.

### Implementation Diffs

#### Diff 1: `js/sync.js`
```diff
--- a/js/sync.js
+++ b/js/sync.js
@@ -1,5 +1,6 @@
 // @ts-check
 import { DB } from './db.js';
+import { lwwWins } from './shared/lww.js';
 
 const LAST_SYNC_KEY = 'panda-last-sync';
 const SYNC_STORES = ['workouts', 'oneRM', 'bodyMetrics', 'events', 'settings', 'nutritionLogs', 'plannedWorkouts'];
@@ -116,7 +117,7 @@ export async function runSync() {
     const pushPayload = {};
     for (const store of SYNC_STORES) {
       const records = await DB._getAllRaw(store);
-      const updated = records.filter(r => r.updatedAt > lastSync);
+      const updated = records.filter(r => (r.hlc?.l ?? r.updatedAt ?? 0) > lastSync);
       if (updated.length > 0) {
         pushPayload[store] = updated;
         pushedCount += updated.length;
@@ -144,11 +145,14 @@ export async function runSync() {
     if (pullData.changes) {
       for (const [store, records] of Object.entries(pullData.changes)) {
         for (const remoteRecord of records) {
+          if (remoteRecord.hlc) {
+            DB.hlcReceive(remoteRecord.hlc, DB.getDeviceId());
+          }
           const key = store === 'settings' ? remoteRecord.key : remoteRecord.id;
           const localRecord = await DB._getRaw(store, key);
 
           // CRDT Last Write Wins
-          if (!localRecord || remoteRecord.updatedAt > localRecord.updatedAt) {
+          if (lwwWins(remoteRecord, localRecord)) {
             await DB._putRaw(store, remoteRecord);
             pulledCount++;
           }
```

#### Diff 2: `routes/sync.js`
```diff
--- a/routes/sync.js
+++ b/routes/sync.js
@@ -62,8 +62,14 @@ const ValidStoreNamesSet = new Set([
 ]);
 
 const PushPayloadSchema = z.record(z.string(), z.array(RecordSchema)).refine(
-  (data) => typeof data === 'object' && data !== null && !Array.isArray(data) && Object.keys(data).every(k => ValidStoreNamesSet.has(k)),
-  { message: 'Invalid store name or structure in sync payload' }
+  (data) => {
+    if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
+    if (Object.getPrototypeOf(data) !== Object.prototype) return false;
+    if (Object.prototype.hasOwnProperty.call(data, '__proto__')) return false;
+    if (Object.getOwnPropertyNames(data).includes('__proto__')) return false;
+    return Object.keys(data).every(k => ValidStoreNamesSet.has(k));
+  },
+  { message: 'Invalid store name or structure in sync payload' }
 );
 
 // GET /api/sync/pull?since=123456789
@@ -96,6 +102,17 @@ router.get('/pull', async (req, res, next) => {
 // POST /api/sync/push
 router.post('/push', async (req, res, next) => {
   try {
+    if (
+      !req.body ||
+      typeof req.body !== 'object' ||
+      Array.isArray(req.body) ||
+      Object.getPrototypeOf(req.body) !== Object.prototype ||
+      Object.prototype.hasOwnProperty.call(req.body, '__proto__') ||
+      Object.getOwnPropertyNames(req.body).includes('__proto__')
+    ) {
+      return res.status(400).json({ error: 'Invalid sync payload format' });
+    }
+
     const parseResult = PushPayloadSchema.safeParse(req.body);
     if (!parseResult.success) {
       return res.status(400).json({
```

---

## 5. Verification Method

1. Apply the diffs to `js/sync.js` and `routes/sync.js`.
2. Run the full test suite:
   ```bash
   node --test test/crdt-foundation.test.js test/hlc-and-sync-security.test.js test/sync-resilience.test.js test/challenger-r1-stress.test.js
   ```
3. Assert that all 52 tests pass with 0 failures (specifically confirming that `Rejects Prototype Pollution payloads containing __proto__ with HTTP 400` passes).
