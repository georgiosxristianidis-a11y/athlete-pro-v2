// @ts-check
/**
 * FIELD-2 — после перерыва карточка упражнения называет причину веса словами,
 * барабан стоит на сниженном весе, пилюля «прошлый +2.5%» не спорит с ним.
 * Арифметику и пороги держит test/return-from-break.test.js, здесь — что
 * решение стора доходит до карточки и переживает перезагрузку.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const DAY = 24 * 60 * 60 * 1000;

async function waitForBoot(page) {
  await page.waitForFunction(
    () => {
      const nav = document.getElementById('nav');
      return (nav && nav.offsetHeight > 0) || document.getElementById('loading')?.classList.contains('hidden');
    },
    { timeout: 12000 }
  );
}

/** Онбординг пройден, в истории одна push-сессия Bench Press 100×8 `daysAgo` дней назад. */
async function openWithHistory(page, daysAgo, lang = null) {
  await page.goto(BASE);
  await waitForBoot(page);
  await page.evaluate(
    async ({ daysAgo, DAY, lang }) => {
      const { DB } = await import('/js/db.js');
      await DB.Settings.set('onboarding-complete', true);
      if (lang) await DB.Settings.set('lang', lang);
      const sets = [1, 2, 3].map(() => ({ weight: 100, reps: 8, rpe: 7, done: true }));
      await DB.Workouts.save({
        type: 'push',
        timestamp: Date.now() - daysAgo * DAY,
        tonnage: 100 * 8 * 3,
        duration: 3_600_000,
        exercises: [{ name: 'Bench Press', sets }],
      });
    },
    { daysAgo, DAY, lang }
  );
  await page.reload();
  await waitForBoot(page);
  await page.waitForFunction(() => !document.getElementById('onboarding-overlay'), { timeout: 8000 });
}

async function startPush(page) {
  await page.locator('button[data-s="s-train"]').click();
  await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 5000 });
  await page.waitForFunction(() => typeof window.Workout?.selectType === 'function', { timeout: 10000 });
  await expect(async () => {
    await page.evaluate(() => window.Workout.selectType('push'));
    await page.waitForSelector('.set-row', { state: 'visible', timeout: 6000 });
  }).toPass({ timeout: 20000 });
}

/** Карточка Bench Press по индексу в State.plan: в ru имя на карточке локализовано. */
async function benchCard(page) {
  const indexOf = () =>
    page.evaluate(async () => {
      const { State } = await import('/js/workout.store.js');
      return (State.plan || []).findIndex((e) => e.name === 'Bench Press');
    });
  // После перезагрузки план поднимается из ap-active-session не сразу.
  await expect.poll(indexOf, { timeout: 8000 }).toBeGreaterThanOrEqual(0);
  return page.locator('#ex-card-' + (await indexOf()));
}

const benchWeight = (page) =>
  page.evaluate(async () => {
    const { State } = await import('/js/workout.store.js');
    return State.plan.find((e) => e.name === 'Bench Press')?.sets[0].weight;
  });

test.describe('FIELD-2 — вес после перерыва', () => {
  test.use({ locale: 'en-US' });

  test('8 недель: причина словами, барабан на 80%, без пилюли «+2.5%»', async ({ page }) => {
    await openWithHistory(page, 56);
    await startPush(page);
    const card = await benchCard(page);
    const reason = card.locator('.ex-break-reason');
    await expect(reason).toBeVisible();
    await expect(reason).toHaveAttribute('data-break', 'reduce');
    await expect(reason).toHaveText('8 wk break — easing back in at 80%');
    await expect(card.locator('.coach-pill')).toHaveCount(0);
    expect(await benchWeight(page)).toBe(80);
  });

  test('5 недель: держим прежний вес, формулировка другая', async ({ page }) => {
    await openWithHistory(page, 35);
    await startPush(page);
    const reason = (await benchCard(page)).locator('.ex-break-reason');
    await expect(reason).toHaveAttribute('data-break', 'hold');
    await expect(reason).toHaveText('5 wk break — holding last weight');
    expect(await benchWeight(page)).toBe(100);
  });

  test('3 дня: строки причины нет, бамп как раньше', async ({ page }) => {
    await openWithHistory(page, 3);
    await startPush(page);
    await expect(await benchCard(page)).toBeVisible();
    await expect((await benchCard(page)).locator('.ex-break-reason')).toHaveCount(0);
    expect(await benchWeight(page)).toBe(102.5);
  });

  test('причина переживает перезагрузку (ap-active-session)', async ({ page }) => {
    await openWithHistory(page, 56);
    await startPush(page);
    await expect((await benchCard(page)).locator('.ex-break-reason')).toBeVisible();
    await page.waitForFunction(() => !!localStorage.getItem('ap-active-session'), { timeout: 5000 });
    await page.reload();
    await waitForBoot(page);
    await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 8000 });
    const reason = (await benchCard(page)).locator('.ex-break-reason');
    await expect(reason).toBeVisible({ timeout: 8000 });
    await expect(reason).toHaveText('8 wk break — easing back in at 80%');
  });

  test('ru: та же причина по-русски', async ({ page }) => {
    await openWithHistory(page, 56, 'ru');
    await startPush(page);
    await expect((await benchCard(page)).locator('.ex-break-reason')).toHaveText('Перерыв 8 нед. — начинаем мягче, 80% веса');
  });
});
