/**
 * scripts/graph-audit.mjs — статический аудит графа ES-модулей.
 * Считает: eager vs lazy вес, глубину цепочки импортов (= число RTT-волн),
 * распределение веса по сферам приложения.
 */
import fs from 'node:fs';
import path from 'node:path';

const R = process.cwd();
const rd = (p) => fs.readFileSync(p, 'utf8');
const resolve = (from, spec) => {
  if (!spec.startsWith('.')) return null;
  const p = path.join(path.dirname(from), spec);
  return fs.existsSync(p) ? p : null;
};
const statRe = /^\s*import\s+(?:[^'"]*?from\s*)?['"]([^'"]+)['"]/gm;
const dynRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

const graph = {};
const sizes = {};
function walk(f) {
  if (graph[f]) return;
  const src = rd(f);
  sizes[f] = Buffer.byteLength(src);
  graph[f] = { static: [], dynamic: [] };
  for (const m of src.matchAll(statRe)) {
    const r = resolve(f, m[1]);
    if (r) {
      graph[f].static.push(r);
      walk(r);
    }
  }
  for (const m of src.matchAll(dynRe)) {
    const r = resolve(f, m[1]);
    if (r) {
      graph[f].dynamic.push(r);
      walk(r);
    }
  }
}
const ROOTS = [path.join(R, 'js/app.js'), path.join(R, 'js/boot.js')];
ROOTS.forEach(walk);

const rel = (f) => path.relative(R, f).split(path.sep).join('/');
const eager = new Set();
const depth = {};
{
  const q = ROOTS.map((f) => [f, 0]);
  while (q.length) {
    const [f, d] = q.shift();
    if (eager.has(f)) {
      depth[f] = Math.min(depth[f], d);
      continue;
    }
    eager.add(f);
    depth[f] = d;
    for (const c of graph[f].static) q.push([c, d + 1]);
  }
}
const all = Object.keys(graph);
const lazy = all.filter((f) => !eager.has(f));
const sum = (arr) => arr.reduce((s, f) => s + sizes[f], 0);
const KB = (n) => (n / 1024).toFixed(1) + ' KB';

console.log('\n════ ГРАФ ES-МОДУЛЕЙ ════');
console.log(`  всего достижимо: ${all.length} модулей, ${KB(sum(all))}`);
console.log(`  EAGER (на бут):  ${eager.size} модулей, ${KB(sum([...eager]))}`);
console.log(`  LAZY (по требованию): ${lazy.length} модулей, ${KB(sum(lazy))}`);

const maxD = Math.max(...Object.values(depth));
console.log(`\n  Глубина цепочки статических импортов: ${maxD} волн`);
console.log('  (каждая волна = отдельный round-trip, HTTP/1.1 без бандлера)');
for (let d = 0; d <= maxD; d++) {
  const lvl = [...eager].filter((f) => depth[f] === d);
  console.log(
    `   волна ${d}: ${String(lvl.length).padStart(2)} мод, ${KB(sum(lvl)).padStart(9)}  ${lvl
      .slice(0, 5)
      .map(rel)
      .join(', ')}${lvl.length > 5 ? ` +${lvl.length - 5}` : ''}`
  );
}

console.log('\n  Топ eager-модулей по весу:');
[...eager]
  .sort((a, b) => sizes[b] - sizes[a])
  .slice(0, 15)
  .forEach((f) => console.log(`   ${KB(sizes[f]).padStart(9)}  ${rel(f)}`));

/* ── сферы приложения ── */
const SPHERES = [
  ['Тренировка (workout)', /^js\/(workout|rest-timer|plate-calc|timer|workout-)/],
  ['Дашборд/главная', /^js\/(dashboard|insights)/],
  ['Аналитика/Intel', /^js\/(analytics|intel|strength-engine|progressive-overload)/],
  ['Профиль/Athlete Room', /^js\/(profile|shared\/athlete-room|body-stats|onboarding)/],
  ['AI-коуч', /^js\/(claude|workout-ai)/],
  ['Dynamic Island', /^js\/(shared\/dynamic-island|shared\/island|island-)/],
  ['Данные/DB/Sync', /^js\/(db|sync|supabase|workers)/],
  ['Privacy', /^js\/privacy/],
  ['UI-примитивы', /^js\/ui\//],
  ['Shared/утилиты', /^js\/(shared|events|flags|locale|shell|app|boot|version|types)/],
];
console.log('\n════ ВЕС ПО СФЕРАМ (весь js/) ════');
const jsFiles = [];
(function scan(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) scan(p);
    else if (e.name.endsWith('.js')) jsFiles.push(p);
  }
})(path.join(R, 'js'));
const rows = SPHERES.map(([name, re]) => {
  const f = jsFiles.filter((x) => re.test(rel(x)));
  return { name, n: f.length, bytes: f.reduce((s, x) => s + fs.statSync(x).size, 0), files: f };
});
const claimed = new Set(rows.flatMap((r) => r.files));
const rest = jsFiles.filter((f) => !claimed.has(f));
rows.push({ name: 'Прочее', n: rest.length, bytes: rest.reduce((s, x) => s + fs.statSync(x).size, 0) });
const totalJs = jsFiles.reduce((s, x) => s + fs.statSync(x).size, 0);
rows
  .sort((a, b) => b.bytes - a.bytes)
  .forEach((r) =>
    console.log(
      `  ${r.name.padEnd(24)} ${String(r.n).padStart(3)} файл. ${KB(r.bytes).padStart(9)}  ${String(Math.round((r.bytes / totalJs) * 100)).padStart(3)}%`
    )
  );
console.log(`  ${'ИТОГО js/'.padEnd(24)} ${String(jsFiles.length).padStart(3)} файл. ${KB(totalJs).padStart(9)}`);

/* ── сироты: файлы в js/, недостижимые из графа ── */
const orphans = jsFiles.filter((f) => !graph[f]);
if (orphans.length) {
  console.log(`\n════ СИРОТЫ (не достижимы из app.js/boot.js): ${orphans.length}, ${KB(sum2(orphans))} ════`);
  orphans.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size).forEach((f) =>
    console.log(`  ${KB(fs.statSync(f).size).padStart(9)}  ${rel(f)}`)
  );
}
function sum2(arr) {
  return arr.reduce((s, f) => s + fs.statSync(f).size, 0);
}
console.log('');
