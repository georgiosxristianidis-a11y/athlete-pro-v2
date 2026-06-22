// @ts-check
/**
 * Athlete Pro — E2E regression guards (2026-06-22 session).
 * Covers: module-load resilience (no 408 / ERR_FAILED), air-gap-safe Supabase
 * (no CDN fetch on boot), Add Exercise picker styling, set-logger drum
 * visibility, and the live Dynamic Island DHL tracker.
 */

const BASE = 'http://localhost:3000';
import { test, expect } from '@playwright/test';

/** Mark onboarding complete in IDB before the app boots. */
async function bypassOnboarding(page) {
  await page.addInitScript(() => {
    const origOpen = window.indexedDB.open.bind(window.indexedDB);
    window.indexedDB.open = function (name, version) {
      const req = origOpen(name, version);
      req.addEventListener('success', () => {
        const db = req.result;
        if (db.objectStoreNames.contains('settings')) {
          const tx = db.transaction('settings', 'readwrite');
          tx.objectStore('settings').put({ key: 'onboarding-complete', value: true });
        }
      });
      return req;
    };
  });
}

async function waitForBoot(page) {
  await page.waitForFunction(() => {
    const nav = document.getElementById('nav');
    return (nav && nav.offsetHeight > 0) ||
      document.getElementById('loading')?.classList.contains('hidden');
  }, { timeout: 12000 });
}

/**
 * Reliable onboarding bypass: load once, write the flag through the app's own
 * DB layer, reload. The IDB.open hook in bypassOnboarding races the first
 * paint, leaving the onboarding overlay (z-index 9000) covering the UI so set
 * rows render but are never "visible". This guarantees a clean main screen.
 */
async function openApp(page) {
  await page.goto(BASE);
  await waitForBoot(page);
  const flagged = await page.evaluate(async () => {
    const { DB } = await import('/js/db.js');
    if (await DB.Settings.get('onboarding-complete', false)) return false;
    await DB.Settings.set('onboarding-complete', true);
    return true;
  });
  if (flagged) { await page.reload(); await waitForBoot(page); }
  await page.waitForFunction(() => !document.getElementById('onboarding-overlay'), { timeout: 8000 });
}

/** Start a live PULL session so set rows / island chambers exist. */
async function startWorkout(page) {
  await page.locator('button[data-s="s-train"]').click();
  await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 5000 });
  // The workout view (and window.Workout) is lazy-loaded by the nav switch;
  // calling selectType before it exists is a silent no-op → no set rows.
  await page.waitForFunction(() => typeof window.Workout?.selectType === 'function', { timeout: 10000 });
  // Cold first run also fetches the 85KB exercise library, so retry until the
  // plan's .set-row nodes render.
  await expect(async () => {
    await page.evaluate(() => window.Workout.selectType('pull'));
    await page.waitForSelector('.set-row', { state: 'visible', timeout: 6000 });
  }).toPass({ timeout: 20000 });
}

// ─── Module-load resilience ───────────────────────────────────────────────
test.describe('Module loading', () => {
  test.beforeEach(async ({ page }) => bypassOnboarding(page));

  test('no JS module fails to load (no 408 / ERR_FAILED) through dashboard', async ({ page }) => {
    /** @type {string[]} */
    const failed = [];
    /** @type {string[]} */
    const bad408 = [];
    page.on('requestfailed', (r) => {
      if (r.url().endsWith('.js')) failed.push(`${r.url()} ${r.failure()?.errorText}`);
    });
    page.on('response', (r) => {
      if (r.url().includes('/js/') && r.status() === 408) bad408.push(r.url());
    });
    await page.goto(BASE);
    await waitForBoot(page);
    await page.waitForTimeout(1500);
    expect(failed, `failed JS: ${failed.join(', ')}`).toHaveLength(0);
    expect(bad408, `408 JS: ${bad408.join(', ')}`).toHaveLength(0);
  });

  test('Supabase SDK is NOT fetched from the CDN on boot (air-gap safe)', async ({ page }) => {
    /** @type {string[]} */
    const cdn = [];
    page.on('request', (r) => {
      if (r.url().includes('jsdelivr.net')) cdn.push(r.url());
    });
    await page.goto(BASE);
    await waitForBoot(page);
    await page.waitForTimeout(1500);
    expect(cdn, `CDN requests: ${cdn.join(', ')}`).toHaveLength(0);
  });

  test('progressive-overload.js and sync.js import cleanly', async ({ page }) => {
    await page.goto(BASE);
    await waitForBoot(page);
    const res = await page.evaluate(async () => {
      const out = {};
      try { await import('/js/progressive-overload.js'); out.po = true; } catch (e) { out.po = String(e); }
      try { await import('/js/sync.js'); out.sync = true; } catch (e) { out.sync = String(e); }
      return out;
    });
    expect(res.po).toBe(true);
    expect(res.sync).toBe(true);
  });
});

// ─── Add Exercise picker ──────────────────────────────────────────────────
test.describe('Add Exercise picker', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await startWorkout(page);
  });

  test('picker opens with styled (non-native) exercise cards', async ({ page }) => {
    await page.evaluate(() => window.Workout?._addLiveExercise());
    const item = page.locator('.add-ex-item').first();
    await expect(item).toBeVisible({ timeout: 5000 });

    const style = await item.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, radius: cs.borderRadius, display: cs.display };
    });
    // Native button fallback was rgb(240,240,240) / 0px radius / inline-block —
    // white text on it was invisible. Assert the styled card chassis instead.
    expect(style.bg).not.toBe('rgb(240, 240, 240)');
    expect(style.radius).not.toBe('0px');
    expect(style.display).toBe('block');
  });

  test('exercise name text is readable (light on dark contrast)', async ({ page }) => {
    await page.evaluate(() => window.Workout?._addLiveExercise());
    const item = page.locator('.add-ex-item').first();
    await expect(item).toBeVisible({ timeout: 5000 });
    const ok = await item.evaluate((el) => {
      const name = el.querySelector('div');
      if (!name) return false;
      const txtRgb = getComputedStyle(name).color;            // expect near-white
      const bg = getComputedStyle(el).backgroundColor;        // dark OR translucent-over-dark
      const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
      const lum = (c) => { const m = parse(c); return (m[0] + m[1] + m[2]) / 3; };
      const m = parse(bg);
      const alpha = m.length >= 4 ? m[3] : 1;
      // The surface token is rgba(255,255,255,0.035) — visually dark on the
      // near-black page. A naive RGB-only luminance reads 255 and wrongly
      // flags it light, so treat low-alpha fills as dark (and still reject the
      // old opaque rgb(240,240,240) native-button fallback: alpha 1, lum 240).
      const bgIsDark = alpha < 0.5 || lum(bg) < 90;
      return lum(txtRgb) > 180 && bgIsDark;
    });
    expect(ok).toBe(true);
  });
});

// ─── Set-logger drum ──────────────────────────────────────────────────────
test.describe('Set logger drum', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await startWorkout(page);
  });

  test('active drum value is visible and vertically centred in its wrap', async ({ page }) => {
    const wrap = page.locator('.drum-wrap').first();
    await expect(wrap).toBeVisible({ timeout: 5000 });
    const geo = await wrap.evaluate((el) => {
      const active = el.querySelector('.drum-item--active');
      if (!active) return null;
      const wr = el.getBoundingClientRect();
      const ar = active.getBoundingClientRect();
      return {
        opacity: +getComputedStyle(active).opacity,
        activeCenter: Math.round(ar.top + ar.height / 2 - wr.top),
        wrapCenter: Math.round(wr.height / 2),
        insideWrap: ar.top >= wr.top - 1 && ar.bottom <= wr.bottom + 1,
        text: active.textContent,
      };
    });
    expect(geo).not.toBeNull();
    expect(geo.opacity).toBe(1);
    expect(geo.text?.trim().length).toBeGreaterThan(0);
    expect(geo.insideWrap).toBe(true);
    // centred within ~2px tolerance
    expect(Math.abs(geo.activeCenter - geo.wrapCenter)).toBeLessThanOrEqual(2);
  });
});

// ─── Dynamic Island DHL tracker ───────────────────────────────────────────
test.describe('Dynamic Island chamber tracker', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await startWorkout(page);
  });

  test('expanded island renders the 4-marker DHL tracker', async ({ page }) => {
    await page.evaluate(() => {
      window.DynamicIsland?.show();
      window.DynamicIsland?.update();
      window.DynamicIsland?.toggleExpand();
      window.DynamicIsland?.update();
    });
    const markers = page.locator('#di-tracker .it-marker');
    await expect(markers).toHaveCount(4, { timeout: 5000 });
  });
});

// ─── Error boundary: benign vs genuine rejections ─────────────────────────
test.describe('Unhandled-rejection boundary', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  /** Dispatch a synthetic unhandledrejection; return {prevented, newToasts}. */
  async function fireRejection(page, reason) {
    return page.evaluate((r) => {
      const err = r.name === 'DOMException'
        ? new DOMException(r.message, 'InvalidStateError')
        : Object.assign(new (r.ctor === 'TypeError' ? TypeError : Error)(r.message), { name: r.name });
      const before = document.querySelectorAll('.toast').length;
      const ev = new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.reject(err).catch(() => {}), reason: err, cancelable: true,
      });
      window.dispatchEvent(ev);
      return { prevented: ev.defaultPrevented, newToasts: document.querySelectorAll('.toast').length - before };
    }, reason);
  }

  // preventDefault is called ONLY on the benign branch, which returns before
  // Toast.show — so prevented===true is the non-racy proof of suppression
  // (a stray boot toast must not flake the assertion).
  test('View-Transition abort is suppressed (no error toast)', async ({ page }) => {
    const res = await fireRejection(page, { name: 'DOMException', message: 'Transition was aborted because of invalid state' });
    expect(res.prevented).toBe(true);
  });

  test('air-gapped cloud-module import failure is suppressed', async ({ page }) => {
    const res = await fireRejection(page, { name: 'TypeError', ctor: 'TypeError', message: 'Failed to fetch dynamically imported module: http://localhost:3000/js/sync.js' });
    expect(res.prevented).toBe(true);
  });

  test('a genuine rejection still surfaces an error toast', async ({ page }) => {
    const res = await fireRejection(page, { name: 'Error', message: 'genuine boom' });
    expect(res.prevented).toBe(false);
    expect(res.newToasts).toBeGreaterThan(0);
  });
});
