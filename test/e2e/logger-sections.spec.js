// @ts-check
/**
 * LOG-SEC-1 — секционный режим сет-логгера, поведение на экране.
 * Push: виден только первый блок, закрытие упражнения раскрывает следующее,
 * закрытие секции открывает следующую, «Дальше» открывает вне очереди,
 * при флаге OFF экран как после #488.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';

async function openApp(page) {
  await page.goto(BASE);
  await page.waitForFunction(() => {
    const nav = document.getElementById('nav');
    return (nav && nav.offsetHeight > 0) || document.getElementById('loading')?.classList.contains('hidden');
  }, { timeout: 12000 });
  const flagged = await page.evaluate(async () => {
    const { DB } = await import('/js/db.js');
    if (await DB.Settings.get('onboarding-complete', false)) return false;
    await DB.Settings.set('onboarding-complete', true);
    return true;
  });
  if (flagged) {
    await page.reload();
    await page.waitForFunction(() => !!document.getElementById('nav')?.offsetHeight, { timeout: 12000 });
  }
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

/** Закрыть все подходы упражнения ei (кликом по галочкам) и дождаться автоперехода. */
async function finishExercise(page, ei) {
  const checks = page.locator(`#sets-wrap-${ei} .set-check`);
  const n = await checks.count();
  for (let si = 0; si < n; si++) {
    await page.locator(`#chk-${ei}-${si}`).click();
  }
  await page.waitForTimeout(800); // автопереход 500 мс
}

const states = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.log-sec')].map((el) => ({
      block: /** @type {HTMLElement} */ (el).dataset.block,
      state: /** @type {HTMLElement} */ (el).dataset.secState,
      done: el.classList.contains('is-done'),
    }))
  );

const openCards = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.sets-wrap')]
      .filter((w) => /** @type {HTMLElement} */ (w).offsetParent !== null)
      .map((w) => w.id.replace('sets-wrap-', ''))
  );

test.describe('LOG-SEC-1 секционный логгер (Push)', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('виден только первый блок, в нём раскрыто одно упражнение', async ({ page }) => {
    await startPush(page);
    expect(await page.locator('#exercise-list[data-sections]').count()).toBe(1);
    const st = await states(page);
    expect(st[0].state).toBe('open');
    expect(st.slice(1).every((s) => s.state === 'hidden')).toBe(true);
    expect(await openCards(page)).toEqual(['0']);
    await expect(page.locator('.log-sec-next')).toBeVisible();
    await expect(page.locator('.log-sec-next')).toContainText(/Дальше|Next/);
  });

  test('закрыл все подходы упражнения 1 — раскрылось упражнение 2', async ({ page }) => {
    await startPush(page);
    await finishExercise(page, 0);
    expect(await openCards(page)).toEqual(['1']);
  });

  test('закрыл последнее упражнение секции — она свёрнута с галочкой, открылась следующая', async ({ page }) => {
    await startPush(page);
    const first = (await states(page))[0].block;
    const eis = await page.evaluate(
      // PLAN-1: редкие (rare) лежат в секции погашенными и в счёт не входят.
      (b) => [...document.querySelectorAll(`.log-sec[data-block="${b}"] .exercise-card:not(.ex-skipped)`)].map((c) => +c.dataset.ei),
      first
    );
    for (const ei of eis) await finishExercise(page, ei);
    const st = await states(page);
    expect(st[0].state).toBe('row');
    expect(st[0].done).toBe(true);
    expect(st[1].state).toBe('open');
    await expect(page.locator(`.log-sec[data-block="${first}"] .log-sec-sum`)).toContainText(`${eis.length}/${eis.length}`);
    await expect(page.locator(`.log-sec[data-block="${first}"] .log-sec-check`)).toBeVisible();
    const firstOfNext = await page.evaluate(
      (b) => +document.querySelector(`.log-sec[data-block="${b}"] .exercise-card`).dataset.ei,
      st[1].block
    );
    expect(await openCards(page)).toEqual([String(firstOfNext)]);
  });

  test('«Дальше» открывает секцию вне очереди, текущая сворачивается в строку с прогрессом', async ({ page }) => {
    await startPush(page);
    const before = await states(page);
    await finishExercise(page, 0); // начали первую секцию
    await page.locator('.log-sec-next').click();
    const st = await states(page);
    expect(st[0].state).toBe('row');
    expect(st[0].done).toBe(false);
    expect(st[1].state).toBe('open');
    expect(before[1].state).toBe('hidden');
    await expect(page.locator(`.log-sec[data-block="${st[0].block}"] .log-sec-sum`)).toContainText(/^1\//);
    // тап по строке возвращает секцию
    await page.locator(`.log-sec[data-block="${st[0].block}"] .log-sec-head`).click();
    expect((await states(page))[0].state).toBe('open');
    expect((await states(page))[1].state).toBe('row');
  });

  test('флаг logger-sections OFF — как после #488: все блоки видны, раскрыто одно упражнение', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('ap-flag-logger-sections', '0'));
    await startPush(page);
    expect(await page.locator('#exercise-list[data-sections]').count()).toBe(0);
    expect(await page.locator('.log-sec').count()).toBe(0);
    expect(await page.locator('.workout-block-header').count()).toBeGreaterThan(1);
    expect(await openCards(page)).toEqual(['0']);
    await finishExercise(page, 0);
    expect(await openCards(page)).toEqual(['1']);
  });
});
