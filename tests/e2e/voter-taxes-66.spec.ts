/**
 * #66: "Money voters set aside" in a browser. Berkeley's sum opens a receipt that lists the eight estimates it adds,
 * an amount opens its ordinance's sentence, and no Revenue page scrolls sideways at 390px.
 */
import { expect, test } from '@playwright/test';

test.describe('money voters set aside (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("Berkeley's $99.7M opens our sum, built from the eight ordinances", async ({ page }) => {
    await page.goto('/us/ca/berkeley/revenue/#voter-taxes');
    await page.locator('[data-voter-sum]').getByRole('button', { name: /^\$99\.7M, source: / }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Our sum of the City's eight estimates, FY2027 estimate");
    await expect(dialog).toContainText('$99,718,096');
    await expect(dialog).toContainText('SAFE STREETS Initiative (Measure FF of 2024)');
  });

  test("Lafayette's Measure H amount opens its line of the revenue estimate", async ({ page }) => {
    await page.goto('/us/ca/lafayette/revenue/');
    await page.locator('[data-voter-tax="measure-h"]').getByRole('button', { name: /^\$3\.3M, source: / }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('$3,321,356');
    await expect(dialog).toContainText('401.1 Measure H');
  });
});

test.describe('money voters set aside (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const city of ['berkeley', 'fremont', 'lafayette']) {
    test(`${city}: no sideways scroll, and the section is laid out within the page`, async ({ page }) => {
      await page.goto(`/us/ca/${city}/revenue/`);
      const section = page.locator('#voter-taxes');
      await expect(section).toBeVisible();
      const w = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        right: Math.max(...[...document.querySelectorAll('#voter-taxes *')].map((e) => e.getBoundingClientRect().right)),
      }));
      expect(w.scroll).toBe(w.client);
      expect(w.right).toBeLessThanOrEqual(w.client);
    });
  }
});
