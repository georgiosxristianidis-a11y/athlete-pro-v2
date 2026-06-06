// @ts-check
/**
 * Athlete Pro — Playwright E2E Test Suite
 * Tests: onboarding, boot, navigation, viewport fix, Dynamic Island init,
 * workout flow, Claude FAB, profile, analytics, service worker.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

// ─── HELPERS ────────────────────────────────────────────────────────────────

/**
 * Pre-populate IndexedDB settings to mark onboarding as complete before app loads.
 */
async function bypassOnboarding(page) {
  await page.addInitScript(() => {
    const origOpen = window.indexedDB.open.bind(window.indexedDB);
    window.indexedDB.open = function(name, version) {
      const req = origOpen(name, version);
      let appOnSuccess = null;

      Object.defineProperty(req, 'onsuccess', {
        get() { return appOnSuccess; },
        set(val) { appOnSuccess = val; },
        configurable: true
      });

      req.addEventListener('success', (e) => {
        const db = req.result;
        if (db.objectStoreNames.contains('settings')) {
          const transaction = db.transaction('settings', 'readwrite');
          transaction.objectStore('settings').put({ key: 'onboarding-complete', value: true });
          transaction.oncomplete = () => {
            if (appOnSuccess) appOnSuccess.call(req, e);
          };
          transaction.onerror = () => {
            if (appOnSuccess) appOnSuccess.call(req, e);
          };
        } else {
          if (appOnSuccess) appOnSuccess.call(req, e);
        }
      });

      return req;
    };
  });
}

/**
 * Wait for app to be interactive — either loading hidden OR nav visible.
 */
async function waitForBoot(page) {
  await page.waitForFunction(
    () => {
      // Option A: loading is hidden
      const loading = document.getElementById('loading');
      if (loading?.classList.contains('hidden')) return true;
      // Option B: nav bar is visible
      const nav = document.getElementById('nav');
      if (nav && nav.offsetHeight > 0) return true;
      // Option C: onboarding overlay is visible
      const onboarding = document.getElementById('onboarding-overlay');
      if (onboarding) return true;
      return false;
    },
    { timeout: 12000 }
  );
}

/** Legacy helper, click through steps if visible */
async function skipOnboarding(page) {
  const overlay = page.locator('#onboarding-overlay');
  if (await overlay.count() > 0 && await overlay.isVisible()) {
    // Select Strength goal
    await page.locator('.ob-card[data-key="strength"]').click({ timeout: 3000 });
    await page.locator('#ob-next-1').click({ timeout: 3000 });

    // Select Beginner experience
    await page.locator('.ob-card[data-key="beginner"]').click({ timeout: 3000 });
    await page.locator('#ob-next-2').click({ timeout: 3000 });

    // Finish onboarding
    await page.locator('button:has-text("Go to dashboard instead")').click({ timeout: 3000 });

    // Wait for overlay to disappear
    await expect(overlay).not.toBeAttached({ timeout: 4000 });
  }
}

// ─── ONBOARDING FLOW ────────────────────────────────────────────────────────

test.describe('Onboarding Flow (Real)', () => {
  test('user can complete onboarding step-by-step', async ({ page }) => {
    await page.goto(BASE);
    await waitForBoot(page);

    // Verify onboarding overlay is visible
    const overlay = page.locator('#onboarding-overlay');
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Step 1: Goal selection
    // Next button should be disabled initially
    const next1 = page.locator('#ob-next-1');
    await expect(next1).toBeDisabled();

    // Select Strength goal
    await page.locator('.ob-card[data-key="strength"]').click();
    await expect(next1).toBeEnabled();
    await next1.click();

    // Step 2: Experience selection
    const next2 = page.locator('#ob-next-2');
    await expect(next2).toBeDisabled();

    // Select Beginner experience
    await page.locator('.ob-card[data-key="beginner"]').click();
    await expect(next2).toBeEnabled();
    await next2.click();

    // Step 3: Confirmation / Ready Screen
    const finishBtn = page.locator('button:has-text("Go to dashboard instead")');
    await expect(finishBtn).toBeVisible();
    await finishBtn.click();

    // Onboarding should close and redirect to dashboard
    await expect(overlay).not.toBeAttached({ timeout: 3000 });
    await expect(page.locator('#s-home')).toHaveClass(/active/, { timeout: 3000 });
  });
});

// ─── BYPASSED ONBOARDING SUITES ─────────────────────────────────────────────

test.describe('App with Onboarding Bypassed', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', err => {
      console.error(`[BROWSER UNCAUGHT ERROR] ${err.stack || err.message}`);
    });
    page.on('requestfailed', request => {
      console.error(`[BROWSER REQUEST FAILED] ${request.url()} - ${request.failure()?.errorText || 'unknown error'}`);
    });
    await bypassOnboarding(page);
  });

  // ─── 1. BOOT & VIEWPORT ───────────────────────────────────────────────────
  test.describe('Boot & Viewport', () => {
    test('app boots and nav bar is visible', async ({ page }) => {
      await page.goto(BASE);
      await waitForBoot(page);
      const nav = page.locator('#nav');
      await expect(nav).toBeVisible({ timeout: 10000 });
    });

    test('FIX-1: html element uses 100dvh (mobile viewport fix)', async ({ page }) => {
      await page.goto(BASE);
      // Check style block contains 100dvh
      const hasDvh = await page.evaluate(() => {
        const styles = Array.from(document.querySelectorAll('style'));
        return styles.some(s => s.textContent.includes('100dvh'));
      });
      expect(hasDvh).toBe(true);
    });

    test('status bar is present in DOM', async ({ page }) => {
      await page.goto(BASE);
      await expect(page.locator('#status-bar')).toBeAttached({ timeout: 5000 });
    });

    test('status bar logo is rendered', async ({ page }) => {
      await page.goto(BASE);
      await waitForBoot(page);
      const logoText = page.locator('.status-logo-text');
      await expect(logoText).toBeVisible({ timeout: 5000 });
    });

    test('clock shows time in status bar', async ({ page }) => {
      await page.goto(BASE);
      await waitForBoot(page);
      await page.waitForTimeout(500);
      const time = await page.locator('#status-time').textContent();
      expect(time).toMatch(/\d{2}:\d{2}/);
    });

    test('navigation bar has 4 buttons', async ({ page }) => {
      await page.goto(BASE);
      await waitForBoot(page);
      const navBtns = page.locator('#nav .nav-btn');
      await expect(navBtns).toHaveCount(4);
    });

    test('page has no critical JS errors on boot', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (err) => {
        if (!err.message.includes('vibrate') &&
            !err.message.includes('Intervention') &&
            !err.message.includes('ServiceWorker')) {
          errors.push(err.message);
        }
      });
      await page.goto(BASE);
      await waitForBoot(page);
      await page.waitForTimeout(1500);
      expect(errors).toHaveLength(0);
    });
  });

  // ─── 2. NAVIGATION ────────────────────────────────────────────────────────
  test.describe('Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE);
      await waitForBoot(page);
      await skipOnboarding(page);
      await page.waitForTimeout(400);
    });

    test('home screen is active by default', async ({ page }) => {
      await expect(page.locator('#s-home')).toHaveClass(/active/);
    });

    test('click Train → s-train becomes active', async ({ page }) => {
      await page.locator('button[data-s="s-train"]').click();
      await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 10000 });
    });

    test('click Stats → s-stats becomes active', async ({ page }) => {
      await page.locator('button[data-s="s-stats"]').click();
      await expect(page.locator('#s-stats')).toHaveClass(/active/, { timeout: 10000 });
    });

    test('click Profile → s-profile becomes active', async ({ page }) => {
      await page.locator('button[data-s="s-profile"]').click();
      await expect(page.locator('#s-profile')).toHaveClass(/active/, { timeout: 10000 });
    });

    test('active nav button gets .active class', async ({ page }) => {
      const trainBtn = page.locator('button[data-s="s-train"]');
      await trainBtn.click();
      await expect(trainBtn).toHaveClass(/active/, { timeout: 5000 });
    });
  });

  // ─── 3. DYNAMIC ISLAND ────────────────────────────────────────────────────
  test.describe('Dynamic Island', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE);
      await waitForBoot(page);
    });

    test('FIX-2: #dynamic-island created in DOM on boot', async ({ page }) => {
      await page.waitForSelector('#dynamic-island', { timeout: 5000 });
      const island = page.locator('#dynamic-island');
      await expect(island).toBeAttached();
    });

    test('#dynamic-island has network dot element', async ({ page }) => {
      await page.waitForSelector('#dynamic-island', { timeout: 5000 });
      const dot = page.locator('#dynamic-island .island-dot');
      await expect(dot).toBeAttached();
    });

    test('#dynamic-island is inside #app or body', async ({ page }) => {
      await page.waitForSelector('#dynamic-island', { timeout: 5000 });
      const isInAppOrBody = await page.evaluate(() => {
        const island = document.getElementById('dynamic-island');
        const app = document.getElementById('app') || document.body;
        return app?.contains(island) ?? false;
      });
      expect(isInAppOrBody).toBe(true);
    });
  });

  // ─── 4. DASHBOARD ─────────────────────────────────────────────────────────
  test.describe('Dashboard', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE);
      await waitForBoot(page);
      await skipOnboarding(page);
      const homeActive = await page.locator('#s-home.active').count();
      if (!homeActive) {
        await page.locator('button[data-s="s-home"]').click();
        await expect(page.locator('#s-home')).toHaveClass(/active/, { timeout: 2000 });
      }
      await page.waitForTimeout(1200);
    });

    test('dashboard has content after load', async ({ page }) => {
      const homeHTML = await page.locator('#s-home').innerHTML();
      expect(homeHTML.length).toBeGreaterThan(200);
    });

    test('dashboard renders without visible error states', async ({ page }) => {
      const errCount = await page.locator('#s-home .error, #s-home [class*="error"]').count();
      expect(errCount).toBe(0);
    });
  });

  // ─── 5. WORKOUT SCREEN ────────────────────────────────────────────────────
  test.describe('Workout Screen', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE);
      await waitForBoot(page);
      await skipOnboarding(page);
      await page.locator('button[data-s="s-train"]').click();
      await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 3000 });
      await page.waitForTimeout(1000);
    });

    test('workout screen renders content', async ({ page }) => {
      const html = await page.locator('#s-train').innerHTML();
      expect(html.length).toBeGreaterThan(100);
    });

    test('workout screen has no JS crash', async ({ page }) => {
      const html = await page.locator('#s-train').innerHTML();
      expect(html).not.toContain('undefined');
    });
  });

  // ─── 6. CLAUDE AI FAB ─────────────────────────────────────────────────────
  test.describe('Claude AI Coach FAB', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE);
      await waitForBoot(page);
      await skipOnboarding(page);
      await page.waitForSelector('#claude-fab', { timeout: 8000 });
    });

    test('Claude FAB is rendered and visible', async ({ page }) => {
      await expect(page.locator('#claude-fab')).toBeVisible();
    });

    test('clicking FAB opens claude-overlay', async ({ page }) => {
      await page.locator('#claude-fab').click({ force: true });
      await expect(page.locator('#claude-overlay')).toBeAttached({ timeout: 10000 });
    });

    test('claude-overlay has close button', async ({ page }) => {
      await page.locator('#claude-fab').click({ force: true });
      await page.locator('#claude-overlay').waitFor({ timeout: 10000 });
      await expect(page.locator('[aria-label="Close AI Coach"]')).toBeVisible();
    });

    test('close button dismisses overlay', async ({ page }) => {
      await page.locator('#claude-fab').click({ force: true });
      await page.locator('#claude-overlay').waitFor({ timeout: 10000 });
      await page.locator('[aria-label="Close AI Coach"]').click();
      await expect(page.locator('#claude-overlay')).not.toBeAttached({ timeout: 2000 });
    });

    test('FIX-4: AI error is a DOM node (not innerHTML injection)', async ({ page }) => {
      await page.locator('#claude-fab').click({ force: true });
      await page.locator('#claude-overlay').waitFor({ timeout: 10000 });
      await page.waitForTimeout(5000);
      const vulnerable = await page.evaluate(() => {
        for (const el of document.querySelectorAll('.ai-error')) {
          if (el.querySelector('script')) return true;
        }
        return false;
      });
      expect(vulnerable).toBe(false);
    });
  });

  // ─── 7. ANALYTICS SCREEN ──────────────────────────────────────────────────
  test.describe('Analytics Screen', () => {
    test('stats screen renders after nav', async ({ page }) => {
      await page.goto(BASE);
      await waitForBoot(page);
      await skipOnboarding(page);
      await page.locator('button[data-s="s-stats"]').click();
      await expect(page.locator('#s-stats')).toHaveClass(/active/, { timeout: 3000 });
      await page.waitForTimeout(1000);
      const html = await page.locator('#s-stats').innerHTML();
      expect(html.length).toBeGreaterThan(50);
    });
  });

  // ─── 8. PROFILE SCREEN ────────────────────────────────────────────────────
  test.describe('Profile Screen', () => {
    test('profile screen renders after nav', async ({ page }) => {
      await page.goto(BASE);
      await waitForBoot(page);
      await skipOnboarding(page);
      await page.locator('button[data-s="s-profile"]').click();
      await expect(page.locator('#s-profile')).toHaveClass(/active/, { timeout: 3000 });
      await page.waitForTimeout(1200);
      const html = await page.locator('#s-profile').innerHTML();
      expect(html.length).toBeGreaterThan(50);
    });
  });

  // ─── 9. SERVICE WORKER & PWA ──────────────────────────────────────────────
  test.describe('PWA & Service Worker', () => {
    test('manifest.json is served with correct fields', async ({ page }) => {
      const res = await page.request.get(`${BASE}/manifest.json`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.name).toBeTruthy();
      expect(body.start_url).toBeTruthy();
      expect(Array.isArray(body.icons)).toBe(true);
    });

    test('sw.js is served and contains v22 cache name', async ({ page }) => {
      const res = await page.request.get(`${BASE}/sw.js`);
      expect(res.status()).toBe(200);
      const text = await res.text();
      expect(text).toContain('athlete-pro-v22');
    });

    test('FIX-3: service worker registers (not nuked on boot)', async ({ page }) => {
      await page.goto(BASE);
      await waitForBoot(page);
      await page.waitForTimeout(2000);
      const swState = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return 'unsupported';
        const reg = await navigator.serviceWorker.getRegistration();
        return reg ? 'registered' : 'not-registered';
      });
      expect(swState).toBe('registered');
    });
  });
});
