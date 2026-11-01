/**
 * "What this budget covers" (#51): the five reader questions on each city's Sources page, the
 * overview's property-tax line that links there, and the glossary terms. Answers are checked against
 * budget.json, so the test follows the data rather than a second copy of it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { CityBudget } from '../../src/data/types';
import { shortMoney } from '../../src/lib/format';

const budget = (city: string): CityBudget => JSON.parse(readFileSync(join(import.meta.dirname, '../../data/cities/us/ca', city, 'budget.json'), 'utf8'));
const dialog = (page: Page) => page.locator('dialog[data-receipt-dialog]');
const QUESTIONS = ['everything', 'schools', 'else', 'property-tax', 'city-pays'];

const CITIES = [
  {
    slug: 'berkeley',
    name: 'Berkeley',
    district: 'Berkeley Unified School District (BUSD)',
    board: 'Its School Board has five elected directors',
    // #52: Berkeley's answer goes to the BUSD page on this site.
    districtLink: { href: '/us/ca/berkeley/schools/', external: false },
    schoolsPage: true,
    agencies: ['Alameda County', 'Peralta Community College District', 'BART', 'AC Transit', 'East Bay Municipal Utility District (EBMUD)', 'East Bay Regional Park District'],
    propertyExtra: "BUSD's three school parcel taxes bring in $68.8M in 2026-27.",
    cityPays: "The City of Berkeley isn't on that list.",
    terms: ['Parcel tax', 'School district', 'Special district'],
    generalFundTerm: 'general-fund-gf',
    agencyReceipt: { name: 'East Bay Municipal Utility District (EBMUD)', publisher: 'East Bay Municipal Utility District (EBMUD)' },
  },
  {
    slug: 'fremont',
    name: 'Fremont',
    district: 'Fremont Unified School District (FUSD)',
    board: 'It is governed by a five-member Board of Education, each member elected to a four-year term.',
    districtLink: { href: 'https://fremontunified.org/about/business-services/budget/', external: true },
    schoolsPage: false,
    agencies: [
      'Alameda County',
      'Fremont-Newark Community College District',
      'BART and AC Transit',
      'Alameda County Water District',
      'Union Sanitary District',
      'Alameda County Flood Control and Water Conservation District',
      'East Bay Regional Park District',
    ],
    propertyExtra: 'The City says it receives about 15 cents of every dollar of property tax paid',
    cityPays: "FUSD's budget groups its General Fund money by kind",
    terms: ['Parcel Tax', 'School District', 'Special District'],
    generalFundTerm: 'general-fund',
    agencyReceipt: { name: 'Alameda County', publisher: 'County of Alameda' },
  },
];

for (const c of CITIES) {
  test.describe(`${c.name}: what this budget covers`, () => {
    const path = `/us/ca/${c.slug}/`;
    const b = budget(c.slug);
    const block = (page: Page) => page.locator('#what-this-covers');
    const answer = (page: Page, id: string) => block(page).locator(`[data-question="${id}"]`);

    test('answers the five questions, in order, near the top of the Sources page', async ({ page }) => {
      await page.goto(`${path}sources/`);
      await expect(block(page)).toBeVisible();
      await expect(block(page).locator('[data-question]')).toHaveCount(5);
      expect(await block(page).locator('[data-question]').evaluateAll((els) => els.map((e) => e.getAttribute('data-question')))).toEqual(QUESTIONS);
      // Above the list of documents.
      const top = async (sel: string) => (await page.locator(sel).first().boundingBox())!.y;
      expect(await top('#what-this-covers')).toBeLessThan(await top('.src-row'));
    });

    test('1. Is this everything? The City government, all funds and the General Fund', async ({ page }) => {
      await page.goto(`${path}sources/`);
      const a = answer(page, 'everything');
      await expect(a.locator('h3')).toHaveText(`Is this everything the City of ${c.name} spends?`);
      await expect(a).toContainText('Yes, for the City government.');
      await expect(a.locator('button.sourced')).toHaveText([shortMoney(b.size.allFunds.amount), shortMoney(b.size.generalFund.amount)]);
      const gf = a.getByRole('link', { name: 'General Fund' });
      await expect(gf).toHaveAttribute('href', `${path}glossary/#${c.generalFundTerm}`);
      await gf.click();
      await expect(page.locator(`#${c.generalFundTerm}`)).toBeInViewport();
    });

    test("2. Where are the schools? A separate government, with its own elected board and budget", async ({ page }) => {
      await page.goto(`${path}sources/`);
      const a = answer(page, 'schools');
      await expect(a).toContainText(c.district);
      await expect(a).toContainText(c.board);
      await expect(a).toContainText("school spending isn't in the City's numbers.");
      const site = a.locator(`a[href="${c.districtLink.href}"]`);
      await expect(site).toHaveCount(1);
      if (c.districtLink.external) await expect(site).toHaveAttribute('target', '_blank');
      else await expect(site).not.toHaveAttribute('target');
      await expect(a.locator('button.cite')).toHaveCount(2);
    });

    test('3. What else? Each other government, each with its receipt', async ({ page }) => {
      await page.goto(`${path}sources/`);
      const items = answer(page, 'else').locator('[data-agency]');
      expect(await items.locator('strong').allTextContents()).toEqual(c.agencies.map((n) => `${n}.`));
      for (const item of await items.all()) await expect(item.locator('button.cite')).toHaveCount(1);
    });

    test("4. Where does property tax go? The 1% is shared; this site shows the City's part", async ({ page }) => {
      await page.goto(`${path}sources/`);
      const a = answer(page, 'property-tax');
      await expect(a).toContainText('The basic 1% property tax is pooled by the county and divided under state law among the county, cities, schools and special districts.');
      await expect(a).toContainText(c.propertyExtra);
      // The overview's property-tax group: its lines' adopted amounts, from the same data.
      const group = JSON.parse(readFileSync(join(import.meta.dirname, '../../data/cities/us/ca', c.slug, 'revenue-groups.json'), 'utf8')).groups.find((g: { id: string }) => g.id === 'property-tax');
      const value = b.revenue.lines.filter((l) => group.lines.includes(l.name)).reduce((t, l) => t + l.values[b.revenue.primary], 0);
      await expect(a).toContainText(`The ${shortMoney(value)} in property tax on these pages is only the City's share.`);
      await expect(a.locator('button.sourced')).toHaveText(shortMoney(value));
      await expect(a.getByRole('link', { name: 'special districts' })).toHaveAttribute('href', new RegExp(`^${path}glossary/#special-district$`));
    });

    test('5. Does the City pay for the schools? What the documents show, and what we did not check', async ({ page }) => {
      await page.goto(`${path}sources/`);
      const a = answer(page, 'city-pays');
      await expect(a).toContainText(c.cityPays);
      await expect(a).toContainText("We haven't checked every line of the City's full budget");
      await expect(a).not.toContainText(/gives (the )?schools nothing/i);
    });

    test("another government's receipt says it isn't the City's", async ({ page }) => {
      await page.goto(`${path}sources/`);
      await answer(page, 'else').locator('[data-agency]').filter({ has: page.getByText(`${c.agencyReceipt.name}.`, { exact: true }) }).locator('button.cite').click();
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page).locator('.badge--other')).toHaveText('Another government');
      await expect(dialog(page).locator('.caveat')).toHaveText(`This document is from ${c.agencyReceipt.publisher}, not the City. Its figures are not part of the City's budget.`);
    });

    test("the overview's property-tax card links to the block", async ({ page }) => {
      await page.goto(path);
      const line = page.locator('[data-covers-line]');
      await expect(line).toContainText("Your property tax bill pays several governments, including the City, the school district and the county. This page shows only the City's part.");
      // Inside the property-tax card.
      await expect(page.locator('.things > li').first().locator('[data-covers-line]')).toHaveCount(1);
      // "the school district" goes to its budget where the city has that page (#52).
      const district = line.getByRole('link', { name: 'the school district' });
      if (c.schoolsPage) await expect(district).toHaveAttribute('href', `${path}schools/`);
      else await expect(district).toHaveCount(0);
      await line.getByRole('link', { name: "This page shows only the City's part." }).click();
      await expect(page).toHaveURL(new RegExp(`${path}sources/#what-this-covers$`));
      await expect(block(page)).toBeInViewport();
    });

    test('the glossary defines parcel tax, special district and school district, each with its receipt', async ({ page }) => {
      await page.goto(`${path}glossary/`);
      for (const t of c.terms) {
        const entry = page.locator('dl > div', { has: page.locator('dt', { hasText: new RegExp(`^${t}$`) }) });
        await expect(entry, t).toHaveCount(1);
        await expect(entry.locator('button.cite'), t).toHaveCount(1);
      }
    });
  });
}
