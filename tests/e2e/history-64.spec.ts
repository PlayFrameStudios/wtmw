/**
 * #64: "Over the years" in a browser. The chart's points open their receipts, "Show as a table" swaps the charts for
 * the table and back, and no page scrolls sideways at 390px with the table showing.
 */
import { expect, test } from '@playwright/test';

const PAGES = ['/us/ca/berkeley/gap/', '/us/ca/fremont/reserves/', '/us/ca/lafayette/reserves/'];

test.describe('over the years (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("a point opens its row: Berkeley's FY2024 ending fund balance, annual report p.53", async ({ page }) => {
    await page.goto('/us/ca/berkeley/gap/#history');
    const panel = page.locator('[data-panel="results"]');
    await panel.getByRole('button', { name: /^Ending fund balance, FY2024 \(actual\): \$153\.0M, source: / }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Ending fund balance, FY2024 (actual)');
    await expect(dialog).toContainText('$153,029,258');
    await expect(dialog).toContainText('Ending fund balance $ 154,877,665 $ 153,029,258');
  });

  test('"Show as a table" swaps the charts for the table, and back', async ({ page }) => {
    await page.goto('/us/ca/fremont/reserves/');
    const panel = page.locator('[data-panel="budget"]');
    const toggle = panel.getByRole('button', { name: 'Show as a table' });
    await expect(panel.locator('[data-history-charts]')).toBeVisible();
    await expect(panel.locator('table')).toBeHidden();
    await toggle.click();
    await expect(panel.locator('table')).toBeVisible();
    await expect(panel.locator('[data-history-charts]')).toBeHidden();
    await expect(panel.getByRole('button', { name: 'Show as a chart' })).toHaveAttribute('aria-expanded', 'true');
    await panel.locator('table').getByRole('button', { name: /^\$12\.1M, source: / }).first().click();
    await expect(page.getByRole('dialog')).toContainText('Transfers out, FY 2026/27 (adopted)');
  });
});

test.describe('over the years (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of PAGES) {
    test(`${path}: no sideways scroll, charts or table`, async ({ page }) => {
      await page.goto(path);
      const width = () => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      let w = await width();
      expect(w.scroll).toBe(w.client);
      // Each click renames its button "Show as a chart", so the next one is always the first left.
      const toggles = page.getByRole('button', { name: 'Show as a table' });
      const n = await toggles.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) await toggles.first().click();
      await expect(toggles).toHaveCount(0);
      w = await width();
      expect(w.scroll).toBe(w.client);
    });
  }
});
