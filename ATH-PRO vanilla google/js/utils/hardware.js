let wakeLock = null;

export const Hardware = {
  vibrate(pattern = [15]) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  },
  tap() { this.vibrate([10]); },
  success() { this.vibrate([15]); },
  error() { this.vibrate([50, 50, 50]); },
  timerDone() { this.vibrate([30, 50, 30, 50, 50]); },
  async keepScreenAwake() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        document.addEventListener('visibilitychange', this._handleVisibilityChange);
      } catch (err) {}
    }
  },
  releaseScreen() {
    if (wakeLock !== null) {
      wakeLock.release().then(() => { wakeLock = null; });
      document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    }
  },
  _handleVisibilityChange: async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
    }
  }
};
