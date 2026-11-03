import { expect, test } from '@playwright/test';

const PAGE = '/us/ca/berkeley/ballot/';

for (const width of [390, 1440]) {
  test(`at ${width}px both outcomes get identical weight`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(PAGE);
    const cards = page.locator('.scenario');
    await expect(cards).toHaveCount(2);
    const look = (i: number) =>
      cards.nth(i).evaluate((el) => {
        const h = el.querySelector('.scenario-h')!;
        const on = el.querySelector('.person.on')!;
        const r = el.getBoundingClientRect();
        return { width: Math.round(r.width), header: getComputedStyle(h).backgroundColor, person: getComputedStyle(on).getPropertyValue('--c'), font: getComputedStyle(el.querySelector('.big-n')!).fontSize };
      });
    expect(await look(0)).toEqual(await look(1));
  });
}

for (const width of [390, 1440]) {
  test(`side by side at ${width}px, same height row`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(PAGE);
    const [a, b] = await page.locator('.scenario').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    expect(a.top).toBe(b.top);
    expect(a.right).toBeLessThan(b.left);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

// #31: what changes comes first. On a phone's first screen: both outcomes, their counts, and Fire Station 4.
test('at 390px the first screen shows both outcomes and Fire Station 4', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PAGE);
  await page.evaluate(() => document.fonts.ready);
  const inView = (loc: ReturnType<typeof page.locator>) => loc.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height > 0; }));
  for (const [o, n, laid] of [['passes', '105', '20'], ['fails', '138', '38']]) {
    const card = page.locator(`.scenario[data-outcome="${o}"]`);
    await expect(card.locator('.big')).toContainText(new RegExp(`^\\s*${n}\\s*positions cut`));
    await expect(card.locator('.pict-label')).toHaveText(`${laid} people laid off`);
    expect(await inView(card.locator('.big-n, .pict-label, .pict, [data-row="fire-station"]'))).toEqual([true, true, true, true]);
  }
  await expect(page.locator('[data-row="fire-station"] dd')).toHaveText([/^\s*Tax revenue proposed to keep it open/, /^\s*Closure reconsidered for FY2028/]);
});

test('the mechanics sit behind Details, closed until asked', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PAGE);
  for (const [letter, hidden] of [['V', 'April 1, 2027'], ['U', '$22.14']]) {
    const details = page.locator('.measure', { hasText: `Measure ${letter}:` }).locator('details');
    await expect(details.getByText(hidden)).toBeHidden();
    await expect(details.getByRole('navigation')).toBeHidden();
    await details.locator('summary').click();
    await expect(details.getByText(hidden)).toBeVisible();
    await expect(details.getByRole('navigation', { name: `Read Measure ${letter}` })).toBeVisible();
  }
});

test('a deep link to a source cited only inside Details opens it, so focus can return there', async ({ page }) => {
  await page.goto(PAGE);
  const id = await page.evaluate(() => {
    const firstFor = (s: string) => document.querySelector(`[data-source-chip~="${s}"]`);
    const ids = [...document.querySelectorAll<HTMLElement>('details [data-source-chip]')].flatMap((el) => el.dataset.sourceChip!.split(' '));
    return ids.find((s) => firstFor(s)!.closest('details'));
  });
  expect(id).toBeTruthy();
  await page.goto(`${PAGE}?source=${id}`);
  const d = page.locator('dialog[data-receipt-dialog]');
  await expect(d).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(d).toBeHidden();
  const chip = page.locator(`[data-source-chip~="${id}"]`).first();
  await expect(chip).toBeFocused();
  await expect(chip).toBeVisible();
});

test('the pictograms are labeled with the layoff counts', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByRole('img', { name: '20 people laid off, out of 40 shown' })).toBeVisible();
  await expect(page.getByRole('img', { name: '38 people laid off, out of 40 shown' })).toBeVisible();
});

test('the nav, the overview and the landing page link here', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/us/ca/berkeley/');
  await expect(page.locator('nav.desktop').getByRole('link', { name: 'Ballot' })).toHaveAttribute('href', PAGE);
  await expect(page.getByRole('link', { name: 'Compare both outcomes' })).toHaveAttribute('href', PAGE);
  await page.goto('/');
  await expect(page.locator(`a[href="${PAGE}"]`).first()).toBeVisible();
});

test('a scenario row opens a receipt with the PDF page and the sentence it quotes', async ({ page }) => {
  await page.goto(PAGE);
  await page.locator('.scenario[data-outcome="fails"] [data-row="fire-station"] .chips button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('p. 55 of the PDF');
  await expect(dialog).toContainText('the proposed station closure will be reconsidered for Fiscal Year 2028');
  await expect(dialog).not.toContainText('Basis');
});

test("each measure card links its own City documents, opening in a new tab", async ({ page }) => {
  await page.goto(PAGE);
  for (const letter of ['V', 'U']) {
    await page.locator('summary', { hasText: `Details on Measure ${letter}` }).click();
    const nav = page.getByRole('navigation', { name: `Read Measure ${letter}` });
    await expect(nav.getByRole('link')).toHaveCount(3);
    const full = nav.getByRole('link', { name: 'Full text (PDF, opens in a new tab)' });
    await expect(full).toHaveAttribute('target', '_blank');
    await expect(full).toHaveAttribute('href', /Full%20Text\.pdf$/);
  }
});

// #36: each department's cut, passes or fails.
test('the department switch works by tap at 390px: Police shows $5.2M if it passes, $10.6M if it fails', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(PAGE);
  const police = page.locator('.dc-row[data-dept="police"]');
  await expect(police.locator('.dc-v').filter({ visible: true })).toHaveText(['$5.2M']);
  await page.locator('label[for="dc-fails"]').tap();
  await expect(police.locator('.dc-v').filter({ visible: true })).toHaveText(['$10.6M']);
  await expect(police.locator('.dc-why').filter({ visible: true })).toHaveText(['the full proposed cut']);
  // If it fails, the softened part is cut too: red, like the rest of the bar.
  const [cut, soft] = await Promise.all(['.dc-cut', '.dc-soft'].map((s) => police.locator(s).evaluate((e) => getComputedStyle(e).backgroundColor)));
  expect(soft).toBe(cut);
  await page.locator('label[for="dc-passes"]').tap();
  await expect(police.locator('.dc-v').filter({ visible: true })).toHaveText(['$5.2M']);
  await page.locator('.dc-same summary').tap();
  await expect(page.locator('.dc-same li[data-dept="hhcs"]')).toBeVisible();
  // The cuts are a section of The Gap since #61.
  await page.getByRole('link', { name: 'All departments' }).tap();
  await expect(page).toHaveURL(/\/us\/ca\/berkeley\/gap\/#cuts$/);
  await expect(page.locator('#cuts-title')).toBeInViewport();
  await ctx.close();
});

test('the department switch works by keyboard at 390px: arrow keys move between outcomes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PAGE);
  await page.locator('#dc-passes').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#dc-fails')).toBeChecked();
  await expect(page.locator('#dc-fails')).toBeFocused();
  await expect(page.locator('.dc-row[data-dept="fire"] .dc-v').filter({ visible: true })).toHaveText(['$6.7M']);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#dc-passes')).toBeChecked();
  await expect(page.locator('.dc-row[data-dept="fire"] .dc-v').filter({ visible: true })).toHaveText(['$3.0M']);
});

test('both department-switch states are styled identically: the chosen label, and the other one', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PAGE);
  const look = (id: string) =>
    page.locator(`label[for="${id}"]`).evaluate((e) => {
      const s = getComputedStyle(e);
      return [s.color, s.backgroundColor, s.fontWeight, s.fontSize, s.boxShadow, s.borderRadius, s.paddingLeft, s.paddingTop].join('|');
    });
  const passesOn = [await look('dc-passes'), await look('dc-fails')];
  await page.locator('label[for="dc-fails"]').click();
  await page.mouse.move(0, 0);
  const failsOn = [await look('dc-fails'), await look('dc-passes')];
  expect(failsOn).toEqual(passesOn);
  expect(passesOn[0]).not.toEqual(passesOn[1]);
});
