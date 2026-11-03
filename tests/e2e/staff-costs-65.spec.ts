/**
 * #65: "What staff cost" in a browser. A figure opens its row on its page, the FAQ link reaches the answer, and no
 * Departments page scrolls sideways at 390px.
 */
import { expect, test } from '@playwright/test';

test.describe('what staff cost (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("Berkeley's FY2027 normal cost opens the January deck's pension row", async ({ page }) => {
    await page.goto('/us/ca/berkeley/departments/#staff-costs');
    const block = page.locator('[data-staff-section="pension"]');
    await block.getByRole('button', { name: /^\$20\.2M, source: / }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Normal cost, FY2027 baseline');
    await expect(dialog).toContainText('$20,230,000');
    await expect(dialog).toContainText('Normal Cost $17.72 $19.25 $20.23 $19.63');
  });

  test("Fremont's link reaches the answer on why cities can't be compared", async ({ page }) => {
    await page.goto('/us/ca/fremont/departments/');
    await page.locator('[data-staff-faq-link]').click();
    await expect(page).toHaveURL(/\/faq\/#why-not-compare-staff-costs$/);
    await expect(page.locator('#why-not-compare-staff-costs')).toContainText("Why can't I compare one city's pension or staff costs with another's?");
  });
});

test.describe('what staff cost (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const city of ['berkeley', 'fremont', 'lafayette']) {
    test(`${city}: no sideways scroll`, async ({ page }) => {
      await page.goto(`/us/ca/${city}/departments/`);
      await expect(page.locator('#staff-costs')).toBeVisible();
      const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(w.scroll).toBe(w.client);
    });
  }
});
