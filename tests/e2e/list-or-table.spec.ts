import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// #48: on the Revenue page, "Show as a table" swaps the list beside the waffle for the table, in the same column.
const PAGES = [
  { city: 'Berkeley', path: '/us/ca/berkeley/revenue/', rows: 11, first: 'Property tax' },
  { city: 'Fremont', path: '/us/ca/fremont/revenue/', rows: 8, first: 'Property tax' },
];

const parts = (page: Page) => {
  const root = page.locator('[data-list-or-table]');
  return { root, button: root.locator('[data-lot-toggle]'), list: root.locator('[data-lot-list]'), table: root.locator('[data-lot-table]') };
};

for (const p of PAGES) {
  test.describe(`${p.city} revenue: list or table`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('starts on the list; the button swaps both ways and keeps focus', async ({ page }) => {
      await page.goto(p.path);
      const { button, list, table } = parts(page);
      await expect(button).toHaveText('Show as a table');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(button).toHaveAttribute('aria-controls', (await table.getAttribute('id'))!);
      await expect(list).toBeVisible();
      await expect(table).toHaveAttribute('hidden', '');

      await button.click();
      await expect(button).toHaveText('Show as a list');
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(button).toBeFocused();
      await expect(list).toHaveAttribute('hidden', '');
      await expect(table).not.toHaveAttribute('hidden', '');
      await expect(table.locator('caption')).toHaveCount(1);
      await expect(table.locator('tbody tr')).toHaveCount(p.rows);
      await expect(table.locator('tbody tr').first()).toContainText(p.first);

      await button.press('Enter');
      await expect(button).toHaveText('Show as a table');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(button).toBeFocused();
      await expect(list).toBeVisible();
      await expect(table).toHaveAttribute('hidden', '');
    });

    test('list and table start level with the grid, the button just above that line', async ({ page }) => {
      await page.goto(p.path);
      const { button, list, table } = parts(page);
      const grid = (await page.locator('.waffle .grid').boundingBox())!;
      const lede = (await page.locator('.lede, .ro-lede').boundingBox())!;
      const check = async (view: typeof list) => {
        const [btn, v] = [(await button.boundingBox())!, (await view.locator(':scope > *').first().boundingBox())!];
        expect(v.x).toBeGreaterThan(grid.x + grid.width);
        expect(Math.abs(v.y - grid.y)).toBeLessThan(1);
        // Jeremy's review: above the grid's top line, in the right column, clear of the lede.
        expect(btn.y + btn.height).toBeLessThanOrEqual(grid.y);
        expect(grid.y - (btn.y + btn.height)).toBeLessThan(16);
        expect(btn.y).toBeGreaterThanOrEqual(lede.y + lede.height);
        expect(btn.x + btn.width).toBeCloseTo(v.x + v.width, 0);
      };
      await check(list);
      await button.click();
      await check(table);
      // Nothing under the grid: the waffle's own "Show as a table" is gone on this page.
      await expect(page.locator('.waffle .as-table')).toHaveCount(0);
    });

    test('squares still highlight while the table is shown', async ({ page }) => {
      await page.goto(p.path);
      await parts(page).button.click();
      await page.locator('.sq').first().hover();
      await expect(page.locator('[data-tip]')).toBeVisible();
      await expect(page.locator('.sq.dim').first()).toBeAttached();
    });

    test('every load starts on the list', async ({ page }) => {
      await page.goto(p.path);
      await parts(page).button.click();
      await page.reload();
      await expect(parts(page).list).toBeVisible();
      await expect(parts(page).table).toHaveAttribute('hidden', '');
    });

    test('no axe violations with the table shown', async ({ page }) => {
      await page.goto(p.path);
      await parts(page).button.click();
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(violations.map((v) => v.id)).toEqual([]);
    });
  });

  test.describe(`${p.city} revenue at 390px`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('the table replaces the list below the grid, without page-level horizontal scroll', async ({ page }) => {
      await page.goto(p.path);
      const { button, list, table } = parts(page);
      // Measured from the button: clicking it can scroll the page.
      const below = async (el: typeof list) => (await el.boundingBox())!.y - (await button.boundingBox())!.y;
      const listAt = await below(list);
      await button.click();
      const tableBox = (await table.boundingBox())!;
      const grid = (await page.locator('.waffle .grid').boundingBox())!;
      expect(tableBox.y).toBeGreaterThan(grid.y + grid.height);
      expect(Math.abs((await below(table)) - listAt)).toBeLessThan(2);
      // innerWidth widens to fit overflow under mobile emulation; clientWidth doesn't.
      const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(m.scroll).toBeLessThanOrEqual(m.client);
      await expect(table.locator('.table-scroll')).toHaveCSS('overflow-x', 'auto');
    });
  });

  test.describe(`${p.city} revenue without JavaScript`, () => {
    test.use({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });

    test('shows the list, then the table, and no button', async ({ page }) => {
      await page.goto(p.path);
      const { button, list, table } = parts(page);
      await expect(button).toBeHidden();
      await expect(list).toBeVisible();
      await expect(table).toBeVisible();
      await expect(table.locator('tbody tr')).toHaveCount(p.rows);
      expect((await table.boundingBox())!.y).toBeGreaterThan((await list.boundingBox())!.y);
    });
  });
}

test('Berkeley: the tooltip\'s "Line items" link brings the list back and opens the group', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PAGES[0].path);
  const { button, list } = parts(page);
  await button.click();
  await page.locator('.sq').first().click();
  const link = page.locator('[data-tip] .panel-link').filter({ visible: true });
  await link.click();
  await expect(list).toBeVisible();
  await expect(button).toHaveText('Show as a table');
  const id = (await link.getAttribute('href'))!.slice(1);
  await expect(page.locator(`#${id} details`)).toHaveAttribute('open', '');
  await expect(page.locator(`#${id}`)).toBeInViewport();
});
