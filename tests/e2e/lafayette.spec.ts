/**
 * Lafayette (#59): a scanned table's receipt says it wasn't checked against text and links the page image; the
 * chart's Police square says who provides the service; and no page scrolls sideways at phone widths.
 */
import { expect, test, type Page } from '@playwright/test';

const dialog = (page: Page) => page.locator('dialog[data-receipt-dialog]');

test.describe('Lafayette receipts', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a figure read from a scanned page says so and links the page image', async ({ page }) => {
    await page.goto('/us/ca/lafayette/capital/');
    await page.getByRole('button', { name: /^\$4\.0M, source: FY 2026-27 Budget & Workplan$/ }).click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.locator('.figure')).toHaveText('$4,000,000');
    await expect(d.locator('[data-scanned]')).toContainText('Read from a scanned table, not checked against text.');
    const image = d.locator('[data-scanned] a');
    await expect(image).toHaveAttribute('href', '/us/ca/lafayette/scans/S1-p21.png');
    expect((await page.request.get('/us/ca/lafayette/scans/S1-p21.png')).headers()['content-type']).toBe('image/png');
    await expect(d.getByRole('link', { name: 'Open the PDF at page 21 ↗' })).toBeVisible();
    // The citation a reader copies carries the same warning.
    await expect(d.getByText('It says')).toHaveCount(0);
    await expect(d.getByText('We read')).toBeVisible();
  });

  test('a figure from a text page has no scanned note', async ({ page }) => {
    await page.goto('/us/ca/lafayette/departments/');
    await page.getByRole('button', { name: /^\$8\.4M, source:/ }).click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.getByText('It says')).toBeVisible();
    await expect(d.locator('[data-scanned]')).toHaveCount(0);
  });

  test("the Police square says it's a Sheriff contract and links to the program", async ({ page }) => {
    await page.goto('/us/ca/lafayette/');
    await page.locator('[data-waffle] [data-index="0"]').click();
    const panel = page.locator('[data-panel="police-services"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.panel-note')).toHaveText("A contract with the Contra Costa County Sheriff's Office");
    await expect(panel.getByRole('link', { name: /Program details/ })).toHaveAttribute('href', '/us/ca/lafayette/departments/#police-services');
  });
});

for (const width of [320, 375, 390]) {
  test.describe(`Lafayette at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, isMobile: true });

    for (const p of ['', 'revenue/', 'reserves/', 'departments/', 'capital/', 'sources/', 'glossary/']) {
      test(`/us/ca/lafayette/${p} does not scroll sideways`, async ({ page }) => {
        await page.goto(`/us/ca/lafayette/${p}`);
        // innerWidth widens to fit under mobile emulation; documentElement.clientWidth does not.
        const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        expect(cw).toBe(width);
        expect(sw).toBeLessThanOrEqual(cw);
      });
    }

    test('the scanned receipt fits the screen', async ({ page }) => {
      await page.goto('/us/ca/lafayette/capital/');
      await page.locator('button.sourced').nth(1).click();
      const d = dialog(page);
      await expect(d.locator('[data-scanned]')).toBeVisible();
      const { sw, cw } = await d.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(sw).toBeLessThanOrEqual(cw);
    });
  });
}
