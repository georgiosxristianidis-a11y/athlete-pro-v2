import { getLang, tri } from '../locale.store.js';
'use strict';

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string|null|undefined} str 
 * @returns {string}
 */
export const esc = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

class RawString {
  constructor(value) {
    this.value = String(value ?? '');
  }
}

/**
 * Wraps a string to bypass HTML escaping in html tagged templates.
 * @param {any} value
 * @returns {RawString}
 */
export const raw = (value) => new RawString(value);

/**
 * Tagged template literal for safe-by-default HTML rendering.
 * Automatically escapes interpolated variables unless wrapped with raw().
 * @param {TemplateStringsArray} strings
 * @param {...any} values
 * @returns {string}
 */
export const html = (strings, ...values) => {
  let result = strings[0];
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val instanceof RawString) {
      result += val.value;
    } else if (Array.isArray(val)) {
      result += val.map(item => item instanceof RawString ? item.value : esc(item)).join('');
    } else {
      result += esc(val);
    }
    result += strings[i + 1];
  }
  return result;
};

let _hasInteracted = false;
if (typeof window !== 'undefined') {
  const _unlock = () => { _hasInteracted = true; window.removeEventListener('pointerdown', _unlock); };
  window.addEventListener('pointerdown', _unlock, { passive: true });
}

let _hapticOn = true;

/**
 * Кеш тумблера «Вибрация» (P0-HAPTIC). haptic() зовут десятки мест на горячем
 * пути — читать IndexedDB на каждый тап нельзя, поэтому значение держит модуль,
 * а прошивает владелец ключа `js/profile.store.js`: на старте и на тумблере.
 * Нет значения = вибрация включена (opt-out), до прошивки тоже.
 * @param {*} value 'on' | 'off' из базы
 */
export const setHapticPref = (value) => {
  _hapticOn = value !== 'off';
};

const PULSE = 'ios-haptic-pulse';

/**
 * Визуальный пульс вместо вибрации (iOS). Класс снимается по animationend своей
 * анимации, поэтому класс на узле = анимация жива: повторный тап перематывает её
 * через getAnimations() (cancel + play) — без `offsetWidth` и чтения layout.
 * @param {Element} el
 */
const _pulse = (el) => {
  if (el.classList.contains(PULSE)) {
    el.getAnimations?.().forEach((a) => {
      if (/** @type {CSSAnimation} */ (a).animationName !== PULSE) return;
      a.cancel();
      a.play();
    });
    return;
  }
  el.classList.add(PULSE);
  /** @param {Event} e */
  const done = (e) => {
    // animationend всплывает: на body прилетает и от анимаций потомков.
    if (e.target !== el || /** @type {AnimationEvent} */ (e).animationName !== PULSE) return;
    el.removeEventListener('animationend', done);
    el.classList.remove(PULSE);
  };
  el.addEventListener('animationend', done);
};

/**
 * Triggers a short haptic feedback (vibration) if supported.
 * Falls back to a visual pulse (iOS). Silent when the user turned haptics off.
 * @param {number|number[]} pattern
 * @param {HTMLElement} [elementToPulse=null]
 */
export const haptic = (pattern = 10, elementToPulse = null) => {
  if (!_hapticOn || !_hasInteracted) return;
  let vibrated = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      vibrated = navigator.vibrate(pattern);
    }
  } catch (e) {
    // Ignore haptic failures
  }

  // iOS Fallback or if vibrate returned false
  if (!vibrated) {
    const el = elementToPulse || document.activeElement || document.body;
    if (el && el !== document) _pulse(el);
  }
};

/**
 * Группа слушателей на долгоживущей цели (`window` / `document`) с одной точкой снятия.
 *
 * LEAK-1. Слушатель на узле оверлея уходит вместе с `node.remove()` — там снимать
 * нечего. Утечка живёт ровно там, где слушатель садится на `window` внутри функции,
 * которую зовут повторно: `_initMascotDrag()` на каждый рендер пустого Home,
 * `renderFAB()` на каждый показ панды. Счётчик растёт линейно, а замыкание держит
 * уже отсоединённый DOM-узел, и собрать его некому.
 *
 * Группа делает снятие таким же дешёвым, как навешивание: `release()` перед
 * повторным навешиванием — и счётчик слушателей стоит на месте, сколько бы циклов
 * ни прошло. Анонимную функцию при этом писать можно: ссылку на снятие держит группа.
 *
 * @param {EventTarget} [target] по умолчанию `window`; вне браузера группа пустая и молчит
 */
export const listenerGroup = (target = typeof window !== 'undefined' ? window : null) => {
  /** @type {Array<() => void>} */
  let off = [];
  return {
    /**
     * @param {string} type
     * @param {EventListenerOrEventListenerObject} handler
     * @param {boolean|AddEventListenerOptions} [options]
     */
    add(type, handler, options) {
      if (!target) return;
      target.addEventListener(type, handler, options);
      off.push(() => target.removeEventListener(type, handler, options));
    },
    /** Снимает все слушатели группы. Идемпотентен: повторный вызов — no-op. */
    release() {
      for (const fn of off) fn();
      off = [];
    },
    /** Сколько слушателей группа держит прямо сейчас. */
    get size() { return off.length; },
  };
};

/**
 * Renders a design-system date-of-birth picker (year/month/day selects) in place of native `<input type="date">`,
 * whose Android UI renders in the system locale regardless of app language.
 * @param {string} dob YYYY-MM-DD or empty
 * @param {string} idPrefix DOM id prefix for the three selects
 * @returns {string}
 */
export const dobSelectsHtml = (dob, idPrefix) => {
  const [y, m, d] = dob ? dob.split('-') : ['', '', ''];
  const years = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i);
  const months = {
    ru: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
    el: ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'],
  }[getLang()] || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const selStyle = 'height:52px; background:var(--c-bg-3); border:1.5px solid var(--c-border); border-radius:var(--r-m); color:var(--c-text-1); font-weight:var(--fw-bold);';
  return `
    <!-- Зазор ушёл вниз к --sp-1: в трёхколоночной сетке он отнимается у селектов
         дважды, меньший gap = более широкая колонка. Инсет един у всех трёх —
         разный (12/8/12) разъезжался при одинаковой ширине колонок. -->
    <div style="display:grid; grid-template-columns: 1.2fr 1fr 1fr; gap:var(--sp-1)">
      <select id="${idPrefix}-y" style="${selStyle} padding:0 var(--sp-1-5);">
        <option value="">${tri('Год', 'Year', 'Έτος')}</option>
        ${years.map(year => `<option value="${year}" ${y === String(year) ? 'selected' : ''}>${year}</option>`).join('')}
      </select>
      <select id="${idPrefix}-m" style="${selStyle} padding:0 var(--sp-1-5);">
        <option value="">${tri('Мес', 'Month', 'Μήν.')}</option>
        ${months.map((name, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${m === String(i + 1).padStart(2, '0') ? 'selected' : ''}>${name}</option>`).join('')}
      </select>
      <select id="${idPrefix}-d" style="${selStyle} padding:0 var(--sp-1-5);">
        <option value="">${tri('День', 'Day', 'Ημέρα')}</option>
        ${Array.from({ length: 31 }, (_, i) => {
          const val = String(i + 1).padStart(2, '0');
          return `<option value="${val}" ${d === val ? 'selected' : ''}>${i + 1}</option>`;
        }).join('')}
      </select>
    </div>
  `;
};

/**
 * Reads the YYYY-MM-DD value assembled by {@link dobSelectsHtml}. Empty string if all parts unset.
 * @param {string} idPrefix
 * @returns {string}
 */
export const readDobFromSelects = (idPrefix) => {
  const y = /** @type {HTMLSelectElement} */ (document.getElementById(`${idPrefix}-y`))?.value || '';
  const m = /** @type {HTMLSelectElement} */ (document.getElementById(`${idPrefix}-m`))?.value || '';
  const d = /** @type {HTMLSelectElement} */ (document.getElementById(`${idPrefix}-d`))?.value || '';
  if (!y && !m && !d) return '';
  return `${y}-${m}-${d}`;
};

/**
 * Выход оверлея с рецептом `.sd-overlay` (base.css, MO-2): ставит `data-closing`,
 * ждёт конец transition/animation и убирает узел. Без анимаций (старый движок,
 * reduced-motion) getAnimations() пуст — узел уходит сразу. Вечные анимации
 * поддерева (мигающий `.ai-indicator.missing` в листе настроек ИИ) не ждём:
 * их `finished` не резолвится никогда, и невидимый лист оставался в DOM.
 * @param {HTMLElement} el
 */
export const dismissOverlay = (el) => {
  if (el.hasAttribute('data-closing')) return;
  el.setAttribute('data-closing', '');
  const finite = el
    .getAnimations({ subtree: true })
    .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
  Promise.allSettled(finite.map((a) => a.finished)).then(() => el.remove());
};
