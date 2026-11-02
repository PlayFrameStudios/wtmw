/**
 * #55: charts get screenshotted without the page around them. A screenshot of the overview's chart, or of
 * the Departments list, has to say on its own that it counts General Fund department money, and for which year.
 */
import { expect, test } from '@playwright/test';

const CITIES = [
  { path: '/us/ca/berkeley/', chart: 'General Fund department baseline, per $100 · FY2027', list: ['General Fund department baseline · FY2027', 'General Fund department baseline · FY2028'] },
  { path: '/us/ca/fremont/', chart: 'General Fund department budgets, per $100 · FY 2026/27', list: ['General Fund department budgets, per $100 · FY 2026/27'] },
];

for (const c of CITIES) {
  test.describe(`chart headings on ${c.path}`, () => {
    test("the overview's chart names the fund and the year inside the chart", async ({ page }) => {
      await page.goto(c.path);
      const waffle = page.locator('.hero-waffle [data-waffle]');
      const title = waffle.locator('[data-waffle-title]');
      await expect(title).toHaveText(c.chart);
      // Inside the chart, directly above the squares: a crop of the grid takes the heading with it.
      const t = (await title.boundingBox())!;
      const grid = (await waffle.locator('.grid').boundingBox())!;
      expect(grid.y - (t.y + t.height)).toBeLessThanOrEqual(12);
      expect(grid.y).toBeGreaterThan(t.y);
    });

    test('the Departments list names the fund and the year above its rows', async ({ page }) => {
      await page.goto(`${c.path}departments/`);
      const heading = page.locator('[data-list-title], #db-depts');
      const rows = page.locator('.rows, .db-list').first();
      if (c.list.length === 1) {
        await expect(heading).toHaveText(c.list[0]);
      } else {
        // Berkeley's list switches year; the heading follows the selected year.
        // The other year's text is display:none, so read what's rendered.
        await expect(heading).toHaveText(c.list[0], { useInnerText: true });
        await page.locator('label[for="year-fy2028"]').click();
        await expect(heading).toHaveText(c.list[1], { useInnerText: true });
      }
      const h = (await heading.boundingBox())!;
      const r = (await rows.boundingBox())!;
      expect(r.y - (h.y + h.height)).toBeLessThanOrEqual(48);
      expect(r.y).toBeGreaterThan(h.y);
    });
  });
}
