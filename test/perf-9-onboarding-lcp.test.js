/**
 * PERF-9 — LCP онбординга без водопада.
 *
 * Холодный профиль (новый пользователь): LCP — `<p>` первого шага онбординга.
 * До правки он ждал два последовательных запроса после бута:
 * app.js → import('./onboarding.js') → статический block-ticks.js, и ещё
 * fade-in 0.4 с с opacity:0 (docs/handoff/HANDOFF_perf_lhci.md, замер 25.11).
 *
 * Гард держит обе половины:
 *  1. modulepreload на onboarding.js и всё его статическое замыкание —
 *     Chrome сам зависимости modulepreload не тянет, новый импорт в
 *     onboarding.js без своей строки в index.html вернёт водопад молча;
 *  2. первый показ оверлея без fade (решение Gio 22.11, вариант A),
 *     переходы шагов — с fade, как раньше.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const stripHtmlComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

function modulepreloads() {
  const html = stripHtmlComments(read('index.html'));
  const re = /<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["']/g;
  return new Set([...html.matchAll(re)].map((m) => m[1].replace(/^\//, '')));
}

/** Статическое замыкание import от файла (только относительные спецификаторы). */
function staticClosure(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = stripComments(read(file));
    const re = /^[ \t]*import(?:\s+(?:[\w${}*,\s]+)\s+from\s+|\s+)['"]([^'"]+)['"]/gm;
    for (const m of code.matchAll(re)) {
      if (!m[1].startsWith('.')) continue;
      walk(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])));
    }
  };
  walk(entry);
  return seen;
}

function swList(name) {
  const block = new RegExp(String.raw`const ${name} = \[([\s\S]*?)\];`).exec(read('sw.js'));
  assert.ok(block, `sw.js has no ${name}`);
  return new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/^\//, '')));
}

describe('PERF-9: onboarding.js стартует вместе с бут-графом', () => {
  const hrefs = modulepreloads();

  test('onboarding.js и block-ticks.js — modulepreload, не в комментарии', () => {
    assert.ok(hrefs.has('js/onboarding.js'), 'нет modulepreload на js/onboarding.js');
    assert.ok(hrefs.has('js/shared/block-ticks.js'), 'нет modulepreload на js/shared/block-ticks.js');
  });

  test('всё статическое замыкание onboarding.js — modulepreload (иначе водопад)', () => {
    const missing = [...staticClosure('js/onboarding.js')].filter((f) => !hrefs.has(f)).sort();
    assert.deepEqual(
      missing,
      [],
      `импорт онбординга без modulepreload: ${missing.join(', ')} — Chrome увидит его только ` +
        'после разбора родителя, LCP первого визита снова ждёт второй запрос'
    );
  });

  test('build:sw положил оба файла в install-фазу (ASSETS), не в warm', () => {
    const boot = swList('ASSETS');
    for (const f of ['js/onboarding.js', 'js/shared/block-ticks.js']) {
      assert.ok(boot.has(f), `${f} не в ASSETS — прогони npm run build:sw`);
    }
  });
});

describe('PERF-9: первый показ без fade, переходы с fade', () => {
  // Фейковый DOM в духе test/onboarding-draft.test.js: нужны только атрибуты.
  function makeNode() {
    const attrs = {};
    return {
      style: {},
      innerHTML: '',
      children: [],
      appendChild(c) {
        this.children.push(c);
        return c;
      },
      remove() {},
      setAttribute(k, v) {
        attrs[k] = String(v);
      },
      getAttribute(k) {
        return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null;
      },
      hasAttribute(k) {
        return Object.prototype.hasOwnProperty.call(attrs, k);
      },
      removeAttribute(k) {
        delete attrs[k];
      },
      querySelector() {
        return null;
      },
      focus() {},
    };
  }

  test('CSS гасит .animate-in только под data-still', () => {
    const src = read('js/onboarding.js');
    assert.match(
      src,
      /#onboarding-overlay\[data-still\]\s+\.animate-in\s*\{\s*animation:\s*none;?\s*\}/,
      'правило #onboarding-overlay[data-still] .animate-in { animation: none } пропало'
    );
  });

  test('showOnboarding рисует первый кадр неподвижным, _obNext/_obPrev — с анимацией', async () => {
    globalThis.document = {
      addEventListener() {},
      removeEventListener() {},
      createElement: () => makeNode(),
      head: makeNode(),
      body: makeNode(),
      getElementById: () => null,
    };
    globalThis.window = /** @type {any} */ (globalThis);
    globalThis.window.addEventListener = () => {};
    globalThis.window.removeEventListener = () => {};
    globalThis.window.dispatchEvent = () => true;

    const { DB } = await import('../js/db.js');
    const ob = await import('../js/onboarding.js');
    await DB.clearAll();

    const shown = ob.showOnboarding();
    const overlay = await new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        const node = document.body.children.at(-1);
        if (node && String(node.innerHTML).includes('animate-in')) return resolve(node);
        if (Date.now() - t0 > 1000) return reject(new Error('оверлей не отрисовался'));
        setImmediate(tick);
      };
      tick();
    });
    assert.equal(overlay.hasAttribute('data-still'), true, 'первый кадр онбординга снова с fade-in');

    globalThis.window._obSetData({ goal: 'strength' });
    assert.equal(
      overlay.hasAttribute('data-still'),
      false,
      'перерисовка после первого кадра должна вернуть анимацию'
    );

    // Переход шага — анимирован, и атрибут не возвращается.
    await globalThis.window._obNext();
    assert.equal(ob.snapshotOnboarding().step, 2);
    assert.equal(overlay.hasAttribute('data-still'), false, '_obNext потерял fade');
    await globalThis.window._obPrev();
    assert.equal(overlay.hasAttribute('data-still'), false, '_obPrev потерял fade');

    overlay._resolve();
    await shown;
    await DB.clearAll();
  });

  test('черновик со 2-го шага — тоже первый показ, тоже без fade', async () => {
    const { DB } = await import('../js/db.js');
    const ob = await import('../js/onboarding.js');
    await DB.Settings.set(ob.ONBOARDING_DRAFT_KEY, { step: 3, data: { goal: 'strength', exp: 'beginner' } });
    const before = document.body.children.length;
    const shown = ob.showOnboarding();
    const overlay = await new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        if (document.body.children.length > before) return resolve(document.body.children.at(-1));
        if (Date.now() - t0 > 1000) return reject(new Error('оверлей не отрисовался'));
        setImmediate(tick);
      };
      tick();
    });
    assert.equal(ob.snapshotOnboarding().step, 3);
    assert.equal(overlay.hasAttribute('data-still'), true, 'шаг из черновика показан с fade-in');
    overlay._resolve();
    await shown;
    await DB.clearAll();
  });
});
