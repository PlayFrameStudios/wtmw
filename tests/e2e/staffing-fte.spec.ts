/**
 * What FTE means (#60): the scope sentence's receipt opens on its quotes, both "FTE" links land on the site FAQ's
 * answer, and the longer staff note doesn't widen the page at phone widths.
 */
import { expect, test, type Page } from '@playwright/test';

const dialog = (page: Page) => page.locator('dialog[data-receipt-dialog]');

test.describe('FTE note', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("Fremont's scope receipt shows both of the budget's quotes", async ({ page }) => {
    await page.goto('/us/ca/fremont/departments/');
    await page.locator('[data-staff-scope] button.cite').click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d).toContainText('The total authorized regular staffing level of 994.24');
    await expect(d).toContainText('Salaries and Benefits A budget category that generally accounts for salaries of regular and temporary employees');
  });

  test("Lafayette's scope receipt shows the ACFR's sentence", async ({ page }) => {
    await page.goto('/us/ca/lafayette/departments/');
    await page.locator('[data-staff-scope] button.cite').click();
    await expect(dialog(page)).toContainText('The City employs 50.1 FTE regular employees as well as many temporary and seasonal');
  });

  for (const [from, name] of [
    ['/us/ca/lafayette/departments/', 'Full-time-equivalent'],
    ['/us/ca/berkeley/', 'FTE'],
  ] as const) {
    test(`"${name}" on ${from} lands on the FAQ answer`, async ({ page }) => {
      await page.goto(from);
      await page.locator('a[data-fte-faq-link]', { hasText: name }).click();
      await expect(page).toHaveURL(/\/faq\/#staff-positions-fte$/);
      await expect(page.locator('#staff-positions-fte')).toBeInViewport();
      await expect(page.locator('#staff-positions-fte')).toContainText('Why are staff positions shown as fractions?');
    });
  }
});

for (const width of [320, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });
    for (const city of ['fremont', 'lafayette']) {
      test(`/us/ca/${city}/departments/ does not scroll sideways`, async ({ page }) => {
        await page.goto(`/us/ca/${city}/departments/`);
        await expect(page.locator('[data-fte-note]')).toBeVisible();
        const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
        expect(scroll).toBeLessThanOrEqual(client);
      });
    }
  });
}
