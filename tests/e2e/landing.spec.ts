import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { listed } from './cities';

// The sample card showing: one per city behind tabs (#49), Berkeley first.
const card = '.sample:not([hidden])';

test.describe('landing page', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the header links to its sections and to the list of cities', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav.desktop');
    for (const name of ['How it works', 'Cities', 'Our promise', 'Data']) await expect(nav.getByRole('link', { name })).toBeVisible();
    await nav.getByRole('link', { name: 'Choose a city →' }).click();
    await expect(page.locator('#covered')).toBeInViewport();
    await expect(page.locator('.covered')).toBeInViewport();
    await nav.getByRole('link', { name: 'Our promise' }).click();
    await expect(page.locator('#promise')).toBeInViewport();
  });

  test('question cards open receipts and deep-link to their pages', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.question').filter({ hasText: 'What if Measure V, the sales tax, passes?' });
    await card.locator('[data-source-chip]').click();
    const d = page.locator('dialog[data-receipt-dialog]');
    await expect(d.locator('.figure')).toHaveText('105');
    await expect(d.locator('.figure-label')).toHaveText('Positions cut if the sales tax passes (138 if it fails)');
    await expect(d.locator('.facts')).toContainText('FTE & Positions, row 12');
    await page.keyboard.press('Escape');
    for (const [q, href] of [
      ['Where does the money go?', '/us/ca/berkeley/'],
      ['Why is there a deficit?', '/us/ca/berkeley/gap/'],
      ["Who's cutting what?", '/us/ca/berkeley/departments/'],
    ]) {
      await expect(page.locator('.question').filter({ hasText: q }).locator('a.open')).toHaveAttribute('href', href);
    }
  });

  test('the hero receipt card opens the full receipt for the gap', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(`${card} .receipt-figure`)).toHaveText('−$29,249,339');
    await page.locator(`${card} .receipt-card [data-source-chip="S1"]`).click();
    await expect(page.locator('dialog[data-receipt-dialog] .figure')).toHaveText('−$29,249,339');
  });

  test('"Request your city" opens a prefilled GitHub request', async ({ page, context }) => {
    // Answer GitHub locally: the test checks the URL the form builds, not GitHub.
    await context.route('https://github.com/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
    await page.goto('/');
    await page.getByRole('link', { name: 'Request your city' }).click();
    await page.getByPlaceholder('City').fill('Oakland');
    await page.getByPlaceholder('State').fill('CA');
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Request it' }).click()]);
    const url = new URL(popup.url());
    expect(url.origin + url.pathname).toBe('https://github.com/PlayFrameStudios/wtmw/issues/new');
    expect(Object.fromEntries(url.searchParams)).toEqual({ template: 'request-a-city.yml', title: 'City request', city: 'Oakland', state: 'CA' });
  });
});

// On desktop the receipt card floats over the waffle's bottom-right corner, as mocked (L1); the
// legend must stay readable. Stacked layouts (below 1024px) may cover nothing at all.
for (const [width, targets] of [
  [390, '.mini-waffle .grid span, .mini-waffle .legend li'],
  [768, '.mini-waffle .grid span, .mini-waffle .legend li'],
  [1024, '.mini-waffle .legend li'],
  [1280, '.mini-waffle .legend li'],
  [1440, '.mini-waffle .legend li'],
] as const) {
  test(`at ${width}px the floating receipt covers no ${width < 1024 ? 'waffle square or ' : ''}legend entry`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const covered = await page.evaluate((sel) => {
      const card = document.querySelector('.sample:not([hidden]) .receipt-card')!.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>(sel)]
        .filter((el) => el.checkVisibility())
        .filter((el) => {
          // A legend row stretches the card's width; what must stay visible is its swatch and text.
          const range = document.createRange();
          range.selectNodeContents(el);
          const r = range.getBoundingClientRect();
          return r.left < card.right && card.left < r.right && r.top < card.bottom && card.top < r.bottom;
        })
        .map((el) => el.textContent?.trim() || el.dataset.dept);
    }, targets);
    expect(covered).toEqual([]);
  });
}

// #28, re-scoped: the static chart card opens the city overview; the receipt card on top of it still opens its own receipt.
test('at 390px a tap on the homepage chart opens the Berkeley overview', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator(`${card} .receipt-card [data-source-chip="S1"]`).tap();
  await expect(page.locator('dialog[data-receipt-dialog]')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/');
  // Tap where the chart is drawn: the card's stretched link covers it, so that tap must follow the link.
  // The city tabs (#49) push the chart below the first screen: bring it into view, as a reader would.
  await page.locator(`${card} .city-card .grid`).scrollIntoViewIfNeeded();
  const grid = (await page.locator(`${card} .city-card .grid`).boundingBox())!;
  await page.touchscreen.tap(grid.x + grid.width / 2, grid.y + grid.height / 3);
  await expect(page).toHaveURL(/\/us\/ca\/berkeley\/$/);
  await ctx.close();
});

test('the chart card is one Tab stop, named for the chart', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Where every $100 goes' });
  await expect(link).toHaveAttribute('href', '/us/ca/berkeley/');
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/us\/ca\/berkeley\/$/);
});

// #49: every covered city gets equal billing, alphabetical, straight from the registry.
test.describe('every city on the hero', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('one Explore button and one tab per listed city, in registry order', async ({ page }) => {
    await page.goto('/');
    expect(listed.length).toBeGreaterThan(1);
    const buttons = page.locator('.hero [data-explore]');
    await expect(buttons).toHaveText(listed.map((c) => `Explore ${c.name} →`));
    expect(await buttons.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(listed.map((c) => c.path));
    await expect(page.getByRole('tab')).toHaveText(listed.map((c) => c.name));
    await expect(page.locator('.ctas a').last()).toHaveText('Request your city');
    // Same style and size.
    const boxes = await buttons.evaluateAll((as) => as.map((a) => ({ h: a.getBoundingClientRect().height, bg: getComputedStyle(a).backgroundColor })));
    for (const b of boxes) expect(b).toEqual({ h: boxes[0].h, bg: boxes[0].bg });
  });

  test('the tabs swap the sample card and the URL line, with arrow keys, Home and End', async ({ page }) => {
    await page.goto('/');
    const tabs = page.getByRole('tab');
    const path = page.locator('[data-sample-path]:not([hidden])');
    const showing = async (i: number) => {
      const c = listed[i];
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tabpanel')).toHaveCount(1);
      await expect(page.getByRole('tabpanel').locator('.eyebrow').first()).toContainText(c.name);
      await expect(page.getByRole('tabpanel').getByRole('link', { name: 'Where every $100 goes' })).toHaveAttribute('href', c.path);
      await expect(path).toHaveText(`wherethemoneywent.com / ${c.path.split('/').filter(Boolean).join(' / ')}`);
      for (let j = 0; j < listed.length; j++) await expect(tabs.nth(j)).toHaveAttribute('tabindex', j === i ? '0' : '-1');
    };
    await showing(0);
    await tabs.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await showing(1);
    await expect(tabs.nth(1)).toBeFocused();
    await page.keyboard.press('Home');
    await showing(0);
    await page.keyboard.press('ArrowLeft');
    await showing(listed.length - 1);
    await page.keyboard.press('End');
    await showing(listed.length - 1);
    await tabs.nth(0).click();
    await showing(0);
  });

  test("Fremont's receipt is its Contingency Reserve, in neutral ink, opening the PDF at p.66", async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Fremont' }).click();
    const panel = page.getByRole('tabpanel');
    const figure = panel.locator('.receipt-figure');
    await expect(figure).toHaveText('$48,278,000');
    await expect(panel.locator('.receipt-label')).toHaveText('FY 2026/27 Contingency Reserve');
    await expect(panel.locator('.receipt-doc')).toHaveText('FY 2026/27 Adopted Operating Budget');
    await expect(panel.locator('.receipt-meta')).toContainText('City of Fremont');
    const [ink, red, color] = await figure.evaluate((el) => {
      const s = getComputedStyle(document.documentElement);
      const probe = (v: string) => {
        const d = document.body.appendChild(document.createElement('span'));
        d.style.color = `var(${v})`;
        const c = getComputedStyle(d).color;
        d.remove();
        return c;
      };
      void s;
      return [probe('--ink'), probe('--red'), getComputedStyle(el).color];
    });
    expect(color).toBe(ink);
    expect(color).not.toBe(red);
    await expect(panel.getByRole('link', { name: /Open the PDF/ })).toHaveAttribute('href', /showpublisheddocument\/21162#page=72$/);
    await panel.locator('[data-source-chip]').click();
    const d = page.locator('dialog[data-receipt-dialog]');
    await expect(d.locator('.figure')).toHaveText('$48,278,000');
    // Fremont's own document, not the page's first city's S1 (a bug the first build of #49 had).
    await expect(d).toContainText('FY 2026/27 Adopted Operating Budget');
    await expect(d).toContainText('fremont.gov');
    await expect(d).toContainText('p. 66');
    await expect(d).not.toContainText('Budget Balancing Plan');
    await page.keyboard.press('Escape');
    // And back on Berkeley, Berkeley's.
    await page.getByRole('tab', { name: 'Berkeley' }).click();
    await page.getByRole('tabpanel').locator('[data-source-chip]').click();
    await expect(d).toContainText('Budget Balancing Plan');
    await expect(d).not.toContainText('fremont.gov');
  });

  test("Berkeley's receipt is still its gap, in red", async ({ page }) => {
    await page.goto('/');
    const figure = page.getByRole('tabpanel').locator('.receipt-figure');
    await expect(figure).toHaveText('−$29,249,339');
    expect(await figure.evaluate((el) => el.classList.contains('receipt-figure--short'))).toBe(true);
  });

  test('no axe violations with each tab selected', async ({ page }) => {
    await page.goto('/');
    for (const c of listed) {
      await page.getByRole('tab', { name: c.name }).click();
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(violations.map((v) => `${c.name}: ${v.id}`)).toEqual([]);
    }
  });
});

test.describe('every city on the hero at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the buttons wrap and nothing scrolls sideways, on every tab', async ({ page }) => {
    await page.goto('/');
    const buttons = page.locator('.hero [data-explore]');
    for (const b of await buttons.all()) {
      const box = (await b.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    for (const c of listed) {
      await page.getByRole('tab', { name: c.name }).tap();
      // innerWidth widens to fit overflow under mobile emulation; clientWidth doesn't.
      const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(m.scroll, c.name).toBeLessThanOrEqual(m.client);
    }
  });
});

test.describe('the hero without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });

  test('shows the first city card alone, no tabs, and every Explore button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[role="tablist"]')).toBeHidden();
    await expect(page.locator('.sample').filter({ visible: true })).toHaveCount(1);
    await expect(page.locator('.sample').filter({ visible: true }).locator('.eyebrow').first()).toContainText(listed[0].name);
    await expect(page.locator('.hero [data-explore]')).toHaveCount(listed.length);
  });
});
