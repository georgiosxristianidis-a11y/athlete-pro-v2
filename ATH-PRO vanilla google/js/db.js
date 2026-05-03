import { LocalCrypto } from './crypto.js';

export const DB = {
  db: null,
  Workouts: {
    getAll: async () => {
      if (!DB.db) return [];
      return new Promise((resolve, reject) => {
        const tx = DB.db.transaction('workouts', 'readonly');
        const store = tx.objectStore('workouts');
        const req = store.getAll();
        req.onsuccess = async () => {
          const records = req.result;
          const decrypted = await Promise.all(records.map(async r => {
            if (r.payload && r.payload._enc) {
              const dec = await LocalCrypto.decrypt(r.payload);
              return { ...dec, id: r.id };
            }
            return r;
          }));
          resolve(decrypted);
        };
        req.onerror = () => reject(req.error);
      });
    },
    getLast: async (n) => {
      const all = await DB.Workouts.getAll();
      return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, n);
    },
    save: async (workout) => {
      if (!DB.db) return;
      if (!workout.id) workout.id = 'wk-' + Date.now();
      const encryptedPayload = await LocalCrypto.encrypt(workout);
      const record = { id: workout.id, timestamp: workout.timestamp || Date.now(), type: workout.type, payload: encryptedPayload };
      return new Promise((resolve, reject) => {
        const tx = DB.db.transaction('workouts', 'readwrite');
        const store = tx.objectStore('workouts');
        const req = store.put(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
  },
  OneRM: {
    update: async (exercise, weight, reps) => {
      console.log('OneRM updated:', exercise, weight, reps);
    }
  },
  Events: {
    log: async (type, data) => {
      console.log('Event logged:', type, data);
    }
  },
  SyncQueue: {
    getAll: async () => {
      if (!DB.db) return [];
      return new Promise((resolve, reject) => {
        const tx = DB.db.transaction('syncQueue', 'readonly');
        const store = tx.objectStore('syncQueue');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    add: async (item) => {
      if (!DB.db) return;
      return new Promise((resolve, reject) => {
        const tx = DB.db.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        const req = store.add(item);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    remove: async (id) => {
      if (!DB.db) return;
      return new Promise((resolve, reject) => {
        const tx = DB.db.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }
};

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('AthleteProDB', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('workouts')) {
        db.createObjectStore('workouts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => {
      DB.db = e.target.result;
      resolve(DB.db);
    };
    req.onerror = (e) => {
      reject(e.target.error);
    };
  });
}
