let _sessionInterval = null;

export const Timer = {
  start: (onTick) => {
    clearInterval(_sessionInterval);
    _sessionInterval = setInterval(() => {
      const stateStr = localStorage.getItem('ap-active-session');
      if (stateStr) {
        const state = JSON.parse(stateStr);
        if (state.startedAt) {
          const sec = Math.floor((Date.now() - state.startedAt) / 1000);
          if (onTick) onTick(sec);
        }
      }
    }, 1000);
  },
  stop: () => {
    clearInterval(_sessionInterval);
  },
  pause: () => {
    clearInterval(_sessionInterval);
  },
  reset: () => {
    clearInterval(_sessionInterval);
  },
  seconds: () => {
    const stateStr = localStorage.getItem('ap-active-session');
    if (stateStr) {
      const state = JSON.parse(stateStr);
      if (state.startedAt) {
        return Math.floor((Date.now() - state.startedAt) / 1000);
      }
    }
    return 0;
  },
  restore: () => {
    // No-op, start handles it by reading from localStorage
  },
  format: (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
};
