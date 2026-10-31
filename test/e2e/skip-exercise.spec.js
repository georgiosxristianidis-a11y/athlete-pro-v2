// @ts-check
/**
 * FIELD-1 — «Пропустить сегодня» из меню упражнения. Модель, сводку и префилл
 * держит test/skip-exercise.test.js; здесь — что пункт есть в меню, карточка
 * гаснет внизу, тап по ней возвращает на место и статус переживает перезагрузку.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';

async function waitForBoot(page) {
  await page.waitForFunction(
    () => {
      const nav = document.getElementById('nav');
      return (nav && nav.offsetHeight > 0) || document.getElementById('loading')?.classList.contains('hidden');
    },
    { timeout: 12000 }
  );
}

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

async function openTrain(page) {
  await page.locator('button[data-s="s-train"]').click();
  await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 5000 });
  await page.waitForFunction(() => typeof window.Workout?.selectType === 'function', { timeout: 10000 });
}

async function startWorkout(page) {
  await openTrain(page);
  await expect(async () => {
    await page.evaluate(() => window.Workout.selectType('push'));
    await page.waitForSelector('.set-row', { state: 'visible', timeout: 6000 });
  }).toPass({ timeout: 20000 });
}

const planNames = (page) =>
  page.evaluate(async () => {
    const { State } = await import('/js/workout.store.js');
    return State.plan.map((e) => ({ name: e.name, skipped: !!e.skipped }));
  });

test.describe('FIELD-1 — пропуск упражнения', () => {
  test.use({ locale: 'en-US' });

  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await startWorkout(page);
  });

  test('меню → «Skip today»: карточка гаснет внизу, тап возвращает на место', async ({ page }) => {
    const before = await planNames(page);
    const first = before[0].name;
    // PLAN-1: редкие (rare) пресета приходят уже погашенными — счёт от них.
    const rare = before.filter((e) => e.skipped).length;

    await page.locator('#ex-card-0 [data-action="wo:exMenu"]').click();
    const item = page.locator('.modal-overlay .menu-item', { hasText: 'Skip today' });
    await expect(item).toBeVisible();
    await item.click();

    const last = before.length - 1;
    await expect(page.locator(`#ex-card-${last}`)).toHaveClass(/ex-skipped/);
    const after = await planNames(page);
    expect(after[last]).toEqual({ name: first, skipped: true });
    // На погашенной карточке нет ни меню, ни блинов — тап только возвращает.
    await expect(page.locator(`#ex-card-${last} [data-action="wo:exMenu"]`)).toHaveCount(0);
    await expect(page.locator(`#ex-card-${last} [data-action="wo:plates"]`)).toHaveCount(0);

    await page.locator(`#ex-card-${last} .exercise-name`).click();
    await expect(page.locator('.ex-skipped')).toHaveCount(rare);
    expect(await planNames(page)).toEqual(before);
  });

  test('статус переживает перезагрузку страницы', async ({ page }) => {
    const rare = await page.locator('.ex-skipped').count(); // PLAN-1: редкие пресета
    await page.evaluate(() => window.Workout.skipExerciseToday(0));
    await expect(page.locator('.ex-skipped')).toHaveCount(rare + 1);
    await page.reload();
    await waitForBoot(page);
    await openTrain(page);
    await expect(page.locator('.ex-skipped')).toHaveCount(rare + 1, { timeout: 10000 });
  });
});
