import { test, expect } from '@playwright/test';

// CI webServer listens on 3000 (playwright.config.js); 3003 was local-only.
const BASE = process.env.E2E_BASE || 'http://localhost:3000';

async function reachBioStep(page) {
  await page.locator('.ob-card[data-key="strength"]').click();
  await page.locator('#ob-next-btn').click();
  await page.locator('.ob-card[data-key="beginner"]').click();
  await page.locator('#ob-next-btn').click();
  await expect(
    page.getByRole('heading', { name: /tell us about you|немного о тебе/i })
  ).toBeVisible();
}

async function reachPrivacyStep(page) {
  await reachBioStep(page);
  await page.locator('.ob-btn-tab[data-value="f"]').click();
  await page.locator('select[data-part="y"]').selectOption('1990');
  await page.locator('select[data-part="m"]').selectOption('05');
  await page.locator('select[data-part="d"]').selectOption('15');
  await page.locator('#ob-next-btn').click();
  await page.locator('input[data-key="height"]').fill('170');
  await page.locator('input[data-key="weight"]').fill('65');
  await page.locator('#ob-next-btn').click();
  await expect(page.getByRole('heading', { name: /privacy first|приватность/i })).toBeVisible();
}

test.describe('F-7/F-8 explicit onboarding choices', () => {
  test.use({ locale: 'en-US' });

  test('bio step requires sex tap even after DOB', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('#onboarding-overlay')).toBeVisible({ timeout: 8000 });
    await reachBioStep(page);

    await expect(page.locator('.ob-btn-tab[data-value="m"]')).not.toHaveClass(/active/);
    await expect(page.locator('.ob-btn-tab[data-value="f"]')).not.toHaveClass(/active/);
    await expect(page.locator('#ob-next-btn')).toBeDisabled();

    await page.locator('select[data-part="y"]').selectOption('1990');
    await page.locator('select[data-part="m"]').selectOption('05');
    await page.locator('select[data-part="d"]').selectOption('15');
    await expect(page.locator('#ob-next-btn')).toBeDisabled();

    await page.locator('.ob-btn-tab[data-value="f"]').click();
    await expect(page.locator('#ob-next-btn')).toBeEnabled();
  });

  test('privacy step requires card tap before continue', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('#onboarding-overlay')).toBeVisible({ timeout: 8000 });
    await reachPrivacyStep(page);

    await expect(page.locator('.ob-card[data-key="airgap"]')).not.toHaveClass(/active/);
    await expect(page.locator('.ob-card[data-key="cloud"]')).not.toHaveClass(/active/);
    await expect(page.locator('#ob-next-btn')).toBeDisabled();

    await page.locator('.ob-card[data-key="cloud"]').click();
    await expect(page.locator('#ob-next-btn')).toBeEnabled();
  });
});
