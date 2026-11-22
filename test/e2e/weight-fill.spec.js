// @ts-check
/**
 * UX-1c — вес первого подхода протягивается на нетронутые незакрытые (флаг weight-fill).
 * Правило держит test/weight-fill.test.js; здесь — проводка через барабан
 * (window.Workout.setWeight = путь _commit) и что барабан нижней строки показывает записанное.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';

async function boot(page, fill) {
  await page.addInitScript((on) => {
    if (on) localStorage.setItem('ap-flag-weight-fill', '1');
    else localStorage.removeItem('ap-flag-weight-fill');
  }, fill);
  await page.goto(BASE);
  await page.waitForFunction(
    () => document.getElementById('nav')?.offsetHeight > 0 || document.getElementById('loading')?.classList.contains('hidden'),
    { timeout: 12000 }
  );
  const flagged = await page.evaluate(async () => {
    const { DB } = await import('/js/db.js');
    if (await DB.Settings.get('onboarding-complete', false)) return false;
    await DB.Settings.set('onboarding-complete', true);
    return true;
  });
  if (flagged) await page.reload();
  await page.waitForFunction(() => !document.getElementById('onboarding-overlay'), { timeout: 12000 });
  await page.locator('button[data-s="s-train"]').click();
  await page.waitForFunction(() => typeof window.Workout?.selectType === 'function', { timeout: 10000 });
  await expect(async () => {
    await page.evaluate(() => window.Workout.selectType('push'));
    await page.waitForSelector('.set-row', { state: 'visible', timeout: 6000 });
  }).toPass({ timeout: 20000 });
}

const firstOpen = (page) =>
  page.evaluate(async () => {
    const { State } = await import('/js/workout.store.js');
    return State.plan.findIndex((e) => !e.skipped && !e.isBW && e.sets.length >= 3);
  });

const weights = (page, ei) =>
  page.evaluate(async (i) => {
    const { State } = await import('/js/workout.store.js');
    return State.plan[i].sets.map((s) => s.weight);
  }, ei);

test.describe('UX-1c — протяжка веса вниз', () => {
  test.use({ locale: 'en-US' });

  test('флаг ON: 60 в первом подходе — второй и третий 60, барабан показывает 60', async ({ page }) => {
    await boot(page, true);
    const ei = await firstOpen(page);
    expect(ei).toBeGreaterThanOrEqual(0);
    await page.evaluate((i) => window.Workout.setWeight(i, 0, 60), ei);
    const w = await weights(page, ei);
    expect(w.slice(0, 3)).toEqual([60, 60, 60]);
    // Барабан строки 2 стоит на 60: показанное = записанное.
    await expect(page.locator(`#sw-${ei}-2 .drum-item--active`)).toHaveText('60');
    // Снимок переживает перезагрузку вместе с весом.
    const snap = await page.evaluate(() => JSON.parse(localStorage.getItem('ap-active-session') || 'null'));
    expect(snap?.plan?.[ei]?.sets?.[2]?.weight).toBe(60);
  });

  test('флаг OFF: прежнее поведение — нижние подходы не трогаются', async ({ page }) => {
    await boot(page, false);
    const ei = await firstOpen(page);
    const before = await weights(page, ei);
    await page.evaluate((i) => window.Workout.setWeight(i, 0, 60), ei);
    const after = await weights(page, ei);
    expect(after[0]).toBe(60);
    expect(after.slice(1)).toEqual(before.slice(1));
  });
});
