import { expect, test } from '@playwright/test';

test('legal page mentions cookies', async ({ page }) => {
  await page.goto('/legal');
  await expect(page.locator('main')).toContainText('cookies');
});

test('accept cookies button closes the banner', async ({ page }) => {
  await page.goto('/');
  await page.locator('#cookie-banner button').click();
  await expect(page.locator('#cookie-banner')).toBeHidden();
});
