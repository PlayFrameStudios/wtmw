/**
 * The FAQs (#54): a link to one answer opens at that answer, "Copy link" copies it (or, where the clipboard
 * is refused, puts it in the address bar), figures open their receipts, and the pages are a click from the
 * overview, the footer and the landing page.
 */
import { expect, test } from '@playwright/test';

const FREMONT = '/us/ca/fremont/faq/';
const dialog = (page: import('@playwright/test').Page) => page.locator('dialog[data-receipt-dialog]');

test.describe('FAQ anchors and copy link', () => {
  test('a link to one answer opens at it', async ({ page }) => {
    await page.goto(`${FREMONT}#top-property-taxpayers`);
    const item = page.locator('#top-property-taxpayers');
    await expect(item.getByRole('heading', { level: 2 })).toHaveText('Who pays the most property tax?');
    await expect(item.getByRole('heading', { level: 2 })).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test('"Copy link" copies the answer\'s own URL', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(FREMONT);
    const button = page.locator('#roads').getByRole('button', { name: 'Copy link to “How much goes to roads?”' });
    await button.click();
    await expect(button).toContainText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(`${FREMONT}#roads`, page.url()).href);
    await expect(page.locator('[data-copy-status]')).toHaveText(/^Copied: .*\/us\/ca\/fremont\/faq\/#roads$/);
  });

  test('where the clipboard is refused, the link goes in the address bar instead', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } });
    });
    await page.goto('/faq/');
    const button = page.locator('#general-fund [data-copy-link]');
    await button.click();
    await expect(button).toContainText('Link in address bar');
    expect(new URL(page.url()).hash).toBe('#general-fund');
  });
});

test.describe('FAQ answers', () => {
  test("a figure opens its receipt: Police's all-funds total, from the department's page", async ({ page }) => {
    await page.goto(`${FREMONT}#police-share`);
    const p = page.locator('#police-share .faq-p').nth(1);
    await expect(p).toContainText('Counting every fund, the Police Department\'s budget is $130.9M.');
    await p.getByRole('button', { name: '$130.9M' }).click();
    await expect(dialog(page)).toContainText('$130,915,603');
    await expect(dialog(page)).toContainText('Police Department, FY 2026/27 adopted, all funds');
  });

  test('a cited statement opens its source: CDTFA for the sales tax rate', async ({ page }) => {
    await page.goto(`${FREMONT}#sales-tax`);
    await expect(page.locator('#sales-tax .faq-lead')).toContainText("Fremont's sales tax rate is 10.250%.");
    await page.locator('#sales-tax .faq-lead button[data-source-chip]').click();
    await expect(dialog(page)).toContainText('California Department of Tax and Fee Administration');
    await expect(dialog(page).locator('.badge--other')).toHaveText('Another government');
  });

  test("a city answer's \"More\" goes to the site-wide answer", async ({ page }) => {
    await page.goto(`${FREMONT}#police-share`);
    await page.locator('#police-share [data-faq-see]').getByRole('link', { name: "What's the General Fund, and how is it different from the whole budget?" }).click();
    await expect(page).toHaveURL(/\/faq\/#general-fund$/);
    await expect(page.locator('#general-fund h2')).toBeInViewport();
  });

  test('the site-wide answers name their sources, and link the error form and the city request', async ({ page }) => {
    await page.goto('/faq/');
    await expect(page.locator('#property-tax [data-faq-sources]')).toHaveText("Source: Legislative Analyst's Office (California), The 1 Percent Tax: Where Does Your Money Go?, p. 1");
    // The page number opens the PDF at that page, as a receipt would (#30).
    await expect(page.locator('#comparing-cities [data-faq-sources]').getByRole('link', { name: /page 24$/ })).toHaveAttribute('href', /property-tax-primer-112912\.pdf#page=24$/);
    await expect(page.locator('#report-an-error').getByRole('link', { name: 'Report it on GitHub' })).toHaveAttribute('href', /report-an-error\.yml.*Error\+on\+%2Ffaq%2F/);
    await page.locator('#request-a-city').getByRole('link', { name: 'Request it on the home page' }).click();
    await expect(page).toHaveURL(/\/#request$/);
  });
});

test.describe('links in', () => {
  test("the overview's quiet line goes to the city's FAQ", async ({ page }) => {
    for (const city of ['/us/ca/berkeley/', '/us/ca/fremont/']) {
      await page.goto(city);
      await page.locator('[data-faq-line]').getByRole('link', { name: 'Questions people ask about this budget' }).click();
      await expect(page).toHaveURL(new RegExp(`${city}faq/$`));
    }
  });

  test('the footer has the site-wide FAQ everywhere, and the city one on its pages', async ({ page }) => {
    await page.goto('/us/ca/berkeley/capital/');
    const footer = page.locator('footer nav');
    await expect(footer.getByRole('link', { name: 'Berkeley questions' })).toHaveAttribute('href', '/us/ca/berkeley/faq/');
    await footer.getByRole('link', { name: 'Questions people ask' }).click();
    await expect(page).toHaveURL(/\/faq\/$/);
    await page.goto('/');
    await expect(page.locator('footer nav').getByRole('link', { name: /questions$/ })).toHaveCount(0);
  });

  test('the landing page links the site-wide FAQ, and it links each city\'s', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-site-faq-link]').click();
    await expect(page).toHaveURL(/\/faq\/$/);
    await page.locator('[data-city-faqs]').getByRole('link', { name: "Fremont's questions" }).click();
    await expect(page).toHaveURL(/\/us\/ca\/fremont\/faq\/$/);
  });
});
