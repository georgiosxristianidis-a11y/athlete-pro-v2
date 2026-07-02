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

/**
 * Flush the current scroll position of a drum into State immediately.
 * Call before reading set.weight/reps in toggleSet to avoid race where
 * the user taps "done" before scrollend/80ms settle fires.
 */
export function flushDrum(type, ei, si) {
  const key = `${type}-${ei}-${si}`;
  const d   = _drums.get(key);
  if (!d) return;
  // Don't read a hidden/collapsed drum (scrollTop would be a phantom 0).
  if (!d.track.clientHeight) return;
  // BUG-DRUM-0: display:none resets scrollTop to 0 and the browser does NOT
  // restore it on reshow, so even a laid-out track can hold a phantom
  // position. Only trust scrollTop after a genuine user scroll (dirty) —
  // otherwise the stale lastIdx turns the reset into a huge negative delta
  // and the set logs as «0×1».
  if (!d.dirty) return;
  d.dirty = false;
  const rawIdx = Math.round(d.track.scrollTop / ITEM_H);
  const newIdx = Math.max(0, Math.min(d.count - 1, rawIdx));
  if (newIdx === d.lastIdx) return;
  const diff  = newIdx - d.lastIdx;
  d.lastIdx   = newIdx;
  const delta = diff * d.step;
  if (type === 'w') window.Workout?.stepWeight(ei, si, delta);
  else              window.Workout?.stepReps(ei, si, diff);
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

  // Pad so the selected item centres in the wrap regardless of its height.
  // 5-1 shrank the wrap to 72px (2 rows); a fixed (VISIBLE/2)*ITEM_H pad
  // assumed the old 108px window and pushed the active value out of the
  // selection band → it rendered clipped/near-invisible. ITEM_H/2 keeps one
  // item dead-centre and is independent of layout/visibility state.
  const pad = ITEM_H / 2;
  track.style.paddingTop    = pad + 'px';
  track.style.paddingBottom = pad + 'px';

  const initIdx = Math.max(0, Math.min(count - 1, Math.round((current - min) / step)));
  track.scrollTop = initIdx * ITEM_H;

  // dirty — scrollTop has been moved by a real user scroll since the last
  // commit; only then may flushDrum/onSettle derive a delta from it.
  const d = { track, step, min, max, count, lastIdx: initIdx, syncing: false, dirty: false };
  _drums.set(key, d);
  _updateActive(track, initIdx);

  /* Haptic + live highlight on each item crossing */
  let _hapticIdx = initIdx;
  track.addEventListener('scroll', () => {
    // A hidden track only "scrolls" when the browser resets it (display:none
    // → scrollTop 0): that read is poison, drop trust instead of marking dirty.
    if (!track.clientHeight) { d.dirty = false; return; }
    if (!d.syncing) d.dirty = true;
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
    // Guard: completing a set hides the drum (`.set-done .drum-wrap{display:none}`),
    // which collapses scrollTop to 0 and fires a stray scroll/scrollend. Without
    // this bail, onSettle would read idx 0, compute a huge negative delta against
    // lastIdx, and zero out the just-logged weight. A laid-out drum always has
    // clientHeight > 0, so this only blocks phantom settles from hidden tracks.
    if (!track.clientHeight) return;
    // BUG-DRUM-0: same trust rule as flushDrum — a settle without a genuine
    // user scroll means the position is a display:none reset, not an input.
    if (!d.dirty) return;
    d.dirty = false;
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

  // BUG-DRUM-0 heal: display:none zeroes scrollTop and the browser never
  // brings it back, so a reshown drum sits at 0/1 while State still holds the
  // real weight/reps. When the track regains layout (set un-done, card
  // expand, screen return, hidden build), restore the position from lastIdx —
  // it mirrors State and is the source of truth.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (!track.clientHeight) return;
      const want = d.lastIdx * ITEM_H;
      if (Math.abs(track.scrollTop - want) < 1) return;
      d.syncing = true;
      d.dirty   = false;
      track.scrollTop = want;
      _updateActive(track, d.lastIdx);
      setTimeout(() => { d.syncing = false; }, 50);
    }).observe(track);
  }
}

function _updateActive(track, activeIdx) {
  track.querySelectorAll('.drum-item').forEach((el, i) => {
    el.classList.toggle('drum-item--active', i === activeIdx);
  });
}
