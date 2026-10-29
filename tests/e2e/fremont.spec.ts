/**
 * Fremont (#43), a city built from City documents: its receipts cite the page number printed on
 * the page and open the PDF at the right page, and a document fremont.gov may refuse also links
 * the Internet Archive's copy.
 */
import { expect, test, type Page } from '@playwright/test';

const dialog = (page: Page) => page.locator('dialog[data-receipt-dialog]');

test.describe('Fremont receipts', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a table figure cites the printed page and opens the PDF page', async ({ page }) => {
    await page.goto('/us/ca/fremont/departments/');
    await page.getByRole('button', { name: /^\$129\.1M, source: FY 2026\/27 Adopted Operating Budget$/ }).click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.locator('.figure')).toHaveText('$129,087,000');
    await expect(d.getByText('p. 66 (page 72 of the PDF)')).toBeVisible();
    await expect(d.locator('.quote').first()).toHaveText('Police 124,396 124,714 116,012 129,087');
    const open = d.getByRole('link', { name: 'Open the PDF at page 66 ↗' });
    await expect(open).toHaveAttribute('href', 'https://www.fremont.gov/home/showpublisheddocument/21162#page=72');
    await expect(d.getByRole('link', { name: 'CSV' })).toHaveAttribute('href', '/us/ca/fremont/data/general-fund-fy2027.csv');
    // No archive copy of this one, so no archive note.
    await expect(d.locator('.archive')).toHaveCount(0);
  });

  test('a document the City’s site may refuse also links its Internet Archive copy', async ({ page }) => {
    await page.goto('/us/ca/fremont/revenue/');
    await page.getByRole('button', { name: /^\$11\.9M, source: FY 2025\/26 Mid-Year Budget Report/ }).click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    // The mid-year report has no front matter: its PDF page is its printed page.
    await expect(d.getByText('p. 4 of the PDF')).toBeVisible();
    const archive = d.locator('.archive a');
    await expect(archive).toHaveAttribute('href', /^https:\/\/web\.archive\.org\/web\/20260615142047\/https:\/\/www\.fremont\.gov\/home\/showpublisheddocument\/20068\//);
    await expect(d.locator('.archive')).toContainText('is the same document');
  });
});

test.describe('Fremont at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  for (const p of ['', 'revenue/', 'departments/', 'capital/', 'reserves/', 'sources/']) {
    test(`/us/ca/fremont/${p} does not scroll sideways`, async ({ page }) => {
      await page.goto(`/us/ca/fremont/${p}`);
      // innerWidth widens to fit under mobile emulation; documentElement.clientWidth does not.
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(sw).toBeLessThanOrEqual(cw);
    });
  }
});
