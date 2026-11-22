// @ts-check
/**
 * UX-1e — остров на концах сессии.
 *  №5: «Финиш» гас за ~0.7 с в каждой тренировке с пропущенными упражнениями:
 *      toggleSet решает «сессия закрыта» по isPending (пропуск не ждёт), а
 *      update() острова сбрасывал finish-mode по done !== total, где total
 *      считал и подходы пропущенных.
 *  №12: сброс и сохранение прятали остров, но RestTimer тикал дальше и раз в
 *      секунду возвращал timer-mode («+15» / «пропустить») на пустой остров.
 */
const BASE = process.env.E2E_BASE || 'http://localhost:3000';
import { test, expect } from '@playwright/test';

async function waitForBoot(page) {
  await page.waitForFunction(
    () => {
      const nav = document.getElementById('nav');
      return (nav && nav.offsetHeight > 0) || document.getElementById('loading')?.classList.contains('hidden');
    },
    { timeout: 12000 },
  );
}

async function openApp(page) {
  await page.goto(BASE);
  await waitForBoot(page);
  const flagged = await page.evaluate(async () => {
    const { DB } = await import('/js/db.js');
    await DB.Settings.set('rest-duration', 30);
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

async function startWorkout(page) {
  await page.locator('button[data-s="s-train"]').click();
  await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 5000 });
  await page.waitForFunction(() => typeof window.Workout?.selectType === 'function', { timeout: 10000 });
  await expect(async () => {
    await page.evaluate(() => window.Workout.selectType('push'));
    await page.waitForSelector('.set-row', { state: 'visible', timeout: 6000 });
  }).toPass({ timeout: 20000 });
}

test.describe('UX-1e — остров на концах сессии', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await startWorkout(page);
  });

  test('№5: «Финиш» держится, когда в плане есть пропущенное упражнение', async ({ page }) => {
    const island = page.locator('#dynamic-island');
    // Пропуск ставится явно, не только PLAN-1-редкими: тест не зависит от пресета.
    await page.evaluate(() => window.Workout.skipExerciseToday(0));
    const last = await page.evaluate(async () => {
      const { State, isPending } = await import('/js/workout.store.js');
      // Закрыть всё, что ждёт, кроме последнего подхода — его закроет toggleSet.
      const pending = State.plan.map((ex, ei) => ({ ex, ei })).filter(({ ex }) => isPending(ex));
      for (const { ex } of pending) for (const s of ex.sets) s.done = true;
      const { ex, ei } = pending[pending.length - 1];
      const si = ex.sets.length - 1;
      ex.sets[si].done = false;
      return { ei, si, skipped: State.plan.filter((e) => e.skipped).length };
    });
    expect(last.skipped).toBeGreaterThan(0);

    await page.evaluate(({ ei, si }) => window.Workout.toggleSet(ei, si), last);
    await expect(island).toHaveClass(/finish-mode/, { timeout: 3000 });
    // Старый код снимал finish-mode на первом же update() (тик 1 Гц) — ждём больше двух.
    await page.waitForTimeout(2500);
    await expect(island).toHaveClass(/finish-mode/);
  });

  test('№12: «Отменить тренировку» гасит идущий отдых', async ({ page }) => {
    const island = page.locator('#dynamic-island');
    await page.locator('#chk-0-0').click();
    await expect(island).toHaveClass(/timer-mode/, { timeout: 3000 });

    await page.evaluate(() => {
      void window.Workout.cancelSession();
    });
    await page.locator('.confirm-ok').click();
    await expect(island).toHaveClass(/mode-idle/, { timeout: 3000 });
    // Старый код: интервал отдыха через секунду возвращал timer-mode.
    await page.waitForTimeout(2500);
    await expect(island).not.toHaveClass(/timer-mode/);
    await expect(island).toHaveClass(/mode-idle/);
  });

  test('№12: сохранение тренировки гасит идущий отдых', async ({ page }) => {
    const island = page.locator('#dynamic-island');
    await page.locator('#chk-0-0').click();
    await expect(island).toHaveClass(/timer-mode/, { timeout: 3000 });

    // Один подход закрыт → completeSession сразу открывает сводку, без confirm.
    await page.evaluate(() => {
      void window.Workout.completeSession();
    });
    await page.locator('#btn-summ-save').click();
    await expect(island).toHaveClass(/mode-idle/, { timeout: 3000 });
    await page.waitForTimeout(2500);
    await expect(island).not.toHaveClass(/timer-mode/);
  });
});
