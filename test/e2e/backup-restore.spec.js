// @ts-check
/**
 * LAUNCH-8 — restore must be proven on a different browser profile, not
 * by re-importing over the same IndexedDB. Two Playwright contexts are
 * two origins-worth of storage: export on A, import on B, data matches.
 */
const BASE = process.env.E2E_BASE || 'http://localhost:3000';
import { test, expect } from '@playwright/test';

async function waitForBoot(page) {
  await page.waitForFunction(
    () => {
      const loading = document.getElementById('loading');
      if (loading?.classList.contains('hidden')) return true;
      const nav = document.getElementById('nav');
      if (nav && nav.offsetHeight > 0) return true;
      if (document.getElementById('onboarding-overlay')) return true;
      return false;
    },
    { timeout: 12000 }
  );
}

const SAMPLE_PLAN = {
  push: [{ name: 'LAUNCH8-PROBE', sets: 4, reps: 6, weight: 42 }],
  pull: [],
  legs: [],
};

test('LAUNCH-8: export on one profile restores plans, history, settings on a clean one', async ({
  browser,
}) => {
  const source = await browser.newContext();
  const srcPage = await source.newPage();
  try {
    await srcPage.goto(BASE);
    await waitForBoot(srcPage);
    const json = await srcPage.evaluate(async (plan) => {
      const { DB } = await import('/js/db.js');
      await DB.Settings.set('onboarding-complete', true);
      await DB.Settings.set('lang', 'ru');
      await DB.Workouts.save({
        type: 'push',
        tonnage: 1234,
        exercises: [{ name: 'Bench Press', sets: [{ weight: 80, reps: 5, done: true }] }],
      });
      localStorage.setItem('ap-custom-plan-A', JSON.stringify(plan));
      localStorage.setItem('ap-theme', 'light');
      return DB.Backup.export();
    }, SAMPLE_PLAN);
    const exported = JSON.parse(json);
    expect(exported.settings.lang).toBe('ru');
    expect(exported.local['ap-custom-plan-A']).toContain('LAUNCH8-PROBE');
    const srcDevice = await srcPage.evaluate(() => localStorage.getItem('ap-device-id'));

    const target = await browser.newContext();
    const tgtPage = await target.newPage();
    try {
      await tgtPage.goto(BASE);
      await waitForBoot(tgtPage);
      const before = await tgtPage.evaluate(async () => {
        const { DB } = await import('/js/db.js');
        return {
          workouts: (await DB.Workouts.getAll()).length,
          lang: await DB.Settings.get('lang', null),
          plan: localStorage.getItem('ap-custom-plan-A'),
        };
      });
      expect(before.workouts).toBe(0);
      expect(before.plan).toBeNull();

      const restored = await tgtPage.evaluate(async (payload) => {
        const { DB } = await import('/js/db.js');
        await DB.Backup.import(payload);
        const workouts = await DB.Workouts.getAll();
        return {
          lang: await DB.Settings.get('lang'),
          workoutType: workouts[0]?.type,
          tonnage: workouts[0]?.tonnage,
          exName: workouts[0]?.exercises?.[0]?.name,
          plan: localStorage.getItem('ap-custom-plan-A'),
          theme: localStorage.getItem('ap-theme'),
          deviceId: localStorage.getItem('ap-device-id'),
        };
      }, json);

      expect(restored.lang).toBe('ru');
      expect(restored.workoutType).toBe('push');
      expect(restored.tonnage).toBe(1234);
      expect(restored.exName).toBe('Bench Press');
      expect(JSON.parse(restored.plan || '{}').push[0].name).toBe('LAUNCH8-PROBE');
      expect(restored.theme).toBe('light');
      expect(restored.deviceId).not.toBe(srcDevice);
    } finally {
      await target.close();
    }
  } finally {
    await source.close();
  }
});
