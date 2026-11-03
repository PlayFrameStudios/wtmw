/**
 * #63: Fire's cut on The Gap says what the Council restored at adoption, for the year shown, and the amount opens
 * the motion's table (p. 4 of the annotated agenda) with how it's built.
 */
import { expect, test } from '@playwright/test';

test.describe('what the Council restored at adoption (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Fire's panel: FY2027's restoration, its receipt, and FY2028's note when that year is picked", async ({ page }) => {
    await page.goto('/us/ca/berkeley/gap/#fire');
    const panel = page.locator('.panel[data-dept="fire"]');
    const fy27 = panel.locator('.yr--fy2027 [data-restored="fire"]');
    const fy28 = panel.locator('.yr--fy2028 [data-restored="fire"]');
    await expect(fy27).toBeVisible();
    await expect(fy27).toContainText('At adoption, the Council restored $1.73M of this, for 9 positions');
    await expect(fy28).toBeHidden();

    await fy27.getByRole('button', { name: /^\$1\.73M, source: / }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Fire: restored at adoption, FY2027');
    await expect(dialog).toContainText('p. 4 of the PDF');
    await expect(dialog).toContainText('5.0 FTE Fire Fighters (Step 1) $1,109,795');
    await expect(dialog).toContainText('How this number is built');
    await page.keyboard.press('Escape');

    await page.locator('label[for="cuts-year-fy2028"]').click();
    await expect(fy28).toBeVisible();
    await expect(fy28).toHaveText(/The adopted motion funds the same 9 positions in FY2028; its table lists FY2027 amounts only\./);
    await expect(fy27).toBeHidden();
  });
});
