// @ts-check
/**
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
const BASE = process.env.E2E_BASE || 'http://localhost:3000';
import { test, expect } from '@playwright/test';

async function waitForBoot(page) {
  await page.waitForFunction(
    () =>
      (document.getElementById('nav')?.offsetHeight ?? 0) > 0 ||
      document.getElementById('loading')?.classList.contains('hidden'),
    { timeout: 12000 }
  );
}

/** Reliable bypass: write the flag through the app's own DB layer, reload once. */
async function openApp(page) {
  await page.goto(BASE);
  await waitForBoot(page);
  const flagged = await page.evaluate(async () => {
    const { DB } = await import('/js/db.js');
    if (await DB.Settings.get('onboarding-complete', false)) return false;
    await DB.Settings.set('onboarding-complete', true);
    return true;
  });
  if (flagged) {
    await page.reload();
    await waitForBoot(page);
  }
  await page.waitForFunction(() => !document.getElementById('onboarding-overlay'), { timeout: 8000 });
}

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
