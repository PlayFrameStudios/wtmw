/**
 * Berkeley's Departments page (#61): Fremont's view, with the figures labeled as the baseline before the proposed
 * cuts, and links to who's being asked to cut, a section of The Gap.
 */
import { expect, test } from '@playwright/test';

const PAGE = '/us/ca/berkeley/departments/';
const dialog = '[data-receipt-dialog]';

test.describe('Berkeley departments (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('says before cuts, and a row receipt names the baseline', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('h1')).toHaveText('What each department starts with in FY2027, before cuts');
    await page.locator('#police .db-amount button.sourced').click();
    const d = page.locator(`dialog${dialog}`);
    await expect(d).toBeVisible();
    await expect(d.locator('.figure')).toHaveText('$106,198,574');
    await expect(d.locator('.figure-label')).toHaveText('Police, FY2027: General Fund department baseline before proposed cuts');
  });

  test("#hhcs (the overview's Department details link) lands on that department's row", async ({ page }) => {
    await page.goto(`${PAGE}#hhcs`);
    await expect(page.locator('li.db-row#hhcs')).toBeInViewport();
    await expect(page.locator('li.db-row#hhcs')).toContainText('$13.23 of every $100');
  });

  for (const [where, link] of [
    ['the lede', 'a[data-cuts-link]'],
    ['the staff note', '[data-staff-baseline] a'],
  ] as const) {
    test(`${where} links to the cuts on The Gap`, async ({ page }) => {
      await page.goto(PAGE);
      await page.locator(link).click();
      await expect(page).toHaveURL(/\/us\/ca\/berkeley\/gap\/#cuts$/);
      await expect(page.locator('#cuts-title')).toBeInViewport();
    });
  }
});

test.describe('Berkeley departments at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('does not scroll sideways', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('[data-fte-note]')).toBeVisible();
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll).toBeLessThanOrEqual(client);
  });
});
