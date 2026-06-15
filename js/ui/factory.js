// @ts-check
import { haptic } from '../shared/utils.js';

/**
 * UI Component Factories — the single source of truth for building
 * interactive primitives from design tokens (task 4-1).
 *
 * Vanilla JS, no framework: every factory returns a real DOM node.
 * Text is set via textContent (never innerHTML of data), so there is no
 * XSS surface and no esc() footgun — callers compose with .append().
 *
 * These BUILD DOM; the other js/ui/* modules (drum-picker, drag-number,
 * gravity-submit) ENHANCE already-rendered DOM. Complementary halves.
 *
 * Styling lives in css/base.css (.btn-*, .ui-field, .ui-stepper, .ui-card),
 * all token-driven — a theme change never touches this file.
 *
 * Consumed by screen code (e.g. Edit Plan, task 4-2):
 *   import { Button, TextField, NumberStepper, Card } from '../ui/factory.js';
 */

/** @typedef {'primary'|'ghost'|'danger'} ButtonVariant */

/** Variant → canonical button class(es) from css/base.css. */
const VARIANT_CLASS = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  danger: 'btn-primary btn-danger', // primary geometry, red surface
};

/**
 * A button in the app's single button language.
 *
 * @param {Object} [opts]
 * @param {string} [opts.label]              Visible text (set safely via textContent).
 * @param {ButtonVariant} [opts.variant]     primary | ghost | danger. Default 'primary'.
 * @param {string} [opts.icon]               Trusted inline SVG markup, rendered before the label.
 * @param {'button'|'submit'|'reset'} [opts.type]  Native type. Default 'button'.
 * @param {boolean} [opts.full]              Stretch to container width.
 * @param {boolean} [opts.disabled]
 * @param {string} [opts.ariaLabel]          Required for icon-only buttons.
 * @param {(e: MouseEvent) => void} [opts.onClick]
 * @returns {HTMLButtonElement}
 */
export function Button({ label = '', variant = 'primary', icon, type = 'button', full = false, disabled = false, ariaLabel, onClick } = {}) {
  const btn = document.createElement('button');
  btn.type = type;
  btn.className = VARIANT_CLASS[variant] || VARIANT_CLASS.primary;
  if (full) btn.style.width = '100%';
  if (disabled) btn.disabled = true;
  if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
  if (icon) {
    const ico = document.createElement('span');
    ico.className = 'btn-ico';
    ico.setAttribute('aria-hidden', 'true');
    ico.innerHTML = icon; // trusted developer-authored SVG only — never data
    btn.appendChild(ico);
  }
  if (label) btn.appendChild(document.createTextNode(label));
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Labelled text input on the dark token palette — the replacement for
 * hand-rolled native <input>s (task 4-2). Returns the <label> wrapper;
 * the inner input is exposed as `.inputEl` for value access / focus.
 *
 * @param {Object} [opts]
 * @param {string} [opts.label]
 * @param {string} [opts.value]
 * @param {string} [opts.placeholder]
 * @param {string} [opts.type]          Native input type. Default 'text'. (Numbers: prefer NumberStepper.)
 * @param {string} [opts.inputmode]
 * @param {string} [opts.name]
 * @param {string} [opts.hint]          Helper text under the field.
 * @param {boolean} [opts.disabled]
 * @param {(value: string, e: Event) => void} [opts.onInput]
 * @returns {HTMLLabelElement & { inputEl: HTMLInputElement }}
 */
export function TextField({ label = '', value = '', placeholder = '', type = 'text', inputmode, name, hint, disabled = false, onInput } = {}) {
  const wrap = document.createElement('label');
  wrap.className = 'ui-field';

  if (label) {
    const lab = document.createElement('span');
    lab.className = 'ui-field-label';
    lab.textContent = label;
    wrap.appendChild(lab);
  }

  const input = document.createElement('input');
  input.className = 'ui-input';
  input.type = type;
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  if (inputmode) input.setAttribute('inputmode', inputmode);
  if (name) input.name = name;
  if (disabled) input.disabled = true;
  if (onInput) input.addEventListener('input', (e) => onInput(input.value, e));
  wrap.appendChild(input);

  if (hint) {
    const h = document.createElement('span');
    h.className = 'ui-field-hint';
    h.textContent = hint;
    wrap.appendChild(h);
  }

  /** @type {any} */ (wrap).inputEl = input;
  return /** @type {any} */ (wrap);
}

/**
 * −/value/+ stepper for bounded numeric input. Exposes getValue()/setValue()
 * and fires onChange only on real change. Light haptic on each step.
 *
 * @param {Object} [opts]
 * @param {number} [opts.value]
 * @param {number} [opts.min]
 * @param {number} [opts.max]
 * @param {number} [opts.step]
 * @param {string} [opts.unit]         Suffix after the value (e.g. 'kg').
 * @param {string} [opts.ariaLabel]
 * @param {(value: number) => void} [opts.onChange]
 * @returns {HTMLDivElement & { getValue: () => number, setValue: (v: number) => void }}
 */
export function NumberStepper({ value = 0, min = -Infinity, max = Infinity, step = 1, unit = '', ariaLabel, onChange } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'ui-stepper';
  wrap.setAttribute('role', 'group');
  if (ariaLabel) wrap.setAttribute('aria-label', ariaLabel);

  let val = clamp(value, min, max);

  const dec = stepBtn('−', 'decrease'); // U+2212 minus sign (typography, not hyphen)
  const valEl = document.createElement('output');
  valEl.className = 'ui-stepper-val';
  const inc = stepBtn('+', 'increase');

  const paint = () => {
    valEl.textContent = unit ? `${fmtNum(val)} ${unit}` : fmtNum(val);
    dec.disabled = val <= min;
    inc.disabled = val >= max;
  };
  const set = (next) => {
    const c = clamp(next, min, max);
    if (c === val) return;
    val = c;
    paint();
    haptic(8);
    if (onChange) onChange(val);
  };

  dec.addEventListener('click', () => set(snap(val - step, step)));
  inc.addEventListener('click', () => set(snap(val + step, step)));

  wrap.append(dec, valEl, inc);
  paint();

  /** @type {any} */ (wrap).getValue = () => val;
  /** @type {any} */ (wrap).setValue = (v) => set(v);
  return /** @type {any} */ (wrap);

  /** @param {string} glyph @param {string} dir */
  function stepBtn(glyph, dir) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ui-stepper-btn';
    b.textContent = glyph;
    b.setAttribute('aria-label', dir);
    return b;
  }
}

/**
 * Surface container in the app's card language. Children are composed as
 * nodes (a string is inserted as TEXT — safe by default).
 *
 * @param {Object} [opts]
 * @param {string} [opts.title]
 * @param {Node | Node[] | string} [opts.children]
 * @param {boolean} [opts.interactive]  Hover/press affordance + button semantics + keyboard activation.
 * @param {boolean} [opts.padded]       Default true.
 * @param {(e: MouseEvent | KeyboardEvent) => void} [opts.onClick]
 * @returns {HTMLDivElement}
 */
export function Card({ title, children, interactive = false, padded = true, onClick } = {}) {
  const card = document.createElement('div');
  card.className = 'ui-card' + (padded ? '' : ' is-flush') + (interactive || onClick ? ' is-interactive' : '');

  if (title) {
    const h = document.createElement('div');
    h.className = 'ui-card-title';
    h.textContent = title;
    card.appendChild(h);
  }

  if (children != null) {
    if (typeof children === 'string') card.appendChild(document.createTextNode(children));
    else if (Array.isArray(children)) children.forEach((n) => n && card.appendChild(n));
    else card.appendChild(children);
  }

  if (interactive || onClick) {
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    const fire = (e) => onClick && onClick(e);
    card.addEventListener('click', fire);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(e); }
    });
  }

  return card;
}

// ── helpers ──────────────────────────────────────────────
/** @param {number} v @param {number} lo @param {number} hi */
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/** Snap to the step grid and scrub float noise (0.1 + 0.2 → 0.3). */
function snap(v, step) { return Number((Math.round(v / step) * step).toFixed(6)); }

/** Compact numeric label: integers bare, decimals trimmed to 2 places. */
function fmtNum(v) { return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2))); }
