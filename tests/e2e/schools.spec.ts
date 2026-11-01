/**
 * The school district's budget page (#52): the banner, the total, the reconciliation, the parcel taxes,
 * and the links in from the City pages. Figures are checked against budget.json, not a second copy.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { CityBudget } from '../../src/data/types';
import { shortMoney } from '../../src/lib/format';

const PAGE = '/us/ca/berkeley/schools/';
const b: CityBudget = JSON.parse(readFileSync(join(import.meta.dirname, '../../data/cities/us/ca/berkeley/budget.json'), 'utf8'));
const s = b.schools!;
const dialog = (page: Page) => page.locator('dialog[data-receipt-dialog]');

test.describe('BUSD budget page', () => {
  test('opens with the banner: a separate government, not the City', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('h1')).toHaveText("Berkeley Unified School District's budget");
    const banner = page.locator('[data-schools-banner]');
    await expect(banner).toHaveText(
      "Berkeley Unified School District is a separate government with its own elected school board. These numbers come from BUSD's budget, not the City's.",
    );
    await expect(banner).toBeInViewport();
    await expect(banner).toHaveAttribute('role', 'note');
  });

  test('says how big it is, and that its year lines up with the City’s', async ({ page }) => {
    await page.goto(PAGE);
    const size = page.locator('[data-schools-size]');
    await expect(size).toHaveText(`BUSD expects ${shortMoney(s.revenue.total.value)} of General Fund revenue in 2026-27, and plans to spend ${shortMoney(s.spending.total.value)}.`);
    await expect(size).toContainText('$248.2M');
    await size.locator('button.sourced').first().click();
    await expect(dialog(page)).toContainText('combined General Fund is projected to receive $248.2 million in revenue');
    await expect(dialog(page).locator('.badge--other')).toHaveText('Another government');
    await page.keyboard.press('Escape');
    await expect(page.locator('#sc-size ~ .sc-note')).toContainText("BUSD's year runs July 1 to June 30, like the City's fiscal year, so its 2026-27 budget lines up with the City's FY2027.");
  });

  test('the revenue parts reconcile to the total, the gap in BUSD’s own words', async ({ page }) => {
    await page.goto(PAGE);
    const parts = page.locator('[data-schools-revenue] [data-part]');
    expect(await parts.evaluateAll((els) => els.map((e) => e.getAttribute('data-part')))).toEqual(['lcff', 'parcel-taxes', 'restricted', 'other-state', 'other-local']);
    const shown = await parts.locator('button.sourced').allTextContents();
    expect(shown).toEqual(['$122.9M', '$68.8M', '$49.7M', '$4.5M', '$2.3M']);
    // The figures on the page add up to the total on the page.
    const tenths = shown.reduce((a, t) => a + Math.round(Number(t.replace(/[$M]/g, '')) * 10), 0);
    expect(tenths / 10).toBe(248.2);
    // The fifth part is BUSD's own line, not a residual.
    await expect(page.locator('#rev-other-local')).toContainText('Unrestricted local money: $0.4 million from leases and rentals, and $1.9 million of other local revenue.');
    await expect(page.locator('#rev-other-local')).not.toContainText(/\bother\b(?! local)/i);
    const notes = page.locator('#sc-revenue ~ [data-schools-note], [data-schools-revenue] ~ [data-schools-note]');
    await expect(notes.first()).toHaveText("These five add up to BUSD's total. Its State budget form gives the total to the dollar: $248,205,134.");
    await expect(notes.nth(1)).toContainText("the State form's parcel-tax line records $68,632,427");
  });

  test('the waffle and its list: $100 of revenue, biggest first', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('#sc-revenue').locator('..').locator('.sc-groups li')).toHaveText([
      /State school funding \(LCFF\)\s*\$49/,
      /Berkeley's school parcel taxes\s*\$28/,
      /Restricted federal, state and local money\s*\$20/,
      /Other state money\s*\$2/,
      /Rentals and other local money\s*\$1/,
    ]);
  });

  test('spending by category: dollars, shares derived from them, and the total to the dollar', async ({ page }) => {
    await page.goto(PAGE);
    const rows = page.locator('[data-schools-spending] tbody tr');
    await expect(rows).toHaveCount(7);
    await expect(rows.first()).toContainText('Certificated salaries');
    await expect(rows.first().locator('td').nth(0)).toHaveText('$100.8M');
    await expect(rows.first().locator('td').nth(1)).toHaveText('40.4%');
    await expect(page.locator('[data-row="indirect"] td').nth(1)).toHaveText('—');
    await expect(page.locator('#sc-spending ~ [data-schools-note]').first()).toHaveText("These add up to BUSD's total spending on its State budget form: $249,487,813.");
    await page.locator('[data-row="certificated"] button.sourced').click();
    await expect(dialog(page)).toContainText('2026-27 Budget, Total Fund');
  });

  test("is it balanced: BUSD's own numbers and words", async ({ page }) => {
    await page.goto(PAGE);
    const bal = page.locator('[data-schools-balance]');
    await expect(bal).toContainText('BUSD plans to spend $249.5 million from its General Fund in 2026-27 and to take in $248.2 million.');
    await expect(bal).toContainText('$2.3 million in 2026-27, $0.4 million in 2027-28 and $0.2 million in 2028-29');
    await expect(bal).toContainText('3.4%, 3.3% and 3.2%');
    await expect(bal.locator('blockquote')).toHaveCount(2);
    await expect(bal.locator('blockquote').first()).toContainText('the District is required to implement $7.0 million in budget balancing adjustments');
  });

  test('the three parcel taxes, by their current measures, adding up to the parcel-tax part', async ({ page }) => {
    await page.goto(PAGE);
    const taxes = page.locator('[data-parcel-tax]');
    await expect(taxes.locator('h3')).toHaveText([
      'Berkeley Schools Excellence Program (BSEP)',
      'Berkeley Public Schools Educator Recruitment and Retention Act (BERRA)',
      'Facilities Safety and Maintenance Act',
    ]);
    await expect(page.locator('[data-parcel-tax="bsep"]')).toContainText('Measure H of 2024, which replaced Measure E1 in 2025-26.');
    await expect(taxes.locator('.sc-tax-amount button.sourced')).toHaveText(['$46.8M', '$12.6M', '$9.4M']);
  });

  test("links out to BUSD's budget page and book", async ({ page }) => {
    await page.goto(PAGE);
    const links = page.locator('[data-schools-links] a');
    await expect(links).toHaveCount(2);
    await expect(links.first()).toHaveAttribute('href', 'https://www.berkeleyschools.net/departments/business-services-division/berkeley-unified-budget/');
    await expect(links.nth(1)).toHaveAttribute('href', /Adopted-Budget-2026-27-061226\.pdf$/);
    for (const l of await links.all()) await expect(l).toHaveAttribute('target', '_blank');
  });

  test('one click from the City pages: the coverage block, the overview line and the footer', async ({ page }) => {
    await page.goto('/us/ca/berkeley/sources/');
    await page.locator('[data-question="schools"]').getByRole('link', { name: "See BUSD's budget, explained" }).click();
    await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
    await page.goto('/us/ca/berkeley/');
    await page.locator('[data-covers-line]').getByRole('link', { name: 'the school district' }).click();
    await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
    await expect(page.locator('footer').getByRole('link', { name: 'School district budget' })).toHaveAttribute('href', PAGE);
  });

  test('is not in the main nav, and other cities have no such page', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('nav.desktop a[href$="/schools/"]')).toHaveCount(0);
    for (const other of ['/us/ca/fremont/schools/', '/test/cities/fixtureville/schools/']) {
      const res = await page.goto(other);
      expect(res?.status(), other).toBe(404);
    }
    await page.goto('/us/ca/fremont/');
    await expect(page.locator('footer').getByRole('link', { name: 'School district budget' })).toHaveCount(0);
  });
});
