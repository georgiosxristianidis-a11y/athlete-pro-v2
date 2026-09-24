// @ts-check
/**
 * CORE-S / флаг 'core-photo-generate' — живая разметка экрана P.A.N.D.A. Core.
 *
 * Юнит-гард (`test/core-photo-flag.test.js`) читает исходник; этот кейс
 * отвечает на вопрос человека: видна ли кнопка «ГЕНЕРАЦИЯ» и есть ли вход для
 * фото. По умолчанию — нет; флаг включён — есть, как раньше. Сеть не нужна:
 * до отправки запросов тут не доходит.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';

async function waitForBoot(page) {
  await page.waitForFunction(
    () => {
      const nav = document.getElementById('nav');
      return (
        (nav && nav.offsetHeight > 0) ||
        document.getElementById('loading')?.classList.contains('hidden')
      );
    },
    { timeout: 12000 }
  );
}

/** Онбординг закрывается через собственный слой БД — оверлей z-9000 иначе ловит клики. */
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
  await page.waitForFunction(() => !document.getElementById('onboarding-overlay'), {
    timeout: 8000,
  });
}

/** @param {import('@playwright/test').Page} page @param {boolean} [photoOn] */
async function openIntel(page, photoOn = false) {
  await openApp(page);
  await page.evaluate((on) => {
    if (on) localStorage.setItem('ap-flag-core-photo-generate', '1');
    else localStorage.removeItem('ap-flag-core-photo-generate');
    window.Nav.go('s-intel');
  }, photoOn);
  await page.waitForSelector('[data-action="intel:weekly"]', { timeout: 12000 });
}

test.describe('CORE-S — фото и «ГЕНЕРАЦИЯ» за флагом', () => {
  test('дефолт: нет кнопки ГЕНЕРАЦИЯ, камеры и file-input; три карточки, хвост по центру', async ({
    page,
  }) => {
    await openIntel(page);
    const screen = page.locator('#s-intel');

    await expect(screen.locator('[data-action="intel:createWorkout"]')).toHaveCount(0);
    await expect(screen.locator('[data-action="intel:camera"]')).toHaveCount(0);
    await expect(screen.locator('#intel-btn-camera')).toHaveCount(0);
    await expect(screen.locator('input[type="file"]')).toHaveCount(0);
    await expect(screen.locator('#intel-vision-preview-wrap')).toHaveCount(0);

    // Остальные три модуля на месте.
    await expect(screen.locator('.intel-module-card')).toHaveCount(3);
    for (const a of ['weekly', 'analyzeStats', 'biometrics']) {
      await expect(screen.locator(`[data-action="intel:${a}"]`)).toHaveCount(1);
    }
    // Подсказка в поле не обещает фото.
    await expect(screen.locator('#intel-input')).not.toHaveAttribute('placeholder', /фото|vision/i);

    // Нечётный хвост растянут на обе колонки — не прижат к левому краю.
    const span = await screen
      .locator('.intel-module-card')
      .last()
      .evaluate((el) => getComputedStyle(el).gridColumnStart + '/' + getComputedStyle(el).gridColumnEnd);
    expect(span).toBe('1/-1');
  });

  test('флаг ON: ГЕНЕРАЦИЯ, камера и file-input на месте, как раньше', async ({ page }) => {
    await openIntel(page, true);
    const screen = page.locator('#s-intel');

    await expect(screen.locator('[data-action="intel:createWorkout"]')).toHaveCount(1);
    await expect(screen.locator('#intel-btn-camera')).toHaveCount(1);
    await expect(screen.locator('input#intel-file-input[type="file"]')).toHaveCount(1);
    await expect(screen.locator('#intel-vision-preview-wrap')).toHaveCount(1);
    await expect(screen.locator('.intel-module-card')).toHaveCount(4);
    await expect(screen.locator('#intel-input')).toHaveAttribute('placeholder', /фото|vision/i);
  });
});
