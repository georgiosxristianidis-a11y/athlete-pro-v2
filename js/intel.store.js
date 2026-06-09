// @ts-check

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
