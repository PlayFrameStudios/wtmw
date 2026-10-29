import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { cityRoutes } from './cities';

const ROUTES = ['/', ...cityRoutes, '/test/receipts/', '/us/ca/nowhere/'];

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

for (const width of [390, 1440]) {
  test.describe(`WCAG 2.1 AA at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const route of ROUTES) {
      test(route, async ({ page }) => {
        await page.goto(route);
        await page.evaluate(() => document.fonts.ready);
        expect(await violations(page)).toEqual([]);
      });
    }

    test('an open receipt', async ({ page }) => {
      await page.goto('/test/receipts/');
      await page.locator('[data-figure="liability"] [data-source-chip]').click();
      await expect(page.locator('dialog[data-receipt-dialog]')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}

test('the open mobile menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/us/ca/berkeley/');
  await page.locator('summary[aria-label="Menu"]').click();
  expect(await violations(page)).toEqual([]);
});
