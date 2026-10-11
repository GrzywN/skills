import { expect, test } from '@playwright/test';

test('free place shows the Free label', async ({ page }) => {
  await page.goto('/?fixture=free');
  await page.locator('.region').first().click();
  await page.waitForTimeout(2000);
  await expect(page.locator('.place-card p').first()).toHaveText('Free');
});

test('paid place shows the Paid label', async ({ page }) => {
  await page.goto('/?fixture=paid');
  await page.locator('.region').first().click();
  await page.waitForTimeout(2000);
  await expect(page.locator('.place-card p').first()).toHaveText('Paid');
});
