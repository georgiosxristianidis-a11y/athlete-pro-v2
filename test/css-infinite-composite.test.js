// PERF-2 TEST-GUARD: вечная анимация обязана крутиться на композитных свойствах.
//
// Разведка PERF-1 (docs/handoff/HANDOFF_gemini_audit_triage.md): одна мигающая
// точка 8 px — `.ai-indicator` на `background-color` + `box-shadow` — давала
// 301 UpdateLayoutTree и 602 Paint за 5 с ПРОСТОЯ на Home под CPU x4. Не «часть»
// Style & Layout, а весь его простойный остаток: снятие этой анимации дало ровно
// те же нули, что контрольный `*{animation:none}`.
//
// Паттерн ловится статически: `@keyframes`, чьи блоки трогают layout/paint-свойства,
// и на которые ссылается `animation: ... infinite`. Конечные анимации (входы,
// скелетоны) не в счёт — они отрабатывают и умирают.
//
// Потолок INFINITE_NONCOMPOSITE — ЗАМОРОЖЕННАЯ ИНВЕНТАРИЗАЦИЯ, а не индульгенция.
// Эти четыре живут на экранах, которые не висят открытыми (их ревизия — не PERF-2).
// Новый адрес роняет тест и заставляет автора ответить, почему его анимация вечная
// и почему она на некомпозитном свойстве.
//
// Область — css/**. Инлайновые <style> в js/ и index.html грепом не берутся
// (урок reference-cssom-walk-beats-grep); для них гарда нет, это известная дыра.

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, readdirSync } from 'fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_DIR = join(__dirname, '..', 'css');

/** Свойства, изменение которых стоит recalc/layout/paint на главном потоке. */
const NON_COMPOSITE = ['background-color', 'box-shadow', 'width', 'height', 'top', 'left', 'filter'];

/** Замороженная инвентаризация на момент PERF-2 (1.27.63). Формат `файл::кейфрейм`. */
const INFINITE_NONCOMPOSITE = [
  'athlete-room.css::ring-pulse-glow',   // s-athlete-room, экран не висит открытым
  'dashboard.css::glowPulse',            // s-home, кольцо прогресса — ревизия отдельной карточкой
  'intel.css::intel-error-pulse',        // s-intel, только в состоянии ошибки
  'intel.css::intel-scan',               // s-intel, экран не висит открытым
];

/** Убирает комментарии, сохраняя переводы строк — номера строк остаются честными. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

const FILES = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css')).sort();
const SOURCES = new Map(FILES.map((f) => [f, stripComments(readFileSync(join(CSS_DIR, f), 'utf8'))]));

/**
 * Все @keyframes файла с набором свойств, которые они трогают.
 * @returns {Array<{name: string, props: string[], line: number}>}
 */
function keyframesOf(css) {
  const out = [];
  const re = /@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let i = re.lastIndex;
    let depth = 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    const body = css.slice(re.lastIndex, i - 1);
    const props = new Set();
    for (const decl of body.split(/[;{}]/)) {
      const p = decl.match(/^\s*(-?[\w-]+)\s*:/);
      if (p) props.add(p[1]);
    }
    out.push({ name: m[1], props: [...props], line: css.slice(0, m.index).split('\n').length });
  }
  return out;
}

/** Имена кейфреймов, на которые в css ссылается хоть одно `animation: ... infinite`. */
function infiniteRefs(css) {
  const names = new Set();
  const re = /\banimation(?:-name)?\s*:\s*([^;}]+)/g;
  let m;
  while ((m = re.exec(css))) {
    if (!/\binfinite\b/.test(m[1])) continue;
    for (const token of m[1].split(/[\s,]+/)) if (token) names.add(token);
  }
  return names;
}

/** Глобальная карта: имя кейфрейма -> {file, props, line}. Ссылки бывают межфайловыми. */
const KEYFRAMES = new Map();
for (const [file, css] of SOURCES) {
  for (const kf of keyframesOf(css)) KEYFRAMES.set(kf.name, { file, ...kf });
}

/** Фактические адреса «вечная анимация на некомпозитном свойстве». */
function offenders() {
  const hits = new Map();
  for (const css of SOURCES.values()) {
    for (const name of infiniteRefs(css)) {
      const kf = KEYFRAMES.get(name);
      if (!kf) continue;
      const bad = kf.props.filter((p) => NON_COMPOSITE.includes(p));
      if (bad.length) hits.set(`${kf.file}::${name}`, { ...kf, bad });
    }
  }
  return hits;
}

test('вечные анимации на некомпозитных свойствах не выходят за потолок', () => {
  const hits = offenders();
  const actual = [...hits.keys()].sort();
  const added = actual.filter((k) => !INFINITE_NONCOMPOSITE.includes(k));

  assert.deepEqual(
    added,
    [],
    'Новая бесконечная анимация на layout/paint-свойстве — она жжёт главный поток всё время, ' +
      `пока экран открыт (PERF-2):\n${added
        .map((k) => `  ${k} (${SOURCES.has(hits.get(k).file) ? `${hits.get(k).file}:${hits.get(k).line}` : k}) — ${hits.get(k).bad.join(', ')}`)
        .join('\n')}\n` +
      'Перенеси пульсацию на opacity/transform (образец: .ai-indicator в css/base.css), ' +
      'либо сделай анимацию конечной. Правка потолка — только с обоснованием в карточке.',
  );

  const gone = INFINITE_NONCOMPOSITE.filter((k) => !actual.includes(k));
  assert.deepEqual(gone, [], `Потолок протух — этих адресов больше нет, вычеркни их из INFINITE_NONCOMPOSITE:\n  ${gone.join('\n  ')}`);
});

test('.ai-indicator анимируется только композитными свойствами (замок PERF-2)', () => {
  const base = SOURCES.get('base.css');
  const rules = [...base.matchAll(/\.ai-indicator[^{}]*\{([^}]*)\}/g)];
  assert.ok(rules.length, 'Правила .ai-indicator пропали из css/base.css — карточка PERF-2 про них');

  const used = new Set();
  for (const [, body] of rules) {
    for (const m of body.matchAll(/\banimation(?:-name)?\s*:\s*([^;]+)/g)) {
      for (const token of m[1].split(/[\s,]+/)) if (KEYFRAMES.has(token)) used.add(token);
    }
  }
  assert.ok(used.size, 'Индикатор перестал анимироваться вовсе — вид анимации менять было нельзя');

  for (const name of used) {
    const kf = KEYFRAMES.get(name);
    const bad = kf.props.filter((p) => p !== 'opacity' && p !== 'transform');
    assert.deepEqual(bad, [], `@keyframes ${name} (${kf.file}:${kf.line}) трогает ${bad.join(', ')} — вернулись 60 recalc/с в простое`);
  }
});
