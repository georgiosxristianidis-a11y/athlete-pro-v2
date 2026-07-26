/**
 * scripts/profile.mjs — профессиональный перф-профиль приложения (не Lighthouse).
 *
 * Что меряет:
 *   1. Cold load: Navigation Timing L2, FCP/LCP, transfer bytes, request waterfall
 *   2. Long Tasks (>50ms) на бут — главный источник «залипания» интерфейса
 *   3. Code Coverage (CDP) — сколько JS/CSS байт загружено, но не выполнено
 *   4. Runtime: смена экранов (interaction → next paint), реальный INP-прокси
 *   5. Frame stats при скролле — dropped frames / jank
 *   6. JS heap + DOM node count (утечки при навигации)
 *
 * Запуск:  node scripts/profile.mjs [--cpu=4] [--net=3g] [--port=3111]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const arg = (n, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`));
  return m ? m.split('=')[1] : d;
};
const PORT = Number(arg('port', 3111));
const CPU_THROTTLE = Number(arg('cpu', 4)); // 1 = desktop, 4 = mid-tier android
const COVERAGE = arg('coverage', '1') !== '0'; // coverage искажает тайминги — гони отдельным прогоном
const BASE = `http://localhost:${PORT}`;

/* ───────────────────────── server ───────────────────────── */
async function startServer() {
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server timeout')), 15000);
    proc.stdout.on('data', (b) => {
      if (String(b).includes(String(PORT))) {
        clearTimeout(t);
        res();
      }
    });
    proc.stderr.on('data', (b) => process.stderr.write(b));
  });
  await new Promise((r) => setTimeout(r, 300));
  return proc;
}

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const ms = (n) => (n == null ? 'n/a' : Math.round(n) + ' ms');

/* ───────────────────────── main ───────────────────────── */
const server = await startServer();
const report = { meta: { cpuThrottle: CPU_THROTTLE, date: new Date().toISOString() } };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Mobile Safari/537.36',
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
await cdp.send('Performance.enable');
if (COVERAGE) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
}
await cdp.send('CSS.enable').catch(() => {});
await cdp.send('DOM.enable').catch(() => {});
await cdp.send('CSS.startRuleUsageTracking').catch(() => {});

/* сеть — реальный waterfall */
const requests = [];
page.on('response', async (res) => {
  try {
    const req = res.request();
    const h = await res.allHeaders();
    requests.push({
      url: res.url().replace(BASE, ''),
      type: req.resourceType(),
      status: res.status(),
      size: Number(h['content-length'] || 0),
      fromCache: false,
    });
  } catch {
    /* noop */
  }
});

/* наблюдатели ставим ДО загрузки документа */
await page.addInitScript(() => {
  window.__perf = { longTasks: [], lcp: 0, cls: 0, shifts: [] };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries())
      window.__perf.longTasks.push({ start: e.startTime, dur: e.duration });
  }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => {
    const e = l.getEntries().at(-1);
    if (e) window.__perf.lcp = e.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries())
      if (!e.hadRecentInput) {
        window.__perf.cls += e.value;
        window.__perf.shifts.push({ t: e.startTime, v: e.value });
      }
  }).observe({ type: 'layout-shift', buffered: true });
});

/* ── 0. СИД: без данных приложение показывает онбординг и профиль меряет не то ── */
const SEED_N = Number(arg('seed', 120));
if (SEED_N > 0) {
  const seedPage = await ctx.newPage();
  await seedPage.goto(BASE, { waitUntil: 'load' });
  await seedPage.waitForFunction(() => window.DB && window.DB.Settings, null, { timeout: 20000 });
  await seedPage.evaluate(async (n) => {
    const types = ['push', 'pull', 'legs'];
    const day = 86400000;
    await window.DB.Settings.set('onboarding-complete', true);
    for (let i = 0; i < n; i++) {
      const t = types[i % 3];
      await window.DB.Workouts.save({
        type: t,
        timestamp: Date.now() - i * day * 1.6,
        duration: 3000 + (i % 20) * 60,
        tonnage: 6000 + ((i * 137) % 4000),
        exercises: Array.from({ length: 6 }, (_, e) => ({
          name: `Exercise ${e + 1}`,
          sets: Array.from({ length: 4 }, (_, k) => ({
            weight: 40 + ((i + k * 7) % 60),
            reps: 6 + ((i + k) % 6),
            done: true,
          })),
        })),
      });
    }
  }, SEED_N);
  // сбрасываем SW/кеши — cold load должен быть холодным по сети, но с данными в IDB
  await seedPage.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  });
  await seedPage.close();
  report.meta.seededWorkouts = SEED_N;
}

/* ── 1. COLD LOAD ── */
const t0 = Date.now();
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(3000); // догрузка ленивых модулей + первый рендер дашборда

const nav = await page.evaluate(() => {
  const n = performance.getEntriesByType('navigation')[0] || {};
  const paints = Object.fromEntries(
    performance.getEntriesByType('paint').map((p) => [p.name, p.startTime])
  );
  const res = performance.getEntriesByType('resource').map((r) => ({
    name: r.name.split('/').slice(3).join('/'),
    type: r.initiatorType,
    start: r.startTime,
    dur: r.duration,
    transfer: r.transferSize,
    decoded: r.decodedBodySize,
  }));
  return {
    ttfb: n.responseStart,
    domContentLoaded: n.domContentLoadedEventEnd,
    load: n.loadEventEnd,
    domInteractive: n.domInteractive,
    fcp: paints['first-contentful-paint'],
    lcp: window.__perf.lcp,
    cls: window.__perf.cls,
    longTasks: window.__perf.longTasks,
    resources: res,
    domNodes: document.getElementsByTagName('*').length,
    modules: performance
      .getEntriesByType('resource')
      .filter((r) => r.name.endsWith('.js')).length,
  };
});
report.coldLoad = {
  wallClockMs: Date.now() - t0,
  ttfb: nav.ttfb,
  fcp: nav.fcp,
  lcp: nav.lcp,
  domInteractive: nav.domInteractive,
  load: nav.load,
  cls: nav.cls,
  domNodes: nav.domNodes,
  jsRequests: nav.modules,
  totalTransfer: nav.resources.reduce((s, r) => s + (r.transfer || 0), 0),
  totalDecoded: nav.resources.reduce((s, r) => s + (r.decoded || 0), 0),
  requestCount: nav.resources.length,
};
report.longTasksBoot = {
  count: nav.longTasks.length,
  totalBlockingMs: nav.longTasks.reduce((s, t) => s + Math.max(0, t.dur - 50), 0),
  totalMs: nav.longTasks.reduce((s, t) => s + t.dur, 0),
  worst: nav.longTasks.sort((a, b) => b.dur - a.dur).slice(0, 8),
};
report.waterfall = nav.resources
  .filter((r) => r.transfer > 0)
  .sort((a, b) => b.transfer - a.transfer)
  .slice(0, 25);

/* ── 2. COVERAGE (мёртвый вес) ── */
const cov = COVERAGE ? await cdp.send('Profiler.takePreciseCoverage') : { result: [] };
const jsCov = [];
for (const entry of cov.result) {
  if (!entry.url.startsWith(BASE)) continue;
  let total = 0;
  let used = 0;
  for (const fn of entry.functions) {
    for (const r of fn.ranges) {
      const len = r.endOffset - r.startOffset;
      if (fn.functionName === '' && fn.ranges.length === 1) total = Math.max(total, len);
      if (r.count > 0) used = Math.max(used, 0);
    }
  }
  jsCov.push(entry);
}
// точный расчёт через ranges: строим маску покрытия
function coverageOf(entry) {
  const ranges = [];
  for (const fn of entry.functions) for (const r of fn.ranges) ranges.push(r);
  if (!ranges.length) return { total: 0, used: 0 };
  const total = Math.max(...ranges.map((r) => r.endOffset));
  const mask = new Uint8Array(total);
  for (const r of ranges) {
    if (r.count > 0) mask.fill(1, r.startOffset, r.endOffset);
  }
  // вложенные непокрытые диапазоны затирают родителя
  for (const r of ranges) {
    if (r.count === 0) mask.fill(0, r.startOffset, r.endOffset);
  }
  let used = 0;
  for (let i = 0; i < total; i++) used += mask[i];
  return { total, used };
}
report.jsCoverage = jsCov
  .map((e) => {
    const { total, used } = coverageOf(e);
    return {
      url: e.url.replace(BASE, ''),
      total,
      used,
      unused: total - used,
      pctUnused: total ? Math.round(((total - used) / total) * 100) : 0,
    };
  })
  .filter((x) => x.total > 0)
  .sort((a, b) => b.unused - a.unused);

const cssCov = await cdp.send('CSS.stopRuleUsageTracking').catch(() => null);
if (cssCov) {
  const byStyleSheet = {};
  for (const r of cssCov.ruleUsage) {
    const s = (byStyleSheet[r.styleSheetId] ||= { used: 0, total: 0 });
    s.total += r.endOffset - r.startOffset;
    if (r.used) s.used += r.endOffset - r.startOffset;
  }
  report.cssCoverageRaw = Object.values(byStyleSheet).reduce(
    (acc, s) => ({ used: acc.used + s.used, total: acc.total + s.total }),
    { used: 0, total: 0 }
  );
}

/* ── 3. НАВИГАЦИЯ МЕЖДУ ЭКРАНАМИ (interaction → next paint) ── */
async function measureTap(selector, label) {
  const el = page.locator(selector).first();
  if (!(await el.count())) return { label, error: 'not found' };
  await page.evaluate(() => {
    window.__perf.longTasks.length = 0;
  });
  const res = await page.evaluate(async (sel) => {
    const node = document.querySelector(sel);
    const t = performance.now();
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    node.click();
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r()))
    );
    return performance.now() - t;
  }, selector);
  await page.waitForTimeout(1200); // дать доехать ленивому модулю
  const lt = await page.evaluate(() => window.__perf.longTasks.slice());
  const mem = await page.evaluate(() => ({
    heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
    nodes: document.getElementsByTagName('*').length,
  }));
  return {
    label,
    inpProxyMs: Math.round(res),
    longTasksAfter: lt.length,
    worstTaskMs: Math.round(Math.max(0, ...lt.map((t) => t.dur))),
    heapMB: +(mem.heap / 1048576).toFixed(1),
    domNodes: mem.nodes,
  };
}

const navTargets = [
  ['.nav-btn[data-s="s-train"]', 'Train'],
  ['.nav-btn[data-s="s-stats"]', 'Stats'],
  ['.nav-btn[data-s="s-profile"]', 'Profile'],
  ['.nav-btn[data-s="s-home"]', 'Home (back)'],
];
report.navigation = [];
for (const [sel, label] of navTargets) {
  report.navigation.push(await measureTap(sel, label));
}

/* ── 4. FRAME STATS при скролле ── */
await page.evaluate(() => window.__perf && (window.__perf.longTasks.length = 0));
const frames = await page.evaluate(async () => {
  const scroller =
    document.querySelector('.screen.active') ||
    document.scrollingElement ||
    document.body;
  const times = [];
  let last = performance.now();
  let running = true;
  const loop = () => {
    const n = performance.now();
    times.push(n - last);
    last = n;
    if (running) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  for (let i = 0; i < 30; i++) {
    scroller.scrollTop += 40;
    await new Promise((r) => setTimeout(r, 32));
  }
  running = false;
  await new Promise((r) => setTimeout(r, 50));
  const f = times.slice(2);
  const sorted = [...f].sort((a, b) => a - b);
  return {
    frames: f.length,
    avgMs: +(f.reduce((s, x) => s + x, 0) / f.length).toFixed(2),
    p95Ms: +sorted[Math.floor(sorted.length * 0.95)]?.toFixed(2),
    worstMs: +Math.max(...f).toFixed(2),
    dropped: f.filter((x) => x > 20).length,
  };
});
report.scrollFrames = frames;

/* ── 5. ПОВТОРНАЯ НАВИГАЦИЯ — тест утечек ── */
const leak = [];
for (let i = 0; i < 3; i++) {
  for (const [sel] of navTargets) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      await el.click({ force: true }).catch(() => {});
      await page.waitForTimeout(250);
    }
  }
  const m = await page.evaluate(() => ({
    heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
    nodes: document.getElementsByTagName('*').length,
    listeners: 0,
  }));
  const dom = await cdp.send('Performance.getMetrics');
  const pick = (n) => dom.metrics.find((x) => x.name === n)?.value;
  leak.push({
    cycle: i + 1,
    heapMB: +(m.heap / 1048576).toFixed(1),
    domNodes: pick('Nodes') ?? m.nodes,
    jsListeners: pick('JSEventListeners'),
    layoutCount: pick('LayoutCount'),
    recalcStyleCount: pick('RecalcStyleCount'),
    scriptDurationS: +(pick('ScriptDuration') || 0).toFixed(3),
    layoutDurationS: +(pick('LayoutDuration') || 0).toFixed(3),
    recalcDurationS: +(pick('RecalcStyleDuration') || 0).toFixed(3),
  });
}
report.leakProbe = leak;

/* ── 6. ПОВТОРНЫЙ ВИЗИТ (service worker / cache) ── */
const t1 = Date.now();
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(1500);
report.warmLoad = await page.evaluate(() => {
  const n = performance.getEntriesByType('navigation')[0] || {};
  const paints = Object.fromEntries(
    performance.getEntriesByType('paint').map((p) => [p.name, p.startTime])
  );
  const res = performance.getEntriesByType('resource');
  return {
    fcp: paints['first-contentful-paint'],
    load: n.loadEventEnd,
    transfer: res.reduce((s, r) => s + (r.transferSize || 0), 0),
    fromCache: res.filter((r) => r.transferSize === 0).length,
    total: res.length,
  };
});
report.warmLoad.wallClockMs = Date.now() - t1;

await browser.close();
server.kill();

/* ───────────────────────── вывод ───────────────────────── */
const out = path.join(ROOT, 'PERF_PROFILE.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2));

const L = console.log;
L('\n══════════ ATHLETE PRO — PERF PROFILE ══════════');
L(`CPU throttle: ${CPU_THROTTLE}x (эмуляция среднего Android), viewport 390x844\n`);

L('── 1. COLD LOAD ──');
const c = report.coldLoad;
L(`  TTFB            ${ms(c.ttfb)}`);
L(`  FCP             ${ms(c.fcp)}`);
L(`  LCP             ${ms(c.lcp)}`);
L(`  DOM interactive ${ms(c.domInteractive)}`);
L(`  load event      ${ms(c.load)}`);
L(`  CLS             ${c.cls.toFixed(4)}`);
L(`  запросов        ${c.requestCount} (из них JS: ${c.jsRequests})`);
L(`  трафик          ${kb(c.totalTransfer)} по сети / ${kb(c.totalDecoded)} распаковано`);
L(`  DOM-узлов       ${c.domNodes}`);

L('\n── 2. LONG TASKS на бут (>50ms = залипание) ──');
L(`  всего задач ${report.longTasksBoot.count}, суммарно ${ms(report.longTasksBoot.totalMs)}`);
L(`  TBT (blocking) ${ms(report.longTasksBoot.totalBlockingMs)}`);
for (const t of report.longTasksBoot.worst)
  L(`    ${ms(t.dur).padStart(8)}  @ ${ms(t.start)}`);

L('\n── 3. ТОП-15 по весу (сеть) ──');
for (const r of report.waterfall.slice(0, 15))
  L(`  ${kb(r.transfer).padStart(9)}  ${ms(r.dur).padStart(8)}  ${r.name}`);

L('\n── 4. МЁРТВЫЙ JS (загружен, но не исполнен) ──');
const totUnused = report.jsCoverage.reduce((s, x) => s + x.unused, 0);
const totAll = report.jsCoverage.reduce((s, x) => s + x.total, 0);
L(totAll ? `  ИТОГО: ${kb(totUnused)} из ${kb(totAll)} не исполнено (${Math.round((totUnused / totAll) * 100)}%)` : '  (пропущено: --coverage=0)');
for (const x of report.jsCoverage.slice(0, 15))
  L(`  ${kb(x.unused).padStart(9)} (${String(x.pctUnused).padStart(3)}%)  ${x.url}`);
if (report.cssCoverageRaw) {
  const cc = report.cssCoverageRaw;
  L(
    `  CSS: ${kb(cc.total - cc.used)} из ${kb(cc.total)} правил не применились (${Math.round(((cc.total - cc.used) / cc.total) * 100)}%)`
  );
}

L('\n── 5. ОТКЛИК ЭКРАНОВ (tap → next paint) ──');
for (const n of report.navigation) {
  if (n.error) {
    L(`  ${n.label.padEnd(14)} — селектор не найден`);
    continue;
  }
  L(
    `  ${n.label.padEnd(14)} ${String(n.inpProxyMs).padStart(5)} ms | worst task ${String(n.worstTaskMs).padStart(5)} ms | heap ${n.heapMB} MB | DOM ${n.domNodes}`
  );
}

L('\n── 6. ПЛАВНОСТЬ СКРОЛЛА ──');
const f = report.scrollFrames;
L(`  кадров ${f.frames} | avg ${f.avgMs} ms | p95 ${f.p95Ms} ms | worst ${f.worstMs} ms | пропущено ${f.dropped}`);

L('\n── 7. УТЕЧКИ (3 цикла обхода всех экранов) ──');
for (const l of report.leakProbe)
  L(
    `  цикл ${l.cycle}: heap ${String(l.heapMB).padStart(5)} MB | DOM ${String(l.domNodes).padStart(5)} | listeners ${String(l.jsListeners).padStart(4)} | layouts ${l.layoutCount} | recalc ${l.recalcStyleCount}`
  );
const d = report.leakProbe;
if (d.length > 1) {
  L(
    `  дельта 1→3: heap ${(d[2].heapMB - d[0].heapMB).toFixed(1)} MB, DOM ${d[2].domNodes - d[0].domNodes} узлов, listeners ${d[2].jsListeners - d[0].jsListeners}`
  );
}

L('\n── 8. ПОВТОРНЫЙ ВИЗИТ (SW/кеш) ──');
const w = report.warmLoad;
L(
  `  FCP ${ms(w.fcp)} | load ${ms(w.load)} | сеть ${kb(w.transfer)} | из кеша ${w.fromCache}/${w.total}`
);

L(`\nПолный JSON: ${path.relative(ROOT, out)}\n`);
