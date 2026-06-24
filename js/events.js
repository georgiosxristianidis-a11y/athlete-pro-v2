// @ts-check
/**
 * events.js — global event-delegation dispatcher.
 *
 * Replaces inline on* handlers (onclick/onchange/onkeydown), which are blocked
 * by the strict CSP `script-src-attr 'none'`. Markup carries a data attribute
 * naming the action; the matching handler is registered here in JS.
 *
 *   <button data-action="island:skipRest">          → on('island:skipRest', fn)
 *   <input  data-change="plan:rename" data-pi="3">   → onChange('plan:rename', fn)
 *   <input  data-keydown="intel:submit">             → onKeydown('intel:submit', fn)
 *   <input  data-input="settings:key">               → onInput('settings:key', fn)
 *   <input  data-blur="settings:save">               → onBlur('settings:save', fn)
 *
 * Args are passed as individual `data-*` attributes (primitives only — never
 * JSON blobs of user strings, which would be an attribute-injection vector).
 * The handler receives (el, event): read `el.dataset.*` for ids, `event` for
 * `stopPropagation()` / `event.target.value` / `event.key`.
 *
 * One set of listeners on `document`; delegation means dynamically-rendered
 * nodes (innerHTML) work without re-binding.
 */

const _click = new Map();
const _change = new Map();
const _keydown = new Map();
const _input = new Map();
const _blur = new Map();

export function on(action, fn) { _click.set(action, fn); }
export function onChange(action, fn) { _change.set(action, fn); }
export function onKeydown(action, fn) { _keydown.set(action, fn); }
export function onInput(action, fn) { _input.set(action, fn); }
export function onBlur(action, fn) { _blur.set(action, fn); }

function _delegate(map, key) {
  return (e) => {
    const el = e.target.closest(`[data-${key}]`);
    if (!el) return;
    const fn = map.get(el.dataset[key]);
    if (fn) fn(el, e);
  };
}

document.addEventListener('click', _delegate(_click, 'action'));
document.addEventListener('change', _delegate(_change, 'change'));
document.addEventListener('keydown', _delegate(_keydown, 'keydown'));
document.addEventListener('input', _delegate(_input, 'input'));
// blur does not bubble → delegate in the capture phase
document.addEventListener('blur', _delegate(_blur, 'blur'), true);
