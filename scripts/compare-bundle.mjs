/**
 * scripts/compare-bundle.mjs — A/B: голые ES-модули vs esbuild-бандл,
 * на профиле «Galaxy S23 Ultra, LTE в зале».
 *
 * Предварительно:
 *   npx esbuild js/app.js js/boot.js --bundle --format=esm --splitting \
 *     --outdir=_bundle --minify --target=es2022
 *   sed 's|js/boot.js|_bundle/boot.js|; s|js/app.js|_bundle/app.js|' index.html > _bundled.html
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3112';
const CPU = Number(process.argv.find((a) => a.startsWith('--cpu='))?.split('=')[1] ?? 1);

// S23 Ultra = Snapdragon 8 Gen 2, класс десктопа по JS → throttle 1x.
// LTE в зале: главный враг не полоса, а RTT и его джиттер.
const NETS = {
  'LTE зал (норма)': { latency: 120, download: (6 * 1024 * 1024) / 8, upload: (2 * 1024 * 1024) / 8 },
  'LTE зал (забитый)': { latency: 300, download: (1.5 * 1024 * 1024) / 8, upload: (500 * 1024) / 8 },
};
const VARIANTS = [
  ['модули (сейчас)', '/'],
  ['бандл (esbuild)', '/_bundled.html'],
];

const SEED = `(async () => {
  const types = ['push','pull','legs'];
  await window.DB.Settings.set('onboarding-complete', true);
  for (let i = 0; i < 120; i++) {
    await window.DB.Workouts.save({
      type: types[i%3], timestamp: Date.now() - i*86400000*1.6, duration: 3000,
      tonnage: 6000 + (i*137)%4000,
      exercises: Array.from({length:6},(_,e)=>({ name:'Ex'+e,
        sets: Array.from({length:4},(_,k)=>({ weight:40+((i+k*7)%60), reps:6+((i+k)%6), done:true })) })),
    });
  }
})()`;

const browser = await chromium.launch();
const results = [];

for (const [netName, cond] of Object.entries(NETS)) {
  for (const [vName, path] of VARIANTS) {
    const ctx = await browser.newContext({
      viewport: { width: 412, height: 915 }, // S23 Ultra CSS-пиксели
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });

    // сид без троттлинга
    const seed = await ctx.newPage();
    await seed.goto(BASE, { waitUntil: 'load' });
    await seed.waitForFunction(() => window.DB && window.DB.Settings, null, { timeout: 20000 });
    await seed.evaluate(SEED);
    await seed.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistrations();
      await Promise.all(r.map((x) => x.unregister()));
      const k = await caches.keys();
      await Promise.all(k.map((x) => caches.delete(x)));
    });
    await seed.close();

    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: cond.latency,
      downloadThroughput: cond.download,
      uploadThroughput: cond.upload,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await page.addInitScript(() => {
      window.__lt = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__lt.push(e.duration);
      }).observe({ type: 'longtask', buffered: true });
    });

    await page.goto(BASE + path, { waitUntil: 'load' });
    await page.waitForTimeout(6000);

    const m = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      const paints = Object.fromEntries(
        performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)])
      );
      const res = performance.getEntriesByType('resource');
      const js = res.filter((r) => r.name.endsWith('.js'));
      return {
        fcp: paints['first-contentful-paint'],
        allLoaded: Math.round(Math.max(...res.map((r) => r.responseEnd))),
        jsLoaded: js.length ? Math.round(Math.max(...js.map((r) => r.responseEnd))) : 0,
        jsReq: js.length,
        reqs: res.length,
        transfer: Math.round(res.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
        tbt: Math.round(window.__lt.reduce((s, d) => s + Math.max(0, d - 50), 0)),
      };
    });

    // отклик экранов
    const taps = {};
    for (const [sel, label] of [
      ['s-train', 'Train'],
      ['s-stats', 'Stats'],
      ['s-profile', 'Profile'],
    ]) {
      const t = await page.evaluate(async (s) => {
        const el = document.querySelector(`.nav-btn[data-s="${s}"]`);
        if (!el) return -1;
        const t0 = performance.now();
        el.click();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return Math.round(performance.now() - t0);
      }, sel);
      await page.waitForTimeout(2500); // ленивый чанк по медленной сети
      taps[label] = t;
    }

    results.push({ net: netName, variant: vName, ...m, taps });
    await ctx.close();
  }
}
await browser.close();

const P = (s, n) => String(s).padStart(n);
console.log(`\n══ S23 Ultra (CPU ${CPU}x, 412x915@3) · A/B модули vs бандл ══\n`);
console.log(
  '  сеть               вариант            FCP    весь JS   всё    JS-req  сеть    TBT   Train  Stats  Profile'
);
for (const r of results) {
  console.log(
    `  ${r.net.padEnd(19)}${r.variant.padEnd(18)}${P(r.fcp, 5)}${P(r.jsLoaded, 9)}${P(r.allLoaded, 7)}${P(r.jsReq, 8)}${P(r.transfer + 'K', 7)}${P(r.tbt, 6)}${P(r.taps.Train, 7)}${P(r.taps.Stats, 7)}${P(r.taps.Profile, 9)}`
  );
}
console.log('\n  (все тайминги в мс от старта навигации; TBT — блокировка главного потока)');
for (const net of Object.keys(NETS)) {
  const a = results.find((r) => r.net === net && r.variant.startsWith('модули'));
  const b = results.find((r) => r.net === net && r.variant.startsWith('бандл'));
  if (a && b)
    console.log(
      `  ${net}: весь JS ${a.jsLoaded} → ${b.jsLoaded} мс (${b.jsLoaded - a.jsLoaded >= 0 ? '+' : ''}${b.jsLoaded - a.jsLoaded}), запросов ${a.jsReq} → ${b.jsReq}, сеть ${a.transfer} → ${b.transfer} KB`
    );
}
console.log('');
