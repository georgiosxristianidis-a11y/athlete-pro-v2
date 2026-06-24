import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

let db;

before(async () => {
  db = await import('../js/db.js');
  await db.DB.clearAll();
});

afterEach(async () => {
  await db.DB.clearAll();
});

test('Soft Delete Coverage (Tombstones)', async (t) => {
  await t.test('1. delete(id) -> record remains with _deleted: true, full record is intact', async () => {
    const wId = await db.DB.Workouts.save({ type: 'push', tonnage: 1000, exercises: [{name: 'bench', sets: []}] });
    await db.DB.Workouts.delete(wId);
    
    // Check raw store to ensure the record is still there
    const raw = await db.DB._getRaw('workouts', wId);
    assert.ok(raw, 'Raw record should exist');
    assert.equal(raw._deleted, true, 'Record should have _deleted flag');
    assert.equal(raw.tonnage, 1000, 'Tonnage should remain intact');
    assert.deepEqual(raw.exercises, [{name: 'bench', sets: []}], 'Exercises should remain intact');
  });

  await t.test('2. aggregations and queries ignore tombstones', async () => {
    const now = Date.now();
    await db.DB.Workouts.save({ type: 'push', timestamp: now - 1000, tonnage: 100 });
    const id2 = await db.DB.Workouts.save({ type: 'pull', timestamp: now, tonnage: 200 });
    const idToDel = await db.DB.Workouts.save({ type: 'pull', timestamp: now + 1000, tonnage: 400 });
    
    await db.DB.Workouts.delete(idToDel);

    const all = await db.DB.Workouts.getAll();
    assert.equal(all.length, 2, 'getAll should return 2 active records');
    assert.ok(!all.find(w => w.id === idToDel), 'getAll should not return deleted record');

    const last = await db.DB.Workouts.getLast(5);
    assert.equal(last.length, 2, 'getLast should return 2 active records');
    assert.ok(!last.find(w => w.id === idToDel), 'getLast should not return deleted record');

    const lastPull = await db.DB.Workouts.getLastByType('pull');
    assert.equal(lastPull.id, id2, 'getLastByType should skip deleted record and find the previous one');

    const ppl = await db.DB.Workouts.pplTonnage();
    assert.equal(ppl.push, 100);
    assert.equal(ppl.pull, 200); // 400 is skipped

    const wVol = await db.DB.Workouts.weeklyVolume();
    assert.equal(wVol, 300);

    const mVol = await db.DB.Workouts.monthlyVolume();
    assert.equal(mVol, 300);

    const mCount = await db.DB.Workouts.monthlyCount();
    assert.equal(mCount, 2);
  });

  await t.test('3. deduplicate() -> duplicate is soft-deleted', async () => {
    const ts = Date.now();
    const id1 = await db.DB.Workouts.save({ type: 'legs', timestamp: ts, tonnage: 500 });
    const id2 = await db.DB.Workouts.save({ type: 'legs', timestamp: ts, tonnage: 500 });
    
    const removed = await db.DB.Workouts.deduplicate();
    assert.equal(removed, 1, 'Should remove 1 duplicate');
    
    const all = await db.DB.Workouts.getAll();
    assert.equal(all.length, 1, 'Only 1 active record remains');
    
    const raw1 = await db.DB._getRaw('workouts', id1);
    const raw2 = await db.DB._getRaw('workouts', id2);
    
    const deletedCount = (raw1._deleted ? 1 : 0) + (raw2._deleted ? 1 : 0);
    assert.equal(deletedCount, 1, 'Exactly one record should have _deleted: true');
    
    const deletedRecord = raw1._deleted ? raw1 : raw2;
    assert.equal(deletedRecord.tonnage, 500, 'Soft-deleted duplicate should keep its full content');
  });

  await t.test('4. _delRaw writes tombstone (settings works without crashing)', async () => {
    await db.DB.Settings.set('ap-test', 'value');
    await db.DB._delRaw('settings', 'ap-test');
    
    const raw = await db.DB._getRaw('settings', 'ap-test');
    assert.ok(raw);
    assert.equal(raw._deleted, true);
    assert.equal(raw.key, 'ap-test', 'Should use "key" as the primary key field for settings store');
  });

  await t.test('5. _getRaw returns the tombstone (LWW metadata intact)', async () => {
    const id = await db.DB.Workouts.save({ type: 'push', tonnage: 50 });
    await db.DB.Workouts.delete(id);
    
    const raw = await db.DB._getRaw('workouts', id);
    assert.ok(raw);
    assert.equal(raw._deleted, true);
    assert.equal(raw.type, 'push', 'Original data should be intact');
    assert.ok(raw.updatedAt, 'updatedAt metadata should exist');
    assert.ok(raw.deviceId, 'deviceId metadata should exist');
  });
});
