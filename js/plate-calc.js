/* ════════════════════════════════════════════════════════
   Block 10.1 — Plate Calculator  v1.1  |  Athlete Pro
   FIX: correct plate mirroring on left side
   ════════════════════════════════════════════════════════ */

export const PlateCalc = (() => {

  const PLATES = [
    [25, '#c62828', '#fff', 88, 17],
    [20, '#1565c0', '#fff', 78, 15],
    [15, '#f9a825', '#000', 70, 13],
    [10, '#2e7d32', '#fff', 62, 11],
    [5, '#e0e0e0', '#000', 50, 9],
    [2.5, '#c62828', '#fff', 40, 7],
    [1.25, '#9e9e9e', '#000', 32, 5],
  ];
  const BAR_OPTS = [20, 15, 10];
  const BAR_KEY = 'ap-bar-weight';
  let _weight = 100,
    _barWeight = 20,
    _overlay = null;

  function _calc(total, bar) {
    let rem = Math.round(((total - bar) / 2) * 100) / 100;
    if (rem < 0) return { plates: [], remainder: 0, error: `Below bar weight (${bar} kg)` };
    const result = [];
    for (const [w, bg, fg, h, pw] of PLATES) {
      const n = Math.floor(rem / w + 0.0001);
      if (n > 0) {
        result.push({ w, bg, fg, h, pw, n });
        rem = Math.round((rem - n * w) * 100) / 100;
      }
    }
    return { plates: result, remainder: rem, error: null };
  }

  /* ── plate HTML helper ── */
  function _toHTML(arr) {
    return arr
      .flatMap((p) =>
        Array.from(
          { length: p.n },
          () =>
            `<div class="pc-plate" style="height:${p.h}px;width:${p.pw}px;background:${p.bg};color:${p.fg}">${p.h >= 50 ? p.w : ''}</div>`
        )
      )
      .join('');
  }

  function _render() {
    const weightEl = document.getElementById('pc-weight-val');
    const barbellEl = document.getElementById('pc-barbell');
    const textEl = document.getElementById('pc-text');
    if (!weightEl || !barbellEl || !textEl) return;

    weightEl.textContent = Number.isInteger(_weight) ? _weight : _weight.toFixed(1);
    document
      .querySelectorAll('.pc-bar-opt')
      .forEach((b) => b.classList.toggle('active', parseFloat(b.dataset.w) === _barWeight));

    const { plates, remainder, error } = _calc(_weight, _barWeight);
    if (error) {
      barbellEl.innerHTML = `<p class="pc-msg pc-error">${error}</p>`;
      textEl.innerHTML = '';
      return;
    }

    if (plates.length === 0) {
      barbellEl.innerHTML = `<p class="pc-msg">Bar only — no plates needed</p>`;
    } else {
      /*
        MIRRORING FIX:
        Right side: DOM order = [largest→smallest], flex-row  → largest is closest to collar ✓
        Left  side: DOM order = [largest→smallest], flex-row-reverse → largest ends up closest to collar ✓
        Both sides use the SAME array order; CSS row-reverse handles the visual flip.
      */
      barbellEl.innerHTML =
        `<div class="pc-side pc-side-l">${_toHTML(plates)}</div>` +
        `<div class="pc-collar"></div>` +
        `<div class="pc-shaft"></div>` +
        `<div class="pc-collar"></div>` +
        `<div class="pc-side pc-side-r">${_toHTML(plates)}</div>`;
    }

    if (!plates.length) {
      textEl.innerHTML = '';
      return;
    }
    const perSide = plates.reduce((s, p) => s + p.w * p.n, 0);
    textEl.innerHTML = `
      <div class="pc-row"><span class="pc-lbl">Per side</span><span class="pc-val">${plates.map((p) => `${p.n}×${p.w}`).join(' + ')} kg</span></div>
      <div class="pc-row"><span class="pc-lbl">Per side total</span><span class="pc-val">${perSide} kg</span></div>
      <div class="pc-row"><span class="pc-lbl">Total on bar</span><span class="pc-val">${_weight} kg</span></div>
      ${remainder > 0.05 ? `<p class="pc-warn">⚠ ${remainder} kg unaccounted — add 1.25 kg plates</p>` : ''}`;
  }

  function stepWeight(delta) {
    _weight = Math.max(_barWeight, Math.round((_weight + delta) * 100) / 100);
    navigator.vibrate?.([15]);
    _render();
  }
  function setBar(kg) {
    _barWeight = kg;
    localStorage.setItem(BAR_KEY, String(kg));
    if (_weight < _barWeight) _weight = _barWeight;
    _render();
  }
  function close() {
    if (!_overlay) return;
    const el = _overlay;
    _overlay = null;
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 300);
  }
  function open(weight) {
    _barWeight = parseFloat(localStorage.getItem(BAR_KEY)) || 20;
    _weight = Math.max(_barWeight, weight || _barWeight);
    if (_overlay) _overlay.remove();
    _build();
    document.body.appendChild(_overlay);
    requestAnimationFrame(() => _overlay.classList.add('visible'));
    _render();
    navigator.vibrate?.([20]);
  }

  function _build() {
    _overlay = document.createElement('div');
    _overlay.className = 'modal-overlay pc-overlay';
    _overlay.addEventListener('click', (e) => {
      if (e.target === _overlay) close();
    });
    const barBtns = BAR_OPTS.map(
      (w) =>
        `<button class="pc-bar-opt${w === _barWeight ? ' active' : ''}" data-w="${w}"
               onclick="PlateCalc.setBar(${w})">${w} kg</button>`
    ).join('');
    _overlay.innerHTML = `
      <div class="modal-sheet pc-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <span class="modal-title">Plate Calculator</span>
          <button class="btn-icon-sm" onclick="PlateCalc.close()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                 stroke-linecap="round" width="16" height="16"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="pc-bar-row"><span class="pc-section-lbl">Bar weight</span><div class="pc-bar-opts">${barBtns}</div></div>
        <div class="pc-weight-row">
          <button class="pc-step-btn" onclick="PlateCalc.stepWeight(-2.5)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" width="20" height="20"><path d="M5 12h14"/></svg>
          </button>
          <div class="pc-weight-display">
            <span id="pc-weight-val" class="pc-weight-num">100</span>
            <span class="pc-weight-unit">kg</span>
          </div>
          <button class="pc-step-btn" onclick="PlateCalc.stepWeight(2.5)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" width="20" height="20"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
        <div class="pc-divider"></div>
        <div id="pc-barbell" class="pc-barbell-wrap"></div>
        <div id="pc-text"    class="pc-text-wrap"></div>
        <p class="pc-hint">Step: ±2.5 kg · Tap bar weight to change</p>
      </div>`;
  }

  return { open, close, stepWeight, setBar };
})();
