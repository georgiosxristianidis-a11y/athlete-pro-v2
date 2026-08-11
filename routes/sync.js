import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { logInfo, logError } from '../lib/logger.js';
import { hlcReceive } from '../js/shared/hlc.js';
import { lwwWins } from '../js/shared/lww.js';

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

const HLCSchema = z.object({
  l: z.number().int().nonnegative(),
  c: z.number().int().nonnegative(),
  node: z.string().min(1)
});

const RecordSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  key: z.string().optional(),
  updatedAt: z.number().optional(),
  deviceId: z.string().optional(),
  hlc: HLCSchema.optional(),
  _deleted: z.boolean().optional()
}).passthrough();

const ValidStoreNamesSet = new Set([
  'workouts',
  'oneRM',
  'bodyMetrics',
  'events',
  'settings',
  'nutritionLogs',
  'plannedWorkouts'
]);

const PushPayloadSchema = z.record(z.string(), z.array(RecordSchema)).refine(
  (data) => {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
    if (Object.getPrototypeOf(data) !== Object.prototype) return false;
    if (Object.prototype.hasOwnProperty.call(data, '__proto__')) return false;
    if (Object.getOwnPropertyNames(data).includes('__proto__')) return false;
    if (Object.prototype.hasOwnProperty.call(data, 'constructor')) return false;
    if (Object.getOwnPropertyNames(data).includes('constructor')) return false;
    return Object.keys(data).every(k => ValidStoreNamesSet.has(k));
  },
  { message: 'Invalid store name or structure in sync payload' }
);

// GET /api/sync/pull?since=123456789
router.get('/pull', async (req, res, next) => {
  try {
    const since = parseInt(req.query.since || '0', 10);
    const db = await loadDB();
    
    const changes = {};
    let hasChanges = false;

    for (const [storeName, records] of Object.entries(db)) {
      const updatedRecords = Object.values(records).filter(r => {
        const time = r.hlc?.l ?? r.updatedAt ?? r.timestamp ?? 0;
        return time > since;
      });
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
    if (
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body) ||
      Object.getPrototypeOf(req.body) !== Object.prototype ||
      Object.prototype.hasOwnProperty.call(req.body, '__proto__') ||
      Object.getOwnPropertyNames(req.body).includes('__proto__') ||
      Object.prototype.hasOwnProperty.call(req.body, 'constructor') ||
      Object.getOwnPropertyNames(req.body).includes('constructor')
    ) {
      return res.status(400).json({ error: 'Invalid sync payload format' });
    }

    const parseResult = PushPayloadSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid sync payload format',
        details: parseResult.error.issues
      });
    }

    const payload = parseResult.data;
    const db = await loadDB();
    let mergedCount = 0;

    for (const [storeName, records] of Object.entries(payload)) {
      if (!db[storeName]) db[storeName] = {};
      
      for (const remoteRecord of records) {
        const key = storeName === 'settings' ? remoteRecord.key : remoteRecord.id;
        if (!key) continue;

        if (remoteRecord.hlc) {
          hlcReceive(remoteRecord.hlc, 'server');
        }

        const localRecord = db[storeName][key];
        
        // CRDT Rule: Last Write Wins with HLC comparison
        if (!localRecord || lwwWins(remoteRecord, localRecord)) {
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
