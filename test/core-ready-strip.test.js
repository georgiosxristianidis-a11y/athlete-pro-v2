// CORE-02 (флаг 'core-ready-strip'): полоса готовности 64 px на экране Core.
// Сторожит три обещания карточки: флаг OFF и легаси рядом; числа — только из
// fetchReadiness() (без сна и выдуманных полей); раскрытие поверх ленты на
// transform/opacity, без сдвига layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const VIEW = readFileSync(new URL('../js/intel.view.js', import.meta.url), 'utf8');
const STRIP = readFileSync(new URL('../js/intel.ready-strip.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../css/intel.css', import.meta.url), 'utf8');

function fnBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `якорь ${name} пропал`);
  return src.slice(start);
}

function rule(css, selector) {
  const re = new RegExp(
    `(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`
  );
  const m = css.match(re);
  assert.ok(m, `правило ${selector} пропало`);
  return m[2];
}

test('флаг core-ready-strip заведён OFF и легаси-виджет остаётся веткой', async () => {
  const { allFlags } = await import('../js/flags.js');
  assert.equal(allFlags()['core-ready-strip'], false, 'дефолт обязан быть OFF до решения Gio');
  assert.match(
    VIEW,
    /flag\('core-ready-strip'\)\s*\?\s*\(await import\('\.\/intel\.ready-strip\.js'\)\)\.buildReadyStrip\(data\)\s*:\s*_buildReadinessWidget\(data\)/,
    'легаси _buildReadinessWidget обязан остаться веткой OFF (Strangler-Fig)'
  );
});

test('полоса читает только поля fetchReadiness() и не красит число без данных', () => {
  const fn = fnBody(STRIP, 'buildReadyStrip');
  assert.match(fn, /confidence === 'none'/, 'пустая история — текст, не 0/100');
  assert.match(fn, /clamp\(data\.index\)/);
  assert.match(fn, /clamp\(data\.cns\)/);
  for (const part of ['recovery', 'acwr', 'monotony', 'trend']) {
    assert.match(
      fn,
      new RegExp(`data\\.parts\\?\\.${part}`),
      `шкала ${part} обязана читать parts движка`
    );
  }
  assert.equal(
    /data\.sleep|rawData|data\.density/.test(fn),
    false,
    'сна в движке нет — шкалы сна быть не может'
  );
  assert.equal(
    /style="[^"]*width:/.test(fn),
    false,
    'заливка — scaleX, не width (compositor-only)'
  );
});

test('панель шкал лежит поверх ленты и въезжает только transform/opacity', () => {
  const strip = rule(CSS, '.intel-ready-strip');
  assert.match(strip, /height:\s*64px/, 'полоса — ровно 64 px');
  assert.match(rule(CSS, '.intel-ready'), /position:\s*relative/);
  const panel = rule(CSS, '.intel-ready-panel');
  assert.match(panel, /position:\s*absolute/, 'панель вне потока — иначе раскрытие толкает ленту');
  const transitions = [...CSS.matchAll(/\.intel-ready[^{]*\{[^}]*\}/g)].flatMap((m) =>
    [...m[0].matchAll(/transition:\s*([^;]+);/g)].map((t) => t[1])
  );
  assert.ok(transitions.length > 0);
  for (const t of transitions) {
    for (const part of t.split(',')) {
      const prop = part.trim().split(/\s+/)[0];
      assert.ok(
        ['transform', 'opacity'].includes(prop),
        `transition по ${prop} — мимо закона кадра`
      );
    }
  }
});
