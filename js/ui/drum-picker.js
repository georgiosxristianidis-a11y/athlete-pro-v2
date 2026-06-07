// @ts-check
const ITEM_H  = 36;
const VISIBLE = 3;
const W_STEP  = 2.5, W_MIN = 0,   W_MAX = 400;
const R_STEP  = 1,   R_MIN = 1,   R_MAX = 50;

/* key: `${type}-${ei}-${si}` → drum state */
const _drums = new Map();

export function initDrumPickers() {
  document.querySelectorAll('.drum-wrap:not([data-drum-init])').forEach(wrap => {
    wrap.dataset.drumInit = '1';
    _buildDrum(wrap);
  });
}

export function syncDrumUI(type, ei, si, value) {
  const key = `${type}-${ei}-${si}`;
  const d   = _drums.get(key);
  if (!d) return;
  const idx = Math.max(0, Math.min(d.count - 1, Math.round((value - d.min) / d.step)));
  if (idx === d.lastIdx) return;
  d.syncing      = true;
  d.track.scrollTop = idx * ITEM_H;
  d.lastIdx      = idx;
  _updateActive(d.track, idx);
  setTimeout(() => { d.syncing = false; }, 50);
}

function _buildDrum(wrap) {
  const type    = wrap.dataset.type;           // 'w' | 'r'
  const ei      = parseInt(wrap.dataset.ei);
  const si      = parseInt(wrap.dataset.si);
  const step    = parseFloat(wrap.dataset.step) || (type === 'w' ? W_STEP : R_STEP);
  const min     = type === 'w' ? W_MIN  : R_MIN;
  const max     = type === 'w' ? W_MAX  : R_MAX;
  const key     = `${type}-${ei}-${si}`;
  const current = parseFloat(wrap.dataset.value) || (type === 'r' ? 10 : 0);
  const track   = wrap.querySelector('.drum-track');
  if (!track) return;

  const count = Math.round((max - min) / step) + 1;
  const frag  = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const v   = +(min + i * step).toFixed(1);
    const div = document.createElement('div');
    div.className   = 'drum-item';
    div.textContent = type === 'w'
      ? (v % 1 === 0 ? String(v) : v.toFixed(1))
      : String(v);
    frag.appendChild(div);
  }
  track.appendChild(frag);

  const pad = Math.floor(VISIBLE / 2) * ITEM_H;   // 36px top + bottom
  track.style.paddingTop    = pad + 'px';
  track.style.paddingBottom = pad + 'px';

  const initIdx = Math.max(0, Math.min(count - 1, Math.round((current - min) / step)));
  track.scrollTop = initIdx * ITEM_H;

  const d = { track, step, min, max, count, lastIdx: initIdx, syncing: false };
  _drums.set(key, d);
  _updateActive(track, initIdx);

  /* Haptic + live highlight on each item crossing */
  let _hapticIdx = initIdx;
  track.addEventListener('scroll', () => {
    const cur = Math.round(track.scrollTop / ITEM_H);
    if (cur !== _hapticIdx) {
      _hapticIdx = cur;
      if (navigator.vibrate) navigator.vibrate(4);
      _updateActive(track, cur);
    }
  }, { passive: true });

  /* Settle: fire state update once scroll stops */
  const onSettle = () => {
    if (d.syncing) return;
    const rawIdx = Math.round(track.scrollTop / ITEM_H);
    const newIdx = Math.max(0, Math.min(count - 1, rawIdx));
    if (newIdx === d.lastIdx) return;
    const diff  = newIdx - d.lastIdx;
    d.lastIdx   = newIdx;
    const delta = diff * step;
    if (type === 'w') window.Workout?.stepWeight(ei, si, delta, true);
    else              window.Workout?.stepReps(ei, si, diff, true);
  };

  if ('onscrollend' in window) {
    track.addEventListener('scrollend', onSettle, { passive: true });
  } else {
    let t;
    track.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(onSettle, 80);
    }, { passive: true });
  }
}

function _updateActive(track, activeIdx) {
  track.querySelectorAll('.drum-item').forEach((el, i) => {
    el.classList.toggle('drum-item--active', i === activeIdx);
  });
}
