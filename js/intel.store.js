// @ts-check

import { DB } from './db.js';
import { readiness } from './intel.engine.js';

/**
 * Индекс готовности по локальной истории (INTEL-2).
 * Тонкий адаптер: единственное место, где движок встречается с IndexedDB —
 * сам движок остаётся чистым и тестируется без базы.
 * Отказ базы — не повод падать экрану: возвращаем честный пустой индекс.
 * @param {{ now?: number }} [opts]
 * @returns {Promise<import('./intel.engine.js').Readiness>}
 */
export async function fetchReadiness(opts = {}) {
  const workouts = await DB.Workouts.getAll().catch(() => []);
  return readiness(workouts, opts);
}

/**
 * IntelStore — Athlete Pro
 * State management for the Neural Command Center.
 */
export const IntelStore = (() => {
  const LOGS_KEY = 'ap-intel-logs';
  let _logs = [];
  let _status = 'SYSTEM STANDBY';
  let _loading = false;

  function init() {
    try {
      _logs = JSON.parse(localStorage.getItem(LOGS_KEY) || '[]');
    } catch { _logs = []; }
  }

  /**
   * Add a log entry.
   * @param {'SYS'|'DB'|'AI'|'USER'} type 
   * @param {string} text 
   */
  function addLog(type, text) {
    const log = { type, text, time: new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
    _logs = [log, ..._logs].slice(0, 50);
    localStorage.setItem(LOGS_KEY, JSON.stringify(_logs));
    window.dispatchEvent(new CustomEvent('ap-intel-log', { detail: log }));
  }

  return {
    init,
    addLog,
    getLogs: () => _logs,
    getStatus: () => _status,
    setStatus: (s) => { 
      _status = s; 
      window.dispatchEvent(new CustomEvent('ap-intel-status')); 
    },
    isLoading: () => _loading,
    setLoading: (l) => { 
      _loading = l; 
      window.dispatchEvent(new CustomEvent('ap-intel-loading')); 
    }
  };
})();
