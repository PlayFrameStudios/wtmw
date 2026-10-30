import { expect, test } from '@playwright/test';
import { openAt } from '../../src/lib/open-at';
import type { Receipt } from '../../src/lib/receipts';
import { cityRoutes } from './cities';

// #30: every receipt on every page, opened for real: the drawer's PDF links carry the quote's page.
const ROUTES = ['/', ...cityRoutes];
test.use({ viewport: { width: 1440, height: 900 } });

for (const route of ROUTES) {
  test(`${route}: each drawer opens its PDFs at the quoted page`, async ({ page }) => {
    await page.goto(route);
    type Sources = Record<string, { url: string; format: string }>;
    const data: { sources: Sources; others?: Record<string, { sources: Sources }> } = JSON.parse((await page.locator('#receipt-data').textContent())!);
    // A trigger for another city's figure (the landing page's sample cards, #49) uses that city's sources.
    const sourcesOf = (city?: string) => (city && data.others?.[city]?.sources) || data.sources;
    // One trigger per distinct receipt; the rest open the same drawer.
    const triggers = await page.evaluate(() => {
      const seen = new Set<string>();
      return [...document.querySelectorAll<HTMLElement>('[data-source-chip]')].flatMap((el, i) => {
        const holder = el.closest<HTMLElement>('[data-receipt]')!;
        const r = holder.dataset.receipt!;
        const city = holder.dataset.receiptCity;
        if (seen.has(`${city} ${r}`)) return [];
        seen.add(`${city} ${r}`);
        el.dataset.pdfCheck = String(i);
        return [{ i, r, city }];
      });
    });
    const d = page.locator('dialog[data-receipt-dialog]');
    let paged = 0;
    for (const { i, r, city } of triggers) {
      const receipt: Receipt = JSON.parse(r);
      const sources = sourcesOf(city);
      // Open it the way the drawer's own click handler would, even if the trigger sits in a closed panel.
      await page.locator(`[data-pdf-check="${i}"]`).evaluate((el: HTMLElement) => el.click());
      await expect(d).toBeVisible();
      const primary = openAt(sources[receipt.sources[0]], receipt.page);
      await expect(d.locator('.actions a.btn--primary')).toHaveAttribute('href', primary.href);
      await expect(d.locator('.actions a.btn--primary')).toHaveText(primary.label);
      const also = await d.locator('.also a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      expect(also).toEqual(receipt.sources.slice(1).map((id) => openAt(sources[id], receipt.also?.find((c) => c.source === id && c.page)?.page).href).sort((x, y) => also.indexOf(x) - also.indexOf(y)));
      if (primary.href.includes('#page=')) paged++;
      await page.keyboard.press('Escape');
      await expect(d).toBeHidden();
    }
    // Not vacuous: the page has receipts (the glossary has none), and the paged ones were among those checked.
    if (!route.endsWith('/glossary/')) expect(triggers.length).toBeGreaterThan(0);
    expect(paged).toBe(triggers.filter(({ r, city }) => JSON.parse(r).page && sourcesOf(city)[JSON.parse(r).sources[0]].format === 'PDF').length);
  });
}
