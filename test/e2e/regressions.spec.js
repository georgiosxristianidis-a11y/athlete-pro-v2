// @ts-check
/**
 * Athlete Pro — E2E regression guards (2026-06-22 session).
 * Covers: module-load resilience (no 408 / ERR_FAILED), air-gap-safe Supabase
 * (no CDN fetch on boot), Add Exercise picker styling, set-logger drum
 * visibility, and the live Dynamic Island DHL tracker.
 */

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
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

    const readGeo = () => wrap.evaluate((el) => {
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

    // The drum centres its active item via requestAnimationFrame scrollTop after
    // render, so the geometry isn't settled the instant the wrap turns visible —
    // poll until it's centred instead of reading once and racing the rAF.
    await expect.poll(async () => {
      const g = await readGeo();
      return g ? Math.abs(g.activeCenter - g.wrapCenter) : 999;
    }, { timeout: 5000 }).toBeLessThanOrEqual(2);

    // opacity transitions 0.4 → 1 (--t-fast) after the active class lands;
    // poll past the transition instead of racing it
    await expect.poll(async () => (await readGeo())?.opacity ?? 0, { timeout: 5000 }).toBe(1);

    const geo = await readGeo();
    expect(geo).not.toBeNull();
    expect(geo.text?.trim().length).toBeGreaterThan(0);
    expect(geo.insideWrap).toBe(true);
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

  // Regression: there used to be TWO unhandledrejection listeners — a
  // classifying one in app.js and an unconditional one in boot.js.
  // preventDefault() does not stop the other listener, so every benign
  // rejection still hit console.error + an error toast, i.e. the
  // classification was dead code. The boundary now exists only in boot.js.
  test('a benign rejection reaches no second handler (no console.error, no toast)', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    const res = await fireRejection(page, { name: 'DOMException', message: 'Transition was aborted because of invalid state' });
    await page.waitForTimeout(300);

    expect(res.prevented).toBe(true);
    expect(res.newToasts).toBe(0);
    expect(errors.filter((t) => /transition was aborted/i.test(t))).toEqual([]);
  });

  test('a genuine rejection is reported exactly once', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    // Distinct handlers used to phrase the toast differently ('Something went
    // wrong' vs toUserMessage), so Toast's dedup could not mask the double —
    // two toasts appeared. One boundary ⇒ exactly one of each.
    const res = await fireRejection(page, { name: 'Error', message: 'double-report canary' });
    await page.waitForTimeout(300);

    expect(res.newToasts).toBe(1);
    expect(errors.filter((t) => /double-report canary/.test(t))).toHaveLength(1);
  });
});

// ─── F-10: system Back closes Athlete Room ────────────────────────────────
test.describe('F-10 Athlete Room Back', () => {
  /** Profile → open the room over it, leaving s-train one history entry back. */
  async function openRoomOverProfile(page) {
    await openApp(page);
    await page.locator('button[data-s="s-train"]').click();
    await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 5000 });
    await page.locator('button[data-s="s-profile"]').click();
    await expect(page.locator('#s-profile')).toHaveClass(/active/, { timeout: 5000 });
    await page.locator('#pp-avatar-main').waitFor({ state: 'visible', timeout: 8000 });
    await page.locator('#pp-avatar-main').click();
    await expect(page.locator('#athlete-room')).toHaveClass(/open/, { timeout: 8000 });
  }

  test('hardware Back closes the room and leaves the screen underneath', async ({ page }) => {
    await openRoomOverProfile(page);

    await page.goBack();

    await expect(page.locator('#athlete-room')).not.toHaveClass(/open/);
    await expect(page.locator('#s-profile')).toHaveClass(/active/);
    await expect(page.locator('#s-train')).not.toHaveClass(/active/);
  });

  test('chevron close consumes history so the next Back is a screen pop', async ({ page }) => {
    await openRoomOverProfile(page);

    await page.locator('#athlete-room .ar-back-btn').click();
    await expect(page.locator('#athlete-room')).not.toHaveClass(/open/);
    await expect(page.locator('#s-profile')).toHaveClass(/active/);

    await page.goBack();
    await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 5000 });
  });

  test('Escape closes the room without moving the screen', async ({ page }) => {
    await openRoomOverProfile(page);

    await page.keyboard.press('Escape');

    await expect(page.locator('#athlete-room')).not.toHaveClass(/open/);
    await expect(page.locator('#s-profile')).toHaveClass(/active/);
    await expect(page.locator('#s-train')).not.toHaveClass(/active/);
  });
});

// ─── HYG-6 field tail: пять путей реальным .tap() ─────────────────────────
/*
 * HYG-6 field tail — five paths the queue named as "тесты кроют исходник, а
 * не палец": each already has unit or regex-on-source coverage, but no test
 * ever drove the real interaction with a Playwright touch gesture (`.tap()`,
 * which dispatches touchstart/touchend) instead of `.click()` (synthetic
 * mouse, even on a `hasTouch` profile — see playwright.config.js).
 *
 * 1. Data deletion — profile.js hold-to-arm `#clear-data-btn`.
 * 2. Weekly report without network — intel.view.js generateWeekly() → local
 *    branch (isCoachLocal()), no request to /api/coach*.
 * 3. Confirmation sheet — shared/confirm.js confirmDialog(), both branches.
 * 4. "+15s on the island" — dynamic-island.js #di-rest-plus → RestTimer.addTime.
 * 5. Quick Start after sex is chosen — onboarding.js _obQuickStart() must not
 *    reset an already-chosen sex to the male placeholder.
 */

// ─── 1. Data deletion — real hold-to-arm tap sequence ──────────────────────
test.describe('HYG-6 field tail — data deletion (profile.js hold-to-arm)', () => {
  test('two real taps on #clear-data-btn actually wipe local data', async ({ page }) => {
    await openApp(page);
    await page.locator('button[data-s="s-profile"]').tap();
    await expect(page.locator('#s-profile')).toHaveClass(/active/, { timeout: 3000 });

    const btn = page.locator('#clear-data-btn');
    await btn.tap(); // arm
    await expect(btn).toHaveClass(/armed/, { timeout: 2000 });

    await btn.tap(); // confirm within the 3s window
    // clearAllData() reloads the page after the 400ms slide-out.
    await page.waitForURL(BASE + '/', { timeout: 5000 }).catch(() => {});
    await waitForBoot(page);

    // Settings store (incl. onboarding-complete) was wiped → onboarding is required again.
    await expect(page.locator('#onboarding-overlay')).toBeVisible({ timeout: 8000 });
  });
});

// ─── 2. Weekly report without network ──────────────────────────────────────
test.describe('HYG-6 field tail — weekly report without network (intel local branch)', () => {
  test('tapping "weekly" while offline renders local insights, never calls /api/coach*', async ({
    page,
  }) => {
    await openApp(page);

    // Fresh install stays airgap/local (CORE-8) — seed a little history so
    // localCoachInsights() has something to say instead of the empty-state card.
    await page.evaluate(async () => {
      const { DB } = await import('/js/db.js');
      const now = Date.now();
      const DAY = 24 * 60 * 60 * 1000;
      for (const d of [1, 3, 6, 9]) {
        await DB.Workouts.save({
          type: 'push',
          timestamp: now - d * DAY,
          tonnage: 100 * 5 * 3,
          duration: 3_600_000,
          exercises: [
            { name: 'Bench Press', sets: [1, 2, 3].map(() => ({ weight: 100, reps: 5, done: true })) },
          ],
        });
      }
    });

    const apiCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/coach')) apiCalls.push(r.url());
    });

    // Reaching the FAB is scaffolding, not the path under test — real .tap()
    // on the draggable FAB is documented flaky (athlete-pro.spec.js, "clicking
    // FAB navigates to Intel screen"), so reuse the suite's own workaround.
    // Reached while still online: the screen's own /api/ai-status probe is a
    // separate, ungated concern from the weekly-report path under test here.
    await page.locator('button[data-s="s-stats"]').tap();
    await page.waitForSelector('#claude-fab', { timeout: 8000 });
    await page.locator('#claude-fab').dispatchEvent('click');
    await expect(page.locator('#s-intel')).toHaveClass(/active/, { timeout: 10000 });

    // Clear whatever door-open auto-render already put there, so the assertion
    // below is attributable to the tap on "weekly", not to screen load.
    await page.evaluate(() => {
      const mount = document.getElementById('intel-local-mount');
      if (mount) mount.innerHTML = '';
    });

    await page.context().setOffline(true);
    await page.locator('.intel-module-card[data-action="intel:weekly"]').tap();

    await expect(page.locator('#intel-local-mount .intel-local-insights li').first()).toBeVisible({
      timeout: 5000,
    });
    expect(apiCalls, `expected zero /api/coach calls while offline, got: ${apiCalls.join(', ')}`).toHaveLength(0);

    await page.context().setOffline(false);
  });
});

// ─── 3. Confirmation sheet — both branches, real taps ──────────────────────
test.describe('HYG-6 field tail — confirmation sheet (shared/confirm.js)', () => {
  async function openPassport(page) {
    await page.locator('#privacy-indicator').tap();
    await expect(page.locator('#s-island-settings')).toHaveClass(/active/, { timeout: 5000 });
    await page.locator('.data-btn[data-action="privacy:passport"]').tap();
    await page.locator('[data-action="privacy:confirmDelete"]').tap();
    await expect(page.locator('.confirm-overlay')).toBeVisible({ timeout: 3000 });
  }

  test('tapping cancel closes the sheet and keeps data intact', async ({ page }) => {
    await openApp(page);
    await openPassport(page);

    await page.locator('.confirm-cancel').tap();
    await expect(page.locator('.confirm-overlay')).not.toBeAttached({ timeout: 3000 });

    const stillThere = await page.evaluate(async () => {
      const { DB } = await import('/js/db.js');
      return DB.Settings.get('onboarding-complete', false);
    });
    expect(stillThere).toBe(true);
  });

  test('tapping ok deletes data and reloads', async ({ page }) => {
    await openApp(page);
    await openPassport(page);

    await page.locator('.confirm-ok').tap();
    await waitForBoot(page);
    await expect(page.locator('#onboarding-overlay')).toBeVisible({ timeout: 8000 });
  });
});

// ─── 4. "+15s on the island" — real tap extends a live rest window ─────────
test.describe('HYG-6 field tail — +15s island button (dynamic-island.js)', () => {
  test('real tap on #di-rest-plus extends the rest past its original deadline', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
      const { DB } = await import('/js/db.js');
      await DB.Settings.set('rest-duration', 3); // short rest — keeps the test fast
    });

    await page.locator('button[data-s="s-train"]').tap();
    await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 5000 });
    await page.waitForFunction(() => typeof window.Workout?.selectType === 'function', { timeout: 10000 });
    await expect(async () => {
      await page.evaluate(() => window.Workout.selectType('pull'));
      await page.waitForSelector('.set-row', { state: 'visible', timeout: 6000 });
    }).toPass({ timeout: 20000 });

    // Real tap on the set checkmark — the actual trigger for RestTimer.start().
    await page.locator('#chk-0-0').tap();

    const island = page.locator('#dynamic-island');
    await expect(island).toHaveClass(/timer-mode/, { timeout: 3000 });

    await page.waitForTimeout(1000); // ~1s into the 3s rest
    const plus = page.locator('#di-rest-plus');
    await expect(plus).toBeVisible();
    await plus.tap(); // real touch tap — the path under test

    await page.waitForTimeout(2500); // past the ORIGINAL 3s deadline, nowhere near the +15s one
    await expect(island).toHaveClass(/timer-mode/); // still resting → the tap actually landed
  });
});

// ─── 5. Quick Start after sex is chosen ────────────────────────────────────
test.describe('HYG-6 field tail — Quick Start after sex (onboarding.js)', () => {
  test.use({ locale: 'en-US' });

  test('sex chosen on the bio step survives a real tap through Quick Start', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('#onboarding-overlay')).toBeVisible({ timeout: 8000 });

    await page.locator('.ob-card[data-key="strength"]').tap();
    await page.locator('#ob-next-btn').tap();
    await page.locator('.ob-card[data-key="beginner"]').tap();
    await page.locator('#ob-next-btn').tap();
    await expect(page.getByRole('heading', { name: /tell us about you/i })).toBeVisible();

    await page.locator('.ob-btn-tab[data-value="f"]').tap();

    // Back to step 1 — the exact path _obQuickStart's comment names as the
    // one that used to drop the chosen sex.
    await page.locator('button[data-action="ob:prev"]').tap();
    await page.locator('button[data-action="ob:prev"]').tap();

    await page.locator('.ob-fast-skip-btn').tap();
    await expect(page.locator('.ob-skip-list')).toContainText('Female');

    await page.locator('.ob-skip-apply').tap();
    await expect(page.locator('#onboarding-overlay')).not.toBeAttached({ timeout: 5000 });

    const sex = await page.evaluate(async () => {
      const { DB } = await import('/js/db.js');
      return DB.Settings.get('profile.sex');
    });
    expect(sex).toBe('f');
  });
});

// ─── MO-2b: лист истории упражнения на .sd-overlay ────────────────────────
// Рецепт MO-2 в реальном движке (unit-гард test/sd-overlay.test.js видит только
// исходник). WebKit здесь — единственный сигнал, что @starting-style ведёт вход
// в Safari. До 1.27.128 лист входил на @keyframes, выход был 300 мс замершего
// листа, ловящего тапы, а нижний отступ уходил под край экрана.
test.describe('MO-2b exercise history sheet', () => {
  test('entry on transitions, bottom padding above the edge, closing sheet lets taps through', async ({ page }) => {
    await openApp(page);
    await page.locator('button[data-s="s-stats"]').click();
    await expect(page.locator('#s-stats')).toHaveClass(/active/, { timeout: 5000 });

    const entry = await page.evaluate(async () => {
      const { openExerciseHistoryModal } = await import('/js/analytics.view.js');
      openExerciseHistoryModal('Bench Press');
      const ov = /** @type {HTMLElement} */ (document.querySelector('.ex-history-overlay'));
      const anims = ov.getAnimations({ subtree: true });
      const kinds = anims.map((a) => ('transitionProperty' in a ? a.transitionProperty : 'keyframes'));
      await Promise.all(anims.map((a) => a.finished));
      const sheet = /** @type {HTMLElement} */ (ov.querySelector('.modal-sheet'));
      sheet.scrollTop = sheet.scrollHeight;
      const lastBottom = /** @type {Element} */ (sheet.lastElementChild).getBoundingClientRect().bottom;
      return { kinds: kinds.sort(), gap: window.innerHeight - lastBottom };
    });
    expect(entry.kinds).toEqual(['opacity', 'transform']);
    expect(entry.gap).toBeGreaterThanOrEqual(31);

    // Клик и замер в одном синхронном кадре: выход длится 140 мс, раунд-трип
    // Playwright между ними дал бы флак.
    const closing = await page.evaluate(() => {
      const ov = /** @type {HTMLElement} */ (document.querySelector('.ex-history-overlay'));
      /** @type {HTMLElement} */ (ov.querySelector('#ex-history-close')).click();
      const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 40);
      return {
        closing: ov.hasAttribute('data-closing'),
        stillMounted: ov.isConnected,
        catchesTap: !!hit && ov.contains(hit),
      };
    });
    expect(closing).toEqual({ closing: true, stillMounted: true, catchesTap: false });
    await expect(page.locator('.ex-history-overlay')).toHaveCount(0, { timeout: 2000 });
  });
});

// ─── MO-2b: листы приватности на .sd-overlay ──────────────────────────────
// Закрывающийся лист живёт до конца выхода, и повторное открытие даёт в DOM два
// узла с одним id. До 1.27.143 крестик нового листа через getElementById находил
// уходящий, и новый лист не закрывался. Очистка журнала закрывала и открывала
// лист заново — выход и въезд ради пустого списка.
test.describe('MO-2b privacy sheets', () => {
  test('reopen during exit closes the new sheet, clearing the log keeps the sheet', async ({
    page,
  }) => {
    await openApp(page);

    const reopen = await page.evaluate(async () => {
      const { openAuditLog } = await import('/js/privacy.view.js');
      openAuditLog();
      const first = /** @type {HTMLElement} */ (document.querySelector('#audit-overlay'));
      /** @type {HTMLElement} */ (
        first.querySelector('[data-action="privacy:closeOverlay"]')
      ).click();
      openAuditLog();
      const all = [...document.querySelectorAll('#audit-overlay')];
      const second = /** @type {HTMLElement} */ (all[all.length - 1]);
      /** @type {HTMLElement} */ (
        second.querySelector('[data-action="privacy:closeOverlay"]')
      ).click();
      return { mounted: all.length, secondClosing: second.hasAttribute('data-closing') };
    });
    expect(reopen).toEqual({ mounted: 2, secondClosing: true });
    await expect(page.locator('#audit-overlay')).toHaveCount(0, { timeout: 2000 });

    const cleared = await page.evaluate(async () => {
      const { openAuditLog } = await import('/js/privacy.view.js');
      openAuditLog();
      const ov = /** @type {HTMLElement} */ (document.querySelector('#audit-overlay'));
      /** @type {HTMLElement} */ (ov.querySelector('[data-action="privacy:clearAudit"]')).click();
      await new Promise((r) => setTimeout(r, 300));
      const now = document.querySelectorAll('#audit-overlay');
      return {
        same: now.length === 1 && now[0] === ov,
        closing: ov.hasAttribute('data-closing'),
        empty: !!ov.querySelector('.audit-empty'),
      };
    });
    expect(cleared).toEqual({ same: true, closing: false, empty: true });
  });
});

// ─── MO-2b: лист настроек ИИ на .sd-overlay ────────────────────────────────
// В листе мигает `.ai-indicator.missing` (`infinite`, зависит от статуса ИИ на
// сервере). Его finished не резолвится никогда: до 1.27.141 dismissOverlay ждал
// и его, и невидимый лист оставался в DOM. Вечную анимацию вешаем явно — кейс
// не должен зависеть от ключа на сервере. Закрытие асинхронное (сперва пишется
// тон), поэтому момент выхода ловит MutationObserver, а не синхронный замер.
test.describe('MO-2b ai settings sheet', () => {
  test('entry on transitions, infinite blink inside does not keep the closed sheet mounted', async ({ page }) => {
    await openApp(page);

    const result = await page.evaluate(async () => {
      const { openAiSettings } = await import('/js/ai-settings.view.js');
      await openAiSettings();
      const ov = /** @type {HTMLElement} */ (document.getElementById('ai-settings-overlay'));
      const finite = ov
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
      const kinds = finite.map((a) => ('transitionProperty' in a ? a.transitionProperty : 'keyframes'));
      await Promise.all(finite.map((a) => a.finished));

      /** @type {HTMLElement} */ (ov.querySelector('.modal-handle')).animate(
        [{ opacity: 1 }, { opacity: 0.4 }],
        { duration: 1000, iterations: Infinity }
      );
      const closing = new Promise((resolve) => {
        new MutationObserver((_, obs) => {
          if (!ov.hasAttribute('data-closing')) return;
          obs.disconnect();
          const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 40);
          resolve({ stillMounted: ov.isConnected, catchesTap: !!hit && ov.contains(hit) });
        }).observe(ov, { attributes: true });
      });
      /** @type {HTMLElement} */ (ov.querySelector('.intel-settings-save')).click();
      return { kinds: kinds.sort(), closing: await closing };
    });
    expect(result).toEqual({
      kinds: ['opacity', 'transform'],
      closing: { stillMounted: true, catchesTap: false },
    });
    await expect(page.locator('#ai-settings-overlay')).toHaveCount(0, { timeout: 2000 });
  });
});
