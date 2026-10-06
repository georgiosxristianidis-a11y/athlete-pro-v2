/**
 * PLATE-1c — замок на закон движения листа блинов (.claude/rules/design.md, Motion).
 * Поведение в браузере держит test/e2e/plate-calc.spec.js; здесь — то, что видно
 * по исходникам и ломается молча: reflow на горячем пути, свой rAF, второй драйвер
 * на transform, не-compositor свойства в keyframes, бюджет 300 мс.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/** Гард на регекспе зеленеет на комментарии: вырезаем `//` и блоки до матчинга. */
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const js = stripJs(read('js/plate-calc.js'));
const css = stripCss(read('css/workout.css'));
const baseCss = stripCss(read('css/base.css'));

/** Тело `@keyframes name { ... }` с учётом вложенных скобок. */
function keyframesBody(name) {
  const start = css.indexOf(`@keyframes ${name}`);
  assert.ok(start >= 0, `@keyframes ${name} пропал из css/workout.css`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`@keyframes ${name}: нет закрывающей скобки`);
}

/** Тела правил, чей селектор содержит `needle`. */
function ruleBodies(needle) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) if (m[1].includes(needle)) out.push(m[2]);
  return out;
}

const seconds = (v) => (v.endsWith('ms') ? parseFloat(v) / 1000 : parseFloat(v));

test('plate-calc.js: нет своего rAF, reflow и прямой вибрации', () => {
  assert.doesNotMatch(js, /requestAnimationFrame/, 'свой rAF в листе запрещён (FRAME-1: один драйвер кадра)');
  assert.doesNotMatch(js, /offsetWidth|offsetHeight|getBoundingClientRect|void\s+\w+\.\w+/, 'forced reflow на горячем пути');
  assert.doesNotMatch(js, /navigator\.vibrate/, 'вибрация только через haptic() из shared/utils.js');
  assert.match(js, /import\s*\{[^}]*\bhaptic\b[^}]*\}\s*from\s*'\.\/shared\/utils\.js'/);
});

test('plate-calc.js: хост грифа не пересоздаётся рендером, ретриггер через getAnimations', () => {
  assert.doesNotMatch(js, /q\('barbell'\)\.innerHTML|barbell\.innerHTML/, 'innerHTML грифа обнуляет хост анимации (закон п.6)');
  assert.match(js, /getAnimations/, 'ретриггер отскока — cancel()+play() по getAnimations()');
  assert.match(js, /replaceWith|appendChild/, 'блины диффятся по индексу, а не пересоздаются целиком');
});

test('щелчок: haptic по факту смены веса, а не при каждом render', () => {
  const step = js.slice(js.indexOf('function step('), js.indexOf("q('down')"));
  assert.match(step, /haptic\(/, 'step() потерял щелчок');
  assert.ok(step.indexOf('return;') < step.indexOf('haptic('), 'щелчок до проверки «вес не изменился» даёт вибро на упоре');
  const render = js.slice(js.indexOf('function render('), js.indexOf('function step('));
  assert.doesNotMatch(render, /haptic\(/, 'haptic в render() сработает и на первом показе листа');
});

test('keyframes отскока и входа блина — только transform и opacity', () => {
  for (const name of ['pc-kick', 'pc-plate-in']) {
    const props = [...keyframesBody(name).matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
    assert.ok(props.length > 0);
    const bad = props.filter((p) => !['transform', 'opacity'].includes(p));
    assert.deepEqual(bad, [], `${name}: ${bad.join(', ')} — не compositor-only (закон п.1)`);
  }
});

test('анимации конечные, ≤300 мс с учётом каскада, без инлайн-кривых', () => {
  const kick = ruleBodies('.pc-barbell.pc-kick').join(';');
  const plate = ruleBodies('.pc-plate-in').join(';');
  for (const body of [kick, plate]) {
    assert.doesNotMatch(body, /infinite/, 'вечная анимация — красит PERF-2');
    assert.doesNotMatch(body, /cubic-bezier|linear\(/, 'кривая только токеном --ease-*');
  }
  assert.match(kick, /var\(--ease-spring-2\)/);
  assert.match(plate, /var\(--ease-spring-2\)/);

  const kickDur = seconds(/animation:\s*pc-kick\s+([\d.]+m?s)/.exec(kick)?.[1] ?? 'x');
  const plateDur = seconds(/animation:\s*pc-plate-in\s+([\d.]+m?s)/.exec(plate)?.[1] ?? 'x');
  const step = seconds(/\*\s*([\d.]+m?s)\)/.exec(plate)?.[1] ?? 'x');
  const cascadeMax = Number(/const CASCADE_MAX = (\d+)/.exec(js)?.[1]);
  assert.ok(kickDur <= 0.3, `отскок ${kickDur} с > 0.3`);
  assert.ok(plateDur + cascadeMax * step <= 0.3 + 1e-9, `каскад ${plateDur + cascadeMax * step} с > 0.3`);
});

test('один драйвер: у грифа и блина нет transition по transform', () => {
  const bodies = [...ruleBodies('.pc-barbell'), ...ruleBodies('.pc-plate'), ...ruleBodies('.pc-side')];
  const fights = bodies.filter((b) => /transition[^;]*\b(?:transform|all|opacity)\b/.test(b));
  assert.deepEqual(fights, [], 'CSS transition рядом с keyframes — два драйвера на одно свойство (закон п.4)');
});

test('reduced-motion: движение гасит глобальное правило base.css, у листа лишь задержка', () => {
  assert.match(
    baseCss,
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*::before,\s*::after\s*\{[^}]*animation-duration:\s*0\.01ms\s*!important/,
    'глобальное правило reduced-motion пропало или сменило форму'
  );
  // по месту разрешена только задержка каскада: само движение гасится глобально
  const m = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.pc-plate-in\s*\{([^}]*)\}/.exec(css);
  assert.ok(m, 'задержка каскада при reduced-motion не обнулена: блины стоят невидимыми до 90 мс');
  assert.match(m[1], /animation-delay:\s*0s/);
  assert.doesNotMatch(m[1], /animation:|transition/, 'по месту — только задержка');
});
