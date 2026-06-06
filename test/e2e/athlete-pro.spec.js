// @ts-check
/**
 * Athlete Pro — Playwright E2E Test Suite
 * Tests: boot, navigation, viewport fix, Dynamic Island init,
 * workout flow, Claude FAB, profile, analytics, service worker.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

// ─── HELPERS ────────────────────────────────────────────────────────────────

/**
 * Wait for app to be interactive — either loading hidden OR nav visible.
 * Handles onboarding modal case where loading never gets .hidden.
 */
async function waitForBoot(page) {
  await page.waitForFunction(
    () => {
      // Option A: loading is hidden
      const loading = document.getElementById('loading');
      if (loading?.classList.contains('hidden')) return true;
      // Option B: nav bar is visible (app is ready even if loading still fading)
      const nav = document.getElementById('nav');
      if (nav && nav.offsetHeight > 0) return true;
      // Option C: onboarding is showing
      const onboarding = document.querySelector('.onboarding-overlay, .onboarding-screen, [id^="onboarding"]');
      if (onboarding) return true;
      return false;
    },
    { timeout: 12000 }
  );
}

/** Skip onboarding if it appears */
async function skipOnboarding(page) {
  await page.waitForTimeout(600);
  const skipBtn = page.locator('[data-action="skip"], .onboarding-skip, button:has-text("Skip"), button:has-text("Later")');
  if (await skipBtn.count() > 0) {
    await skipBtn.first().click({ timeout: 2000 }).catch(() => {});
  }
}

// ─── 1. BOOT & VIEWPORT ─────────────────────────────────────────────────────

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
      // Filter known benign browser interventions
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

// ─── 2. NAVIGATION ──────────────────────────────────────────────────────────

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
    await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 3000 });
  });

  test('click Stats → s-stats becomes active', async ({ page }) => {
    await page.locator('button[data-s="s-stats"]').click();
    await expect(page.locator('#s-stats')).toHaveClass(/active/, { timeout: 3000 });
  });

  test('click Profile → s-profile becomes active', async ({ page }) => {
    await page.locator('button[data-s="s-profile"]').click();
    await expect(page.locator('#s-profile')).toHaveClass(/active/, { timeout: 3000 });
  });

  test('active nav button gets .active class', async ({ page }) => {
    const trainBtn = page.locator('button[data-s="s-train"]');
    await trainBtn.click();
    await expect(trainBtn).toHaveClass(/active/, { timeout: 2000 });
  });
});

// ─── 3. DYNAMIC ISLAND ──────────────────────────────────────────────────────

test.describe('Dynamic Island', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForBoot(page);
  });

  test('FIX-2: #dynamic-island created in status-bar on boot', async ({ page }) => {
    await page.waitForSelector('#dynamic-island', { timeout: 5000 });
    const island = page.locator('#dynamic-island');
    await expect(island).toBeAttached();
  });

  test('#dynamic-island has network dot element', async ({ page }) => {
    await page.waitForSelector('#dynamic-island', { timeout: 5000 });
    const dot = page.locator('#dynamic-island .island-dot');
    await expect(dot).toBeAttached();
  });

  test('#dynamic-island is inside #status-bar', async ({ page }) => {
    await page.waitForSelector('#dynamic-island', { timeout: 5000 });
    const isInStatusBar = await page.evaluate(() => {
      const island = document.getElementById('dynamic-island');
      const bar = document.getElementById('status-bar');
      return bar?.contains(island) ?? false;
    });
    expect(isInStatusBar).toBe(true);
  });
});

// ─── 4. DASHBOARD ───────────────────────────────────────────────────────────

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForBoot(page);
    await skipOnboarding(page);
    // Navigate home if not already
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

// ─── 5. WORKOUT SCREEN ──────────────────────────────────────────────────────

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
    // If it rendered content, JS didn't crash
    const html = await page.locator('#s-train').innerHTML();
    expect(html).not.toContain('undefined');
  });
});

// ─── 6. CLAUDE AI FAB ───────────────────────────────────────────────────────

test.describe('Claude AI Coach FAB', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForBoot(page);
    await skipOnboarding(page);
    // Claude FAB is lazy-loaded — wait for it
    await page.waitForSelector('#claude-fab', { timeout: 8000 });
  });

  test('Claude FAB is rendered and visible', async ({ page }) => {
    await expect(page.locator('#claude-fab')).toBeVisible();
  });

  test('clicking FAB opens claude-overlay', async ({ page }) => {
    await page.locator('#claude-fab').click();
    await expect(page.locator('#claude-overlay')).toBeAttached({ timeout: 4000 });
  });

  test('claude-overlay has close button', async ({ page }) => {
    await page.locator('#claude-fab').click();
    await page.locator('#claude-overlay').waitFor({ timeout: 4000 });
    await expect(page.locator('[aria-label="Close AI Coach"]')).toBeVisible();
  });

  test('close button dismisses overlay', async ({ page }) => {
    await page.locator('#claude-fab').click();
    await page.locator('#claude-overlay').waitFor({ timeout: 4000 });
    await page.locator('[aria-label="Close AI Coach"]').click();
    await expect(page.locator('#claude-overlay')).not.toBeAttached({ timeout: 2000 });
  });

  test('FIX-4: AI error is a DOM node (not innerHTML injection)', async ({ page }) => {
    await page.locator('#claude-fab').click();
    await page.locator('#claude-overlay').waitFor({ timeout: 4000 });
    // Wait for potential error state (server likely not running in test env)
    await page.waitForTimeout(5000);
    const vulnerable = await page.evaluate(() => {
      // Check if any .ai-error contains a child script tag (would mean XSS)
      for (const el of document.querySelectorAll('.ai-error')) {
        if (el.querySelector('script')) return true;
      }
      return false;
    });
    expect(vulnerable).toBe(false);
  });
});

// ─── 7. ANALYTICS SCREEN ────────────────────────────────────────────────────

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

// ─── 8. PROFILE SCREEN ──────────────────────────────────────────────────────

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

// ─── 9. SERVICE WORKER & PWA ────────────────────────────────────────────────

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
