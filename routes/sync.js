import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logInfo, logError } from '../lib/logger.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../data/sync.json');

// In-memory cache for fast sync
let dbCache = null;

async function loadDB() {
  if (dbCache) return dbCache;
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    dbCache = JSON.parse(data);
  } catch (err) {
    dbCache = { 
      workouts: {}, oneRM: {}, bodyMetrics: {}, events: {}, 
      settings: {}, nutritionLogs: {}, plannedWorkouts: {} 
    };
  }
  return dbCache;
}

async function saveDB() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  // Atomically write by using a temp file
  const tmpFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(dbCache));
  await fs.rename(tmpFile, DATA_FILE);
}

// GET /api/sync/pull?since=123456789
router.get('/pull', async (req, res, next) => {
  try {
    const since = parseInt(req.query.since || '0', 10);
    const db = await loadDB();
    
    const changes = {};
    let hasChanges = false;

    for (const [storeName, records] of Object.entries(db)) {
      const updatedRecords = Object.values(records).filter(r => r.updatedAt > since);
      if (updatedRecords.length > 0) {
        changes[storeName] = updatedRecords;
        hasChanges = true;
      }
    }

    res.json({ success: true, timestamp: Date.now(), changes: hasChanges ? changes : null });
  } catch (err) {
    next(err);
  }
});

// POST /api/sync/push
router.post('/push', async (req, res, next) => {
  try {
    const payload = req.body; // { workouts: [ ... ], settings: [ ... ] }
    const db = await loadDB();
    let mergedCount = 0;

    for (const [storeName, records] of Object.entries(payload)) {
      if (!db[storeName]) db[storeName] = {};
      
      for (const remoteRecord of records) {
        const key = storeName === 'settings' ? remoteRecord.key : remoteRecord.id;
        const localRecord = db[storeName][key];
        
        // CRDT Rule: Last Write Wins
        if (!localRecord || remoteRecord.updatedAt > localRecord.updatedAt) {
          db[storeName][key] = remoteRecord;
          mergedCount++;
        }
      }
    }

    if (mergedCount > 0) {
      await saveDB();
      logInfo(req, 'crdt_sync_push', `Merged ${mergedCount} records`);
    }

    res.json({ success: true, timestamp: Date.now(), merged: mergedCount });
  } catch (err) {
    logError(req, 'crdt_sync_failed', err.message);
    next(err);
  }
});

export default router;
