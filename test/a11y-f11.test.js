/**
 * LAUNCH-9 F-11 — безымянные контролы и немодальный онбординг.
 *
 * Аудит: 50 из 106 контролов на Train без имени (`set-check`, `drag-handle`,
 * барабаны); на профиле — степперы отдыха и глаз ключа; Tab из онбординга
 * уходит в таб-бар. Гард читает исходники (как nav-law) и проверяет inert
 * на моке DOM — иначе правка в одном файле зеленела бы, пока дыра жива в другом.
 */
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function openTag(src, needle) {
  const i = src.indexOf(needle);
  assert.ok(i >= 0, `не найден фрагмент: ${needle}`);
  const gt = src.indexOf('>', i);
  assert.ok(gt > i, `тег не закрыт после ${needle}`);
  return src.slice(i, gt + 1);
}

describe('F-11 Train: именные атрибуты', () => {
  const render = read('js/workout.view/render.js');

  test('set-check несёт aria-label и aria-pressed', () => {
    const tag = openTag(render, 'class="set-check');
    assert.match(tag, /aria-label="/);
    assert.match(tag, /aria-pressed="/);
    assert.match(tag, /train\.mark_set/);
    assert.match(tag, /train\.unmark_set/);
  });

  test('drag-handle назван, не голая ручка', () => {
    const tag = openTag(render, 'class="drag-handle"');
    assert.match(tag, /aria-label="/);
    assert.match(tag, /train\.reorder/);
  });

  test('барабаны веса и повторов названы по номеру подхода', () => {
    assert.match(render, /train\.weight_set/);
    assert.match(render, /train\.reps_set/);
    const w = openTag(render, 'id="sw-${ei}-${si}"');
    const r = openTag(render, 'id="sr-${ei}-${si}"');
    assert.match(w, /aria-label="/);
    assert.match(r, /aria-label="/);
  });

  test('coach, more и BW несут доступное имя', () => {
    const coach = openTag(render, 'class="ex-action-btn coach"');
    const more = openTag(render, 'class="ex-action-btn" title=');
    const bw = openTag(render, 'data-action="wo:toggleBW"');
    assert.match(coach, /aria-label="/);
    assert.match(more, /aria-label="/);
    assert.match(bw, /aria-label="/);
  });

  test('toggleSet синхронизирует имя и pressed у set-check', () => {
    const handlers = read('js/workout.view/handlers.js');
    assert.match(handlers, /aria-pressed/);
    assert.match(handlers, /train\.unmark_set/);
    assert.match(handlers, /train\.mark_set/);
  });
});

describe('F-11 Profile: степперы и глаз ключа', () => {
  test('кнопки отдыха несут rest_dec / rest_inc', () => {
    const settings = read('js/profile.view/settings.js');
    assert.match(settings, /settings\.rest_dec/);
    assert.match(settings, /settings\.rest_inc/);
    const dec = openTag(settings, 'data-amt="-15"');
    const inc = openTag(settings, 'data-amt="15"');
    assert.match(dec, /aria-label="/);
    assert.match(inc, /aria-label="/);
  });

  test('глаз ключа назван и переключает подпись', () => {
    const ai = read('js/ai-settings.view.js');
    assert.match(ai, /settings\.key_show/);
    assert.match(ai, /settings\.key_hide/);
    const tag = openTag(ai, 'data-action="ai:toggleKeyVis"');
    assert.match(tag, /aria-label="/);
  });
});

describe('F-11 онбординг: модальный слой', () => {
  const ob = read('js/onboarding.js');

  test('оверлей объявлен диалогом', () => {
    assert.match(ob, /setAttribute\('role', 'dialog'\)/);
    assert.match(ob, /setAttribute\('aria-modal', 'true'\)/);
    assert.match(ob, /setAttribute\('aria-labelledby', 'ob-title'\)/);
    assert.match(ob, /id="ob-title"/);
  });

  test('шелл под оверлеем становится inert', () => {
    assert.match(ob, /el\.inert = on/);
    assert.match(ob, /'app'/);
    assert.match(ob, /'claude-fab-container'/);
  });
});

function makeNode() {
  const attrs = {};
  return {
    style: {},
    innerHTML: '',
    textContent: '',
    id: '',
    tabIndex: 0,
    inert: false,
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {},
    setAttribute(k, v) {
      attrs[k] = String(v);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null;
    },
    removeAttribute(k) {
      delete attrs[k];
    },
    querySelector() {
      return { id: '', tabIndex: -1, focus() {} };
    },
    focus() {},
  };
}

const app = makeNode();
app.id = 'app';
const fab = makeNode();
fab.id = 'claude-fab-container';
const head = makeNode();
const body = makeNode();

globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  createElement() {
    return makeNode();
  },
  head,
  body,
  getElementById(id) {
    if (id === 'app') return app;
    if (id === 'claude-fab-container') return fab;
    return null;
  },
};
globalThis.window = /** @type {any} */ (globalThis);
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.window.dispatchEvent = () => true;

const { setShellInert, showOnboarding } = await import('../js/onboarding.js');

afterEach(() => {
  setShellInert(false);
  body.children.length = 0;
});

describe('F-11 онбординг: inert на моке DOM', () => {
  test('setShellInert прячет #app и FAB, снятие возвращает', () => {
    setShellInert(true);
    assert.equal(app.inert, true);
    assert.equal(fab.inert, true);
    assert.equal(app.getAttribute('aria-hidden'), 'true');
    setShellInert(false);
    assert.equal(app.inert, false);
    assert.equal(fab.inert, false);
    assert.equal(app.getAttribute('aria-hidden'), null);
  });

  test('showOnboarding ставит dialog + aria-modal и inert шелла', async () => {
    const shown = showOnboarding();
    const overlay = await new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        const node = document.body.children.at(-1);
        if (node && node.getAttribute('role') === 'dialog') {
          resolve(node);
          return;
        }
        if (Date.now() - t0 > 1000) {
          reject(new Error('onboarding overlay did not become a dialog'));
          return;
        }
        setImmediate(tick);
      };
      tick();
    });
    assert.equal(overlay.getAttribute('aria-modal'), 'true');
    assert.equal(app.inert, true);
    overlay._resolve();
    await shown;
  });
});
