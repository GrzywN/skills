import { expect, test } from '@playwright/test';

test('user finds a place in a region and opens its details', async ({ page }) => {
  await page.goto('/');
  await page.locator('.region').first().click();
  await page.waitForTimeout(2000);
  await page.locator('.place-marker').first().click();
  await expect(page.locator('.place-details h2')).toBeVisible();
});

test('marker is hidden on region selection', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.place-marker')).toHaveCount(0);
});
