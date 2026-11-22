// @ts-check
/**
 * UX-2j — Лаборатория скрыта, пока 5 тапов по строке версии не откроют её.
 * Переустановка SW — кнопка внутри Лаборатории. Кнопку не нажимаем:
 * forceUpdate перезагрузит страницу, это проверяет unit-тест по исходнику.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';

async function openProfile(page) {
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
  await page.locator('button[data-s="s-profile"]').click();
  await expect(page.locator('#s-profile')).toHaveClass(/active/, { timeout: 10000 });
  await page.waitForSelector('#app-build-stamp', { state: 'attached', timeout: 10000 });
}

test.describe('UX-2j — жест Лаборатории', () => {
  test('скрыта по умолчанию, 4 тапа не открывают, 5-й открывает', async ({ page }) => {
    await openProfile(page);
    const lab = page.locator('#profile-lab-block');
    const stamp = page.locator('#app-build-stamp');
    await expect(lab).toBeHidden();
    for (let i = 0; i < 4; i++) await stamp.click();
    await expect(lab).toBeHidden();
    await stamp.click();
    await expect(lab).toBeVisible();
    await expect(page.locator('#profile-lab')).toHaveJSProperty('open', true);
    await expect(page.locator('#lab-sw-reinstall')).toBeVisible();
  });

  test('«Снаряды» в Лаборатории скрыты, пока флаг gym-equipment выключен', async ({ page }) => {
    await openProfile(page);
    for (let i = 0; i < 5; i++) await page.locator('#app-build-stamp').click();
    await expect(page.locator('#lab-equipment')).toBeHidden();
  });
});
