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

test.describe('Fremont department subpages: $ of every $100', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('each page names its slice of every $100', async ({ page }) => {
    await page.goto('/us/ca/fremont/departments/police/');
    await expect(page.locator('.dd-per100')).toContainText('$45.14 of every $100 of General Fund department budgets · FY 2026/27');
    await page.goto('/us/ca/fremont/departments/administrative-departments/');
    await expect(page.locator('.dd-per100')).toContainText('$8.25 of every $100 of General Fund department budgets · FY 2026/27');
    await page.goto('/us/ca/fremont/departments/finance/');
    await expect(page.locator('.dd-per100')).toContainText('$2.78 of every $100');
    await page.goto('/us/ca/fremont/departments/information-technology-services/');
    await expect(page.locator('.dd-per100')).toContainText("Internal service fund — charged across departments' budgets rather than a separate slice of every $100 · FY 2026/27");
  });

  const SLUGS = [
    'city-council', 'community-development', 'community-services', 'economic-development', 'fire', 'human-services',
    'maintenance-operations', 'police', 'public-works', 'city-manager', 'city-attorney', 'city-clerk', 'finance',
    'human-resources', 'information-technology-services', 'administrative-departments',
  ];

  for (const slug of SLUGS) {
    test(`/us/ca/fremont/departments/${slug}/ does not scroll sideways`, async ({ page }) => {
      await page.goto(`/us/ca/fremont/departments/${slug}/`);
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(sw).toBeLessThanOrEqual(cw);
    });
  }
});

test.describe('Fremont department subpages: navigation', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('clicking a department from /departments/ lands on its subpage with Departments active', async ({ page }) => {
    await page.goto('/us/ca/fremont/departments/');
    // "Police" links to its subpage in both the departments list and the staff list; the first is the department's.
    await page.locator('a[href="/us/ca/fremont/departments/police/"]').first().click();
    await expect(page).toHaveURL('/us/ca/fremont/departments/police/');
    await expect(page.locator('nav[aria-label="Main"] .links a[href="/us/ca/fremont/departments/"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.dd-per100')).toContainText('$45.14 of every $100');
    // The top strip names both segments, and links "departments" back to the list.
    await expect(page.locator('.strip .crumbs')).toContainText('departments / police');
    await expect(page.locator('.strip .crumbs a[href="/us/ca/fremont/departments/"]')).toHaveText('departments');
    // The breadcrumb goes back to all departments.
    const back = page.locator('nav[aria-label="Department breadcrumb"]').getByRole('link', { name: /All departments/ });
    await expect(back).toHaveAttribute('href', '/us/ca/fremont/departments/');
    await back.click();
    await expect(page).toHaveURL('/us/ca/fremont/departments/');
  });

  test('a funding-source figure opens its receipt at the right printed page, with a CSV', async ({ page }) => {
    await page.goto('/us/ca/fremont/departments/police/');
    await page.getByRole('button', { name: /^\$129\.1M, source: FY 2026\/27 Adopted Operating Budget$/ }).first().click();
    const d = page.locator('dialog[data-receipt-dialog]');
    await expect(d).toBeVisible();
    await expect(d.locator('.figure')).toHaveText('$129,087,241');
    await expect(d.getByText('p. 187 (page 193 of the PDF)')).toBeVisible();
    // The link names the printed page and opens the PDF page (#page= counts PDF pages, not printed folios).
    await expect(d.getByRole('link', { name: 'Open the PDF at page 187 ↗' })).toHaveAttribute('href', 'https://www.fremont.gov/home/showpublisheddocument/21162#page=193');
    await expect(d.getByRole('link', { name: 'CSV' })).toHaveAttribute('href', '/us/ca/fremont/data/department-funding.csv');
  });
});

test.describe('Fremont department subpages: the Administrative Departments hub', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('adds $19.8M General Fund and $3.8M overhead to the $23.6M row, and opens the two lines from each office', async ({ page }) => {
    await page.goto('/us/ca/fremont/departments/administrative-departments/');
    const rows = page.locator('.db-sum tr');
    await expect(rows.filter({ hasText: 'General Fund, five offices' })).toContainText('$19.8M');
    await expect(rows.filter({ hasText: 'Overhead charged to other funds' })).toContainText('+$3.8M');
    await expect(rows.filter({ hasText: 'Administrative Departments, General Fund summary' })).toContainText('$23.6M');
    // An office's figure is its slice of the row, not its all-funds total (City Attorney's is $18.1M with Risk Management).
    const attorney = page.locator('.db-row--office', { hasText: 'City Attorney' });
    await expect(attorney.locator('.db-amount')).toContainText('$3.2M');
    await expect(attorney).toContainText('Its $18.1M all-funds total includes the $14.9M Risk Management internal service fund');
    await attorney.getByRole('button', { name: /^\$3\.2M, source: FY 2026\/27 Adopted Operating Budget$/ }).click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.locator('.figure')).toHaveText('$3,155,917');
    // The drawer adds the office's two lines, both counted in the $23.6M row.
    const parts = d.locator('.built .part');
    await expect(parts.nth(0)).toContainText('General Fund');
    await expect(parts.nth(0)).toContainText('$2,574,950');
    await expect(parts.nth(1)).toContainText('Overhead charges to other funds');
    await expect(parts.nth(1)).toContainText('$580,967');
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
