// @ts-check
/* ════════════════════════════════════════════════════════
   plate-calc.js — лист «Калькулятор блинов» (PLATE-1b)
   ────────────────────────────────────────────────────────
   Показывает, чем собрать вес на грифе. В подход ничего не пишет: вес
   подхода живёт на барабане, лист только считает и рисует. Арифметика и
   спек блинов — `shared/plate-math.js`, здесь одна отрисовка.

   Лист на рецепте `.sd-overlay` (MO-2): вход через @starting-style,
   выход через dismissOverlay.

   Кинетика (PLATE-1c). Хост анимации не пересоздаётся рендером (закон
   Motion п.6): скелет грифа строится один раз, блины диффятся по индексу —
   живой узел остаётся, заменённый и добавленный входят каскадом. Отскок —
   `.pc-kick` на постоянном `.pc-barbell`, ретриггер через getAnimations()
   (п.5, без reflow). Движение целиком в CSS, здесь ни одного rAF.
   ════════════════════════════════════════════════════════ */

import { t } from './locale.store.js';
import { esc, haptic, dismissOverlay } from './shared/utils.js';
import { fmtWeight } from './shared/format.js';
import { PLATE_SPEC, BAR_OPTIONS, loadPlates, stepLoadable, normalizeBar } from './shared/plate-math.js';

const BAR_KEY = 'ap-bar-weight';

/** Килограммы без округления до десятых: 1.25 не должно стать «1.3». */
const kg = (/** @type {number} */ n) => String(n);

/** Каскад: задержка блина = его место среди вошедших × шаг в CSS; дальше потолок. */
const CASCADE_MAX = 3;

const PLATE_BY_KG = new Map(PLATE_SPEC.map((p) => [p.kg, p]));

/**
 * Плоский список дисков на сторону, от внутреннего к внешнему.
 * @param {import('./shared/plate-math.js').PlateCount[]} plates
 * @returns {import('./shared/plate-math.js').PlateSpec[]}
 */
const flatPlates = (plates) =>
  plates.flatMap(({ kg: k, n }) =>
    Array.from({ length: n }, () => /** @type {import('./shared/plate-math.js').PlateSpec} */ (PLATE_BY_KG.get(k)))
  );

/** @param {import('./shared/plate-math.js').PlateSpec} p */
function makePlate(p) {
  const el = document.createElement('div');
  el.className = 'pc-plate';
  el.dataset.kg = String(p.kg);
  el.style.height = `${p.h}px`;
  el.style.width = `${p.w}px`;
  el.style.background = p.bg;
  el.style.color = p.fg;
  if (p.h >= 50) el.textContent = kg(p.kg);
  return el;
}

/**
 * Привести сторону грифа к списку дисков, не пересоздавая совпавшие по индексу.
 * Новые и заменённые узлы при `animate` получают вход, сдвинутый по порядку.
 * @param {HTMLElement} side
 * @param {import('./shared/plate-math.js').PlateSpec[]} specs
 * @param {boolean} animate
 */
function syncSide(side, specs, animate) {
  let first = -1;
  specs.forEach((p, i) => {
    const cur = /** @type {HTMLElement | undefined} */ (side.children[i]);
    if (cur && cur.dataset.kg === String(p.kg)) return;
    const el = makePlate(p);
    if (animate) {
      if (first < 0) first = i;
      el.style.setProperty('--pc-i', String(Math.min(i - first, CASCADE_MAX)));
      el.classList.add('pc-plate-in');
    }
    if (cur) cur.replaceWith(el);
    else side.appendChild(el);
  });
  while (side.children.length > specs.length) side.lastElementChild?.remove();
}

/**
 * Отскок грифа. Первый раз анимацию запускает класс; дальше живую перематываем
 * через getAnimations() (cancel + play), без `offsetWidth`. Анимация держит
 * `forwards`: иначе после конца getAnimations() её уже не вернёт.
 * @param {HTMLElement} host
 */
function kick(host) {
  if (!host.classList.contains('pc-kick')) {
    host.classList.add('pc-kick');
    return;
  }
  host.getAnimations?.().forEach((a) => {
    a.cancel();
    a.play();
  });
}

/** @param {import('./shared/plate-math.js').PlateCount[]} plates */
const sideList = (plates) => plates.map((p) => `${p.n}×${kg(p.kg)}`).join(' + ');

function readBar() {
  try {
    return normalizeBar(localStorage.getItem(BAR_KEY));
  } catch {
    return normalizeBar(null);
  }
}

function saveBar(/** @type {number} */ bar) {
  try {
    localStorage.setItem(BAR_KEY, String(bar));
  } catch {
    /* приватный режим: гриф живёт до закрытия листа */
  }
}

const SVG_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="18" height="18" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
const SVG_MINUS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="20" height="20" aria-hidden="true"><path d="M5 12h14"/></svg>`;
const SVG_PLUS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="20" height="20" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;

export const PlateCalc = (() => {
  /**
   * Открыть лист на весе `weight` кг (вес подхода с барабана). Уже открытый
   * лист не дублируется; закрывающийся не мешает открыть новый.
   * @param {number} weight
   */
  function open(weight) {
    if (document.querySelector('.pc-overlay:not([data-closing])')) return;

    let bar = readBar();
    let current = Number.isFinite(Number(weight)) ? Number(weight) : 0;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay sd-overlay pc-overlay';
    overlay.style.zIndex = '7000';

    const barButtons = BAR_OPTIONS.map(
      (w) =>
        `<button class="pc-bar-opt" type="button" data-bar="${w}" aria-pressed="${w === bar}">${kg(w)}</button>`
    ).join('');

    overlay.innerHTML = `
      <div class="modal-sheet pc-sheet" role="dialog" aria-label="${esc(t('plate.title'))}">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <div class="modal-title">${esc(t('plate.title'))}</div>
          <button class="btn-icon-sm" type="button" data-pc="close" aria-label="${esc(t('plate.close'))}">${SVG_CLOSE}</button>
        </div>
        <div class="pc-bar-row">
          <span class="pc-lbl">${esc(t('plate.bar'))}, ${esc(t('plate.unit'))}</span>
          <div class="pc-bar-opts">${barButtons}</div>
        </div>
        <div class="pc-weight-row">
          <button class="pc-step-btn" type="button" data-pc="down" aria-label="${esc(t('plate.lighter'))}">${SVG_MINUS}</button>
          <div class="pc-weight-display">
            <span class="pc-weight-num" data-pc="weight"></span>
            <span class="pc-weight-unit">${esc(t('plate.unit'))}</span>
          </div>
          <button class="pc-step-btn" type="button" data-pc="up" aria-label="${esc(t('plate.heavier'))}">${SVG_PLUS}</button>
        </div>
        <div class="pc-barbell" data-pc="barbell" data-state="bare" aria-hidden="true">
          <div class="pc-side pc-side-l" data-pc="side-l"></div>
          <div class="pc-collar"></div><div class="pc-shaft"></div><div class="pc-collar"></div>
          <div class="pc-side pc-side-r" data-pc="side-r"></div>
        </div>
        <div class="pc-text" data-pc="text" aria-live="polite"></div>
      </div>`;

    document.body.appendChild(overlay);

    const q = (/** @type {string} */ name) => /** @type {HTMLElement} */ (overlay.querySelector(`[data-pc="${name}"]`));
    // Лист в реестре Nav: системная «назад» и Escape закрывают его, а не уводят
    // с экрана тренировки посреди сессии. Закрытие кнопкой само снимает запись history.
    const close = () => {
      window.Nav?.unregisterOverlay('plate-calc');
      dismissOverlay(overlay);
    };
    window.Nav?.registerOverlay({ id: 'plate-calc', el: overlay, close });

    /** @param {boolean} animate смена веса или грифа — отскок и каскад; первый показ листа — нет */
    function render(animate) {
      q('weight').textContent = fmtWeight(current);
      overlay.querySelectorAll('.pc-bar-opt').forEach((b) => {
        const el = /** @type {HTMLElement} */ (b);
        el.setAttribute('aria-pressed', String(Number(el.dataset.bar) === bar));
      });

      const r = loadPlates(current, bar);
      /** @type {string[]} */
      const rows = [];
      let note = '';

      if (r.status === 'below-bar') {
        note = `<p class="pc-msg pc-error">${esc(t('plate.below_bar', { bar: kg(bar) }))}</p>`;
      } else {
        if (r.status === 'unreachable' && r.up) {
          note =
            `<p class="pc-msg pc-error">${esc(t('plate.unreachable', { w: kg(current) }))}</p>` +
            `<p class="pc-msg">${esc(t('plate.add_up', { d: kg(r.up.delta), w: kg(r.up.total) }))}</p>`;
        } else if (r.plates.length === 0) {
          note = `<p class="pc-msg">${esc(t('plate.bar_only'))}</p>`;
        }
        if (r.plates.length) {
          rows.push(
            `<div class="pc-row"><span class="pc-lbl">${esc(t('plate.per_side'))}</span><span class="pc-val">${esc(sideList(r.plates))} ${esc(t('plate.unit'))}</span></div>`,
            `<div class="pc-row"><span class="pc-lbl">${esc(t('plate.on_bar'))}</span><span class="pc-val">${esc(kg(r.loaded))} ${esc(t('plate.unit'))}</span></div>`
          );
        }
      }
      const barbell = q('barbell');
      const specs = r.status === 'below-bar' ? [] : flatPlates(r.plates);
      syncSide(q('side-l'), specs, animate);
      syncSide(q('side-r'), specs, animate);
      const state = r.status === 'below-bar' ? 'below' : specs.length ? 'loaded' : 'bare';
      barbell.dataset.state = state;
      if (animate && state !== 'below') kick(barbell);
      q('text').innerHTML = note + rows.join('');
    }

    /** @param {number} dir */
    function step(dir) {
      const next = stepLoadable(current, bar, dir);
      if (next === current) return;
      current = next;
      haptic([15]);
      render(true);
    }

    q('down').addEventListener('click', () => step(-1));
    q('up').addEventListener('click', () => step(1));
    q('close').addEventListener('click', close);
    overlay.querySelectorAll('.pc-bar-opt').forEach((b) =>
      b.addEventListener('click', () => {
        bar = Number(/** @type {HTMLElement} */ (b).dataset.bar);
        saveBar(bar);
        render(true);
      })
    );
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    render(false);
    haptic([20]);
  }

  return { open };
})();
