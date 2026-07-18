// @ts-check
import { flag } from '../flags.js';

const ITEM_H  = 36;
const VISIBLE = 3;
const W_STEP  = 2.5, W_MIN = 0,   W_MAX = 400;
const R_STEP  = 1,   R_MIN = 1,   R_MAX = 50;

/* PERF-DRUM (flag 'drum-virtual'): render a window of items around the
   current value instead of the full range (161 weight + 50 reps per set row
   was 86% of the workout screen's DOM). Spacer divs keep the track's scroll
   height identical, so scrollTop ↔ index math — and every BUG-DRUM-0 trust
   guard built on it — is untouched.
   Field-failed twice (weight zeroed): it re-centres the window from the
   `scroll` tick, and mandatory snap re-evaluates on that mid-gesture DOM
   mutation, yanking scrollTop. Kept OFF — do not resurrect.

   DRUM-PERF-2 (flag 'drum-window'): same spacer/window DOM cap, but the
   window is rebuilt ONLY at rest — scrollend commit, programmatic seek,
   reshow heal — never from a scroll tick. A fling therefore runs on a frozen
   snap grid; its reach per gesture is the window edge (±20 items = ±50 kg),
   after which the settle re-centres and the next fling continues. Contract
   suite: test/drum-contract.test.js. */
const VIRT_WINDOW = 15; // drum-virtual: rendered items around the active index
const VIRT_EDGE   = 3;  // drum-virtual: re-centre when active nears the edge
const WIN_SIZE    = 41; // drum-window: ±20 items around the current value

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
  // Virtualization tripwire: a rest position inside a spacer is impossible
  // (mandatory snap only lands on rendered items) — the position is corrupt,
  // heal back to State instead of committing a garbage delta.
  if (_healIfOutsideWindow(d, rawIdx)) return;
  const newIdx = Math.max(0, Math.min(d.count - 1, rawIdx));
  if (newIdx === d.lastIdx) return;
  const diff  = newIdx - d.lastIdx;
  d.lastIdx   = newIdx;
  const delta = diff * d.step;
  if (type === 'w') window.Workout?.stepWeight(ei, si, delta);
  else              window.Workout?.stepReps(ei, si, diff);
}

/* Shared corruption tripwire for flushDrum/onSettle: scrollTop resolves to an
   index outside the rendered window → the write/scroll never landed on a real
   item. Restore the position State knows about and report «healed». */
function _healIfOutsideWindow(d, rawIdx) {
  if (!(d.virt || d.windowed) || (rawIdx >= d.winStart && rawIdx <= d.winEnd)) return false;
  d.syncing = true;
  _seekTo(d, d.lastIdx);
  _updateActive(d, d.lastIdx);
  setTimeout(() => { d.syncing = false; }, 50);
  return true;
}

export function syncDrumUI(type, ei, si, value) {
  const key = `${type}-${ei}-${si}`;
  const d   = _drums.get(key);
  if (!d) return;
  const idx = Math.max(0, Math.min(d.count - 1, Math.round((value - d.min) / d.step)));
  if (idx === d.lastIdx) return;
  d.syncing      = true;
  _seekTo(d, idx);
  d.lastIdx      = idx;
  _updateActive(d, idx);
  setTimeout(() => { d.syncing = false; }, 50);
}

/* Programmatic scroll that survives virtualization (P0 «0 kg» root cause).
   With scroll-snap-type:mandatory the browser clamps any scrollTop write to
   the nearest snap point, and a virtualized track only has snap points inside
   the rendered window — a write outside it silently lands on the window's
   edge item while the caller records lastIdx = target. Every later delta is
   then computed from a lie and the weight drifts, down to 0. Render the
   window around the target FIRST so its snap point exists, then write, then
   verify the readback (snap may still round by a sub-pixel). */
function _seekTo(d, idx) {
  if (d.virt || d.windowed) _renderWindow(d, idx);
  const want = idx * ITEM_H;
  d.track.scrollTop = want;
  if (Math.abs(d.track.scrollTop - want) > 1) d.track.scrollTop = want;
}

function _buildDrum(wrap) {
  const type    = wrap.dataset.type;           // 'w' | 'r'
  const ei      = parseInt(wrap.dataset.ei);
  const si      = parseInt(wrap.dataset.si);
  const step    = parseFloat(wrap.dataset.step) || (type === 'w' ? W_STEP : R_STEP);
  const min     = type === 'w' ? W_MIN  : R_MIN;
  const key     = `${type}-${ei}-${si}`;
  const current = parseFloat(wrap.dataset.value) || (type === 'r' ? 10 : 0);
  // Optional per-drum cap (data-max), e.g. reps 20 for strength / 90 for core.
  // Never cap below the current value — a restored session with reps above the
  // cap must keep displaying honestly, not clamp State↔UI apart.
  const capMax  = parseFloat(wrap.dataset.max);
  const max     = type === 'w' ? W_MAX : (capMax ? Math.max(capMax, current) : R_MAX);
  const track   = wrap.querySelector('.drum-track');
  if (!track) return;

  const count   = Math.round((max - min) / step) + 1;
  const initIdx = Math.max(0, Math.min(count - 1, Math.round((current - min) / step)));
  const virt    = flag('drum-virtual');
  // drum-virtual (if someone force-enables it on-device) wins over drum-window
  // so the two window strategies can never run on one track at once.
  const windowed = !virt && flag('drum-window');

  // dirty — scrollTop has been moved by a real user scroll since the last
  // commit; only then may flushDrum/onSettle derive a delta from it.
  const d = { track, type, step, min, count, lastIdx: initIdx, syncing: false, dirty: false,
              virt, windowed, winSize: virt ? VIRT_WINDOW : WIN_SIZE,
              winStart: 0, winEnd: -1, items: [], topPad: null, botPad: null,
              activeIdx: initIdx, activeEl: null };

  if (virt || windowed) {
    d.topPad = document.createElement('div');
    d.topPad.className = 'drum-spacer';
    d.botPad = document.createElement('div');
    d.botPad.className = 'drum-spacer';
    track.appendChild(d.topPad);
    track.appendChild(d.botPad);
    _renderWindow(d, initIdx);
  } else {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const div = document.createElement('div');
      div.className   = 'drum-item';
      div.textContent = _label(type, +(min + i * step).toFixed(1));
      frag.appendChild(div);
    }
    track.appendChild(frag);
  }

  // Pad so the selected item centres in the wrap regardless of its height.
  // 5-1 shrank the wrap to 72px (2 rows); a fixed (VISIBLE/2)*ITEM_H pad
  // assumed the old 108px window and pushed the active value out of the
  // selection band → it rendered clipped/near-invisible. ITEM_H/2 keeps one
  // item dead-centre and is independent of layout/visibility state.
  const pad = ITEM_H / 2;
  track.style.paddingTop    = pad + 'px';
  track.style.paddingBottom = pad + 'px';

  track.scrollTop = initIdx * ITEM_H;

  _drums.set(key, d);
  _updateActive(d, initIdx);

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
      _updateActive(d, cur);
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
    // Same virtualization tripwire as flushDrum — never commit a position
    // that resolves into a spacer.
    if (_healIfOutsideWindow(d, rawIdx)) return;
    const newIdx = Math.max(0, Math.min(count - 1, rawIdx));
    if (newIdx === d.lastIdx) return;
    const diff  = newIdx - d.lastIdx;
    d.lastIdx   = newIdx;
    const delta = diff * step;
    if (type === 'w') window.Workout?.stepWeight(ei, si, delta, true);
    else              window.Workout?.stepReps(ei, si, diff, true);
    // DRUM-PERF-2: the drum is at rest on a committed snap point — the only
    // moment a window rebuild is snap-safe. Re-apply the active highlight:
    // the rebuild created fresh nodes and no further scroll tick will come.
    // (flushDrum deliberately does NOT re-centre: its scroll may still be in
    // flight; the next settle or the ResizeObserver heal covers it.)
    if (d.windowed) { _renderWindow(d, newIdx); _updateActive(d, newIdx); }
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
      _seekTo(d, d.lastIdx);
      _updateActive(d, d.lastIdx);
      setTimeout(() => { d.syncing = false; }, 50);
    }).observe(track);
  }
}

/** @param {'w'|'r'} type @param {number} v */
function _label(type, v) {
  return type === 'w'
    ? (v % 1 === 0 ? String(v) : v.toFixed(1))
    : String(v);
}

/* Rebuild the rendered window centred on `centerIdx`. Spacer heights keep the
   total scroll height constant, so an in-flight scroll position survives the
   swap and scroll-snap still lands on a real item. */
function _renderWindow(d, centerIdx) {
  const size  = d.winSize;
  const start = Math.max(0, Math.min(centerIdx - (size >> 1), d.count - size));
  const end   = Math.min(d.count - 1, start + size - 1);
  if (start === d.winStart && end === d.winEnd) return;
  // Mandatory snap re-evaluates on every DOM mutation and may yank scrollTop
  // to a snap point of the OLD window (observed collapsing to 0 → «0 kg»).
  // Insert the new items before removing the old ones so the track never
  // passes through a snap-point-free state, then restore the position if the
  // browser still moved it (>1px = beyond snap rounding).
  const st   = d.track.scrollTop;
  const frag = document.createDocumentFragment();
  const items = [];
  for (let i = start; i <= end; i++) {
    const div = document.createElement('div');
    div.className   = 'drum-item';
    div.textContent = _label(d.type, +(d.min + i * d.step).toFixed(1));
    items.push(div);
    frag.appendChild(div);
  }
  d.track.insertBefore(frag, d.botPad);
  for (const el of d.items) d.track.removeChild(el);
  d.items    = items;
  d.activeEl = null;
  d.topPad.style.height = start * ITEM_H + 'px';
  d.botPad.style.height = (d.count - 1 - end) * ITEM_H + 'px';
  d.winStart = start;
  d.winEnd   = end;
  if (Math.abs(d.track.scrollTop - st) > 1) d.track.scrollTop = st;
}

function _updateActive(d, activeIdx) {
  d.activeIdx = activeIdx;
  if (d.virt || d.windowed) {
    // Address by index — no querySelectorAll per scroll tick.
    // drum-virtual re-centres from here, i.e. DURING the gesture — the exact
    // mutation-under-mandatory-snap that corrupted positions in the field.
    // drum-window never touches the DOM on a scroll tick; an index that has
    // drifted past the frozen window simply shows no highlight until snap
    // pulls it back onto a rendered item.
    if (d.virt &&
        ((activeIdx < d.winStart + VIRT_EDGE && d.winStart > 0) ||
         (activeIdx > d.winEnd - VIRT_EDGE && d.winEnd < d.count - 1))) {
      _renderWindow(d, activeIdx);
    }
    if (d.activeEl) d.activeEl.classList.remove('drum-item--active');
    const el = d.items[activeIdx - d.winStart];
    if (el) el.classList.add('drum-item--active');
    d.activeEl = el || null;
    return;
  }
  d.track.querySelectorAll('.drum-item').forEach((el, i) => {
    el.classList.toggle('drum-item--active', i === activeIdx);
  });
}
