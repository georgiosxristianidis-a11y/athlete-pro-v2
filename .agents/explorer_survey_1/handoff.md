# Handoff Report — Requirement R1 Investigation (CRDT HLC & Backend Security)

## 1. Observation

### Targeted Files Inspected
- `C:\PROJECTS\athlete-pro\js\db.js` & `C:\PROJECTS\athlete-pro\js\db\core.js`
- `C:\PROJECTS\athlete-pro\routes\sync.js`
- `C:\PROJECTS\athlete-pro\server.js`
- `C:\PROJECTS\athlete-pro\package.json`
- `C:\PROJECTS\athlete-pro\js\sync.js`
- `C:\PROJECTS\athlete-pro\js\shared\lww.js`
- `C:\PROJECTS\athlete-pro\test\crdt-foundation.test.js`

### Key Observations & Evidence

1. **Current Timestamping & Metadata (`js/db/core.js:49-54`)**:
   - Metadata stamping is done via `withMeta(record)`:
     ```javascript
     export function withMeta(record) {
       if (record.id === undefined || record.id === null) record.id = newId();
       record.updatedAt = Date.now();
       record.deviceId = getDeviceId();
       return record;
     }
     ```
   - `updatedAt` relies solely on physical wall-clock time (`Date.now()`).
   - `deviceId` is stored in `localStorage` (`'ap-device-id'`) and defaults to UUID v4 or `'local'`.

2. **Sync Route Handling (`routes/sync.js`)**:
   - `/api/sync/push` (lines 60-91) iterates over payload entries:
     ```javascript
     for (const [storeName, records] of Object.entries(payload)) {
       if (!db[storeName]) db[storeName] = {};
       for (const remoteRecord of records) {
         const key = storeName === 'settings' ? remoteRecord.key : remoteRecord.id;
         const localRecord = db[storeName][key];
         if (!localRecord || remoteRecord.updatedAt > localRecord.updatedAt) {
           db[storeName][key] = remoteRecord;
           mergedCount++;
         }
       }
     }
     ```
   - Conflict resolution uses raw numeric scalar comparison `remoteRecord.updatedAt > localRecord.updatedAt`.
   - `/api/sync/pull` (lines 37-57) filters records using `r.updatedAt > since` (where `since` is epoch ms).

3. **Backend Schema & Security Validation (`package.json`, `routes/sync.js`)**:
   - `package.json` line 38 contains `"zod": "^4.4.3"`.
   - `routes/sync.js` has **ZERO** payload validation. `req.body` is directly accessed without checking if it is a valid object, if store names are valid, or if `records` is an array.
   - Malformed payloads (e.g. `{ workouts: "invalid" }` or non-object body) cause unhandled JavaScript runtime exceptions (`TypeError`), resulting in HTTP 500 server errors rather than HTTP 400 Bad Request responses.

4. **Client Sync Loop (`js/sync.js`)**:
   - `runSync()` (lines 13-81) filters local records using `r.updatedAt > lastSync` and merges pulled records using `remoteRecord.updatedAt > localRecord.updatedAt`.

5. **Conflict Resolution Module (`js/shared/lww.js`)**:
   - Implements `lwwWins(local, remote)` comparing `updatedAt` with `deviceId` string tie-breaker:
     ```javascript
     export function lwwWins(local, remote) {
       const lt = local.updatedAt ?? local.timestamp ?? 0;
       const rt = remote.updatedAt ?? remote.timestamp ?? 0;
       if (lt !== rt) return lt > rt;
       return String(local.deviceId ?? '') > String(remote.deviceId ?? '');
     }
     ```
   - Neither `routes/sync.js` nor `js/sync.js` currently invokes `lwwWins()`.

---

## 2. Logic Chain

1. **Clock Skew Data Loss Mechanism**:
   - Current conflict resolution relies on `updatedAt` (`Date.now()`).
   - If Device A's system clock is skewed +10 minutes ahead, every record modified on Device A gets an `updatedAt` timestamp 10 minutes in the future.
   - If Device B (with correct physical clock) subsequently edits the same record, Device B's local `updatedAt` will be lower than Device A's future timestamp.
   - During sync, Device B's updates are discarded or overwritten by Device A's stale write, causing permanent data loss for Device B.

2. **Causality and Ordering Deficiencies**:
   - Physical clocks on distributed devices are non-monotonic (NTP adjustments, leap seconds, manual clock changes).
   - Edits occurring within the same millisecond have identical `updatedAt` values, causing non-deterministic merge behavior depending on network arrival order.

3. **Lack of Payload Validation**:
   - `/api/sync/push` accepts arbitrary unvalidated JSON objects.
   - Lack of `zod` validation allows invalid data structures to corrupt server storage (`data/sync.json`) and triggers 500 errors on invalid payloads instead of 400 Bad Request.

---

## 3. Caveats

- **Existing Legacy Data**: Existing records in IndexedDB and `data/sync.json` currently only have `updatedAt: number` (epoch ms) and `deviceId: string`. HLC implementation must support backward compatibility with records lacking an `hlc` property by fallback-converting legacy `updatedAt` into HLC `{ l: record.updatedAt, c: 0, node: record.deviceId || 'legacy' }`.
- **IndexedDB Indexing**: Current IndexedDB indexes are created on `timestamp` / `updatedAt`. While HLC tuple `(l, c, node)` provides strict causality ordering, `l` (physical time component) can still be used for range queries (`since`) in `/api/sync/pull`.

---

## 4. Conclusion & Architectural Recommendations

To resolve Clock Skew data loss and enforce backend payload security, the following architecture must be implemented:

### A. Hybrid Logical Clock (HLC) Implementation
1. **HLC Timestamp Structure**:
   Represent HLC as a tuple or object:
   ```javascript
   /**
    * @typedef {{ l: number, c: number, node: string }} HLCTimestamp
    */
   ```
   Or canonical formatted string representation: `"${l.toString().padStart(15, '0')}:${c.toString().padStart(5, '0')}:${node}"`.

2. **HLC Clock Module (`js/shared/hlc.js`)**:
   Maintain node state `(l_local, c_local, node_id)`:
   - **`hlcNow(nodeId)`**:
     Let $pt = \text{Date.now()}$.
     - If $pt > l_{local}$: $l_{local} = pt$, $c_{local} = 0$.
     - If $pt == l_{local}$ or $pt < l_{local}$: $c_{local} = c_{local} + 1$.
     - Return `{ l: l_{local}, c: c_{local}, node: nodeId }`.
   - **`hlcReceive(remoteHlc, nodeId)`**:
     Let $pt = \text{Date.now()}$.
     Let $l_{next} = \max(l_{local}, pt, remoteHlc.l)$.
     - If $l_{next} == l_{local} == remoteHlc.l$: $c_{next} = \max(c_{local}, remoteHlc.c) + 1$.
     - Else if $l_{next} == l_{local}$: $c_{next} = c_{local} + 1$.
     - Else if $l_{next} == remoteHlc.l$: $c_{next} = remoteHlc.c + 1$.
     - Else: $c_{next} = 0$.
     - Update local HLC state: $l_{local} = l_{next}$, $c_{local} = c_{next}$.
   - **`hlcCompare(a, b)`**:
     - Compare `a.l` vs `b.l`. If different, return `a.l - b.l`.
     - Compare `a.c` vs `b.c`. If different, return `a.c - b.c`.
     - Compare `a.node` vs `b.node` (lexicographical string comparison).

3. **DB Layer Integration (`js/db/core.js` & `js/db.js`)**:
   - Update `withMeta(record)` to attach `record.hlc = hlcNow(getDeviceId())` and set `record.updatedAt = record.hlc.l`.
   - Update `lwwWins(local, remote)` to use `hlcCompare(local.hlc, remote.hlc) > 0` with fallback to legacy `updatedAt` / `deviceId` comparison.

4. **Sync Layer Integration (`routes/sync.js` & `js/sync.js`)**:
   - In `/api/sync/push` and client `runSync()`, evaluate record precedence using `hlcCompare(remote.hlc, local.hlc) > 0` (or `lwwWins(remote, local)`).
   - On receiving remote records, invoke `hlcReceive(remote.hlc)` to advance node clock so local physical drift never causes data rejection.

### B. Backend Security & Payload Validation (`routes/sync.js`)
1. **Zod Schema Definition**:
   Define strict Zod schemas for incoming push payloads:
   ```javascript
   import { z } from 'zod';

   const HLCSchema = z.object({
     l: z.number().int().nonnegative(),
     c: z.number().int().nonnegative(),
     node: z.string().min(1)
   });

   const RecordSchema = z.object({
     id: z.union([z.string(), z.number()]),
     updatedAt: z.number().optional(),
     deviceId: z.string().optional(),
     hlc: HLCSchema.optional(),
     _deleted: z.boolean().optional()
   }).passthrough();

   const PushPayloadSchema = z.record(
     z.enum(['workouts', 'oneRM', 'bodyMetrics', 'events', 'settings', 'nutritionLogs', 'plannedWorkouts']),
     z.array(RecordSchema)
   );
   ```

2. **HTTP 400 Error Handling**:
   - Wrap POST `/api/sync/push` in schema validation:
     ```javascript
     const parseResult = PushPayloadSchema.safeParse(req.body);
     if (!parseResult.success) {
       return res.status(400).json({
         error: 'Invalid sync payload format',
         details: parseResult.error.issues
       });
     }
     ```

---

## 5. Verification Method

1. **Schema Validation Verification**:
   - Send HTTP POST requests with invalid bodies to `/api/sync/push`:
     - Empty object `{}`
     - Invalid JSON / non-object body
     - Unknown store name (e.g. `{ "maliciousStore": [] }`)
     - Store containing string instead of array (e.g. `{ "workouts": "invalid" }`)
   - Confirm server returns HTTP 400 Bad Request with JSON error response.

2. **Clock Skew & HLC Causality Verification**:
   - Unit test `hlcCompare` and `hlcReceive`:
     - Simulate Node A with skewed clock ($T + 10 \text{ min}$).
     - Node B writes record at $T$. Node A writes record at $T + 10 \text{ min}$.
     - Node B receives Node A's write, calls `hlcReceive`, advancing Node B's logical time.
     - Node B makes subsequent edit. Verify Node B's new HLC timestamp is strictly greater than Node A's skewed timestamp ($HLC_{B2} > HLC_{A1}$).
     - Verify Node B's update successfully overwrites Node A's stale update in CRDT sync.
