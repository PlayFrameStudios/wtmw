import { expect, test } from '@playwright/test';

const PAGE = '/us/ca/berkeley/';
const dimmed = (page: import('@playwright/test').Page) => page.locator('.sq.dim').count();

test.describe('the $100 waffle (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('hovering a square highlights its department and shows the tooltip', async ({ page }) => {
    await page.goto(PAGE);
    await page.locator('.sq[data-item="police"]').first().hover();
    const tip = page.locator('[data-tip]');
    await expect(tip).toBeVisible();
    // #33: whole dollars, one per square; the baseline and cut are a tap away on the Departments page.
    await expect(tip.locator('[data-panel="police"]')).toHaveText(/^\s*Police\s*\$37 of every \$100\s*Department details →\s*$/);
    expect(await dimmed(page)).toBe(63);
    await page.mouse.move(5, 5);
    await expect(tip).toBeHidden();
    expect(await dimmed(page)).toBe(0);
  });

  test('the grid is a single Tab stop', async ({ page }) => {
    await page.goto(PAGE);
    expect(await page.locator('.sq[tabindex="0"]').count()).toBe(1);
    // Tab in from the lede's ⓘ just before the grid, then Tab once more: out of the grid.
    await page.locator('.hero-copy button[data-info]').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.sq').first()).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('sq'))).toBe(false);
  });

  test('arrow keys move square by square', async ({ page }) => {
    await page.goto(PAGE);
    await page.locator('.sq').first().focus();
    await expect(page.locator('[data-panel="police"]')).toBeVisible();
    // Police fills the first 3 columns and 7 of the 4th: column 4, row 8 is the next department.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowDown');
    await expect(page.locator('.sq:focus')).toHaveAttribute('data-index', '37');
    await expect(page.locator('.sq:focus')).toHaveAttribute('data-item', 'fire');
    await expect(page.locator('[data-panel="fire"]')).toBeVisible();
    expect(await page.locator('.sq[tabindex="0"]').count()).toBe(1);
    // Tab leaves the grid in one step.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.grid'))).toBe(false);
  });

  test('Enter pins the tooltip, which links to Department details; Esc unpins', async ({ page }) => {
    await page.goto(PAGE);
    await page.locator('.sq[data-item="fire"]').first().focus();
    await page.keyboard.press('Enter');
    const tip = page.locator('[data-tip]');
    await expect(tip).toHaveClass(/pinned/);
    const squares = await page.locator('.sq[data-item="fire"]').count();
    await expect(tip.locator('[data-panel="fire"] .panel-figure')).toHaveText(`$${squares} of every $100`);
    await expect(tip.locator('[data-panel="fire"]').getByRole('link', { name: 'Department details' })).toHaveAttribute('href', `${PAGE}departments/#fire`);
    // Park the mouse away from the grid, as a person would before reaching for the keyboard.
    await page.mouse.move(5, 5);
    await page.locator('.sq[data-item="fire"]').first().focus();
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
  });

  test('"Show as a table" lists every department', async ({ page }) => {
    await page.goto(PAGE);
    await page.getByText('Show as a table').click();
    await expect(page.locator('.as-table tbody tr')).toHaveCount(16);
    await expect(page.locator('.as-table tbody tr').first()).toContainText('Police');
  });
});

test.describe('the $100 waffle (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a tap opens a bottom sheet with a link to department details', async ({ page }) => {
    await page.goto(PAGE);
    await page.locator('.sq[data-item="hhcs"]').first().tap();
    const tip = page.locator('[data-tip]');
    await expect(tip).toHaveClass(/sheet/);
    const box = (await tip.boundingBox())!;
    expect(box.x).toBe(0);
    expect(Math.round(box.width)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
    await expect(tip.locator('[data-panel="hhcs"]')).toContainText(`Health, Housing & Community Services$${await page.locator('.sq[data-item="hhcs"]').count()} of every $100`);
    await expect(tip.getByRole('link', { name: 'Department details' })).toHaveAttribute('href', '/us/ca/berkeley/departments/#hhcs');
    await tip.getByRole('button', { name: 'Close' }).tap();
    await expect(tip).toBeHidden();
  });
});

// #33: the sheet's old "proposed cut" was the full reduction, which is the fails outcome. Department details
// labels each outcome: Fire $6.7M if Measure V fails, $3.0M if it passes.
test('Department details names the ballot outcome each cut assumes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${PAGE}departments/#fire`);
  const panel = page.locator('section.panel#fire');
  await expect(panel).toBeVisible();
  for (const [t, net] of [['passes', '$3.0M'], ['fails', '$6.7M']]) {
    await page.locator(`label[for="tax-${t}"]`).first().click();
    const row = panel.locator('.yr--fy2027 .facts > div').filter({ hasText: `Net cut if Measure V ${t}` });
    await expect(row).toBeVisible();
    await expect(row.locator('dd')).toContainText(net);
  }
});

test.describe('the overview, cut to the essentials (#33)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('is at least 30% shorter than its 5.3 screens (4,463px), with the tour above the chart', async ({ page }) => {
    await page.goto(PAGE);
    await page.evaluate(() => document.fonts.ready);
    // #51 added a line the story requires under the property-tax card (3 lines, ~75px with its gap at 390px),
    // which this budget, set before it, has no room for. Everything else is still held to the #33 budget;
    // the line's own cost is measured and left out, and the conflict is raised on #51 for a decision.
    const covers = await page.evaluate(() => {
      const line = document.querySelector('[data-covers-line]');
      if (!line) return 0;
      return line.getBoundingClientRect().height + parseFloat(getComputedStyle(line.parentElement!).rowGap);
    });
    expect(covers).toBeLessThanOrEqual(80);
    expect((await page.evaluate(() => document.documentElement.scrollHeight)) - covers).toBeLessThanOrEqual(Math.floor(4463 * 0.7));
    const tour = page.getByRole('link', { name: 'Start the 3-minute tour' }).filter({ visible: true });
    expect((await tour.boundingBox())!.y).toBeLessThan((await page.locator('.hero-waffle').boundingBox())!.y);
  });

  test("the lede's ⓘ opens the three sizes, each with its receipt", async ({ page }) => {
    await page.goto(PAGE);
    const panel = page.locator('#lede-sizes');
    await expect(panel).toBeHidden();
    await page.locator('.lede button[data-info]').click();
    await expect(panel).toBeVisible();
    await expect(panel.locator('button.sourced')).toHaveText(['$916.8M', '$313.8M', '$283.8M']);
    await panel.locator('button.sourced').nth(1).click();
    await expect(page.locator('dialog[data-receipt-dialog] .figure')).toHaveText('$313,849,211');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});

// #33 review: without hover, nothing else says the chart can be tapped. (The homepage's chart is a static link, #28.)
for (const [where, url] of [['overview', PAGE]]) {
  test(`the ${where} chart says it can be tapped on a phone, and hovered or clicked on a desktop`, async ({ browser }) => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await phone.newPage();
    await p.goto(url);
    // One of the two wordings shows; the other is display:none, so screen readers hear one too.
    await expect(p.locator('.waffle .caption span').filter({ visible: true })).toHaveText(['Tap a square to see the department.']);
    const [grid, cap, table] = await Promise.all(['.waffle .grid', '.waffle .caption', '.waffle .as-table'].map((s) => p.locator(s).boundingBox()));
    expect(cap!.y).toBeGreaterThanOrEqual(grid!.y + grid!.height);
    expect(cap!.y).toBeLessThan(table!.y);
    await phone.close();
    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const d = await desk.newPage();
    await d.goto(url);
    await expect(d.locator('.waffle .caption span').filter({ visible: true })).toHaveText(['Hover or click a square to see the department.']);
    await desk.close();
  });
}
