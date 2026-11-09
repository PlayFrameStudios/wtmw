import { expect, test } from '@playwright/test';

const PAGE = '/us/ca/berkeley/sources/';

test.describe('sources page', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('filters: all, city documents, news reports, other governments', async ({ page }) => {
    await page.goto(PAGE);
    const rows = page.locator('.src-row');
    await expect(rows.filter({ visible: true })).toHaveCount(42);
    await page.locator('label[for="filter-city"]').click();
    await expect(rows.filter({ visible: true })).toHaveCount(21);
    await expect(page.locator('.src-row[data-type="news"]').first()).toBeHidden();
    await expect(page.locator('.src-row[data-type="other"]').first()).toBeHidden();
    await page.locator('label[for="filter-news"]').click();
    await expect(rows.filter({ visible: true })).toHaveCount(10);
    await expect(page.locator('#S12')).toBeVisible();
    await expect(page.locator('#S24')).toBeVisible();
    // #51: other governments' documents, never mixed in with the City's.
    await page.locator('label[for="filter-other"]').click();
    await expect(rows.filter({ visible: true })).toHaveCount(11);
    await expect(page.locator('#S30')).toBeVisible();
    await expect(page.locator('#S20')).toBeHidden();
  });

  test('#S12 scrolls to and highlights its row', async ({ page }) => {
    await page.goto(`${PAGE}#S12`);
    const row = page.locator('#S12');
    await expect(row).toBeInViewport();
    await expect(row).toHaveCSS('background-color', 'rgb(220, 237, 235)');
    await expect(page.locator('#S11')).not.toHaveCSS('background-color', 'rgb(220, 237, 235)');
  });

  test('each row links out, and "used on" links to the pages', async ({ page }) => {
    await page.goto(PAGE);
    const s1 = page.locator('#S1');
    await expect(s1.locator('a.out')).toHaveAttribute('href', /^https:\/\/berkeleyca\.gov\//);
    await expect(s1.locator('a.out')).toHaveAttribute('target', '_blank');
    await expect(s1.locator('.used a', { hasText: 'The Gap' })).toHaveAttribute('href', '/us/ca/berkeley/gap/');
  });

  test('the footer\'s "Download the data" lands on the downloads', async ({ page }) => {
    await page.goto('/us/ca/berkeley/');
    await page.locator('footer').getByRole('link', { name: 'Download the data' }).click();
    await expect(page.locator('#downloads')).toBeInViewport();
  });
});
