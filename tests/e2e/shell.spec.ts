import { expect, test, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CITY_PAGES } from '../../src/lib/city-pages';

// The registry, read from disk: Playwright doesn't run through Vite, so no import.meta.glob.
const dataDir = join(import.meta.dirname, '../../data/cities');
const cities = readdirSync(dataDir).flatMap((country) =>
  readdirSync(join(dataDir, country)).flatMap((state) =>
    readdirSync(join(dataDir, country, state)).map((city) => ({ path: `/${country}/${state}/${city}/` })),
  ),
);

const ROUTES = ['/', ...cities.flatMap((c) => [c.path, ...CITY_PAGES.map((p) => `${c.path}${p.slug}/`)]), '/us/ca/nowhere/'];
const berkeley = cities[0];

/**
 * Elements whose right edge passes the layout viewport, plus the document's own overflow.
 * Uses documentElement.clientWidth: window.innerWidth widens to fit overflowing content
 * under some emulation, which would hide the very thing we're measuring.
 */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        // A closed <details> keeps its content laid out but unrendered; only count what can be seen.
        if (!(r.width > 0 && r.height > 0 && r.right > vw + 0.5 && el.checkVisibility({ visibilityProperty: true }))) return false;
        // Content scrolling inside its own box (a wide table in .table-scroll) is fine, as long as the box fits.
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== 'visible') return a.getBoundingClientRect().right > vw + 0.5;
        }
        return true;
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} right=${Math.round(el.getBoundingClientRect().right)}`);
    return { vw, scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 5) };
  });
}

/** Pairs of the matched elements whose boxes intersect (each element's own text box, not its parent row). */
async function overlaps(page: Page, scope: string, selectors: string) {
  return page.locator(scope).evaluate((root, sel) => {
    const boxes = [...root.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => el.checkVisibility())
      .map((el) => {
        // Measure the rendered text, not the element: a no-wrap span can spill past its own box.
        const range = document.createRange();
        range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        return { name: el.textContent!.trim().slice(0, 40), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
    const hits: string[] = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) hits.push(`"${a.name}" overlaps "${b.name}"`);
      }
    return { count: boxes.length, hits };
  }, selectors);
}

// Disclosures (a waffle's "Show as a table", a methods note) can hold wide content: opening one must
// widen its own box, never the page. iOS zooms the whole page out when it does (#22).
for (const width of [320, 375]) {
  test.describe(`at ${width}px, every <details> open`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const route of ROUTES) {
      test(`${route} has no horizontal scroll`, async ({ page }) => {
        await page.goto(route);
        await page.evaluate(() => document.fonts.ready);
        // Open nested ones too; the site menu has its own test above and covers the page by design.
        const opened = await page.evaluate(() => {
          let n = 0;
          for (let more = true; more; ) {
            more = false;
            for (const d of document.querySelectorAll<HTMLDetailsElement>('details:not([open])')) {
              if (d.querySelector(':scope > summary[aria-label="Menu"]')) continue;
              d.open = true;
              n++;
              more = true;
            }
          }
          return n;
        });
        const o = await overflow(page);
        expect(o.vw).toBe(width);
        expect(o.scrollWidth, `${opened} opened\n${o.offenders.join('\n')}`).toBeLessThanOrEqual(o.vw);
        expect(o.offenders).toEqual([]);
      });
    }
  });
}

test.describe('at 320px', () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test("the overview's waffle table scrolls inside its own box", async ({ page }) => {
    await page.goto(berkeley.path);
    await page.getByText('Show as a table').click();
    const box = page.locator('.hero .table-scroll');
    await expect(box).toBeVisible();
    const m = await box.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, overflowX: getComputedStyle(el).overflowX }));
    expect(m.overflowX).toBe('auto');
    expect(m.scroll).toBeGreaterThan(m.client);
    await box.evaluate((el) => (el.scrollLeft = 1000));
    expect(await box.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  });
});

for (const width of [390, 768, 1024, 1199]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const route of ROUTES) {
      test(`${route} has no horizontal scroll, menu closed or open`, async ({ page }) => {
        await page.goto(route);
        await page.evaluate(() => document.fonts.ready);
        let o = await overflow(page);
        expect(o.vw).toBe(width);
        expect(o.scrollWidth, o.offenders.join('\n')).toBeLessThanOrEqual(o.vw);
        expect(o.offenders).toEqual([]);

        await page.locator('summary[aria-label="Menu"]').click();
        await expect(page.locator('.menu-panel')).toBeVisible();
        o = await overflow(page);
        expect(o.scrollWidth, o.offenders.join('\n')).toBeLessThanOrEqual(o.vw);
        expect(o.offenders).toEqual([]);
      });
    }

    test('top strip and compact header: nothing overlaps', async ({ page }) => {
      await page.goto(berkeley.path);
      await page.evaluate(() => document.fonts.ready);
      const strip = await overlaps(page, '.strip', '[data-independence], .report');
      expect(strip.count).toBe(2);
      expect(strip.hits).toEqual([]);
      const header = await overlaps(page, '.compact', '.wordmark, .city-name, summary[aria-label="Menu"]');
      expect(header.count).toBe(3);
      expect(header.hits).toEqual([]);
    });

    test('the compact header shows WTMW, the city and a working menu', async ({ page }) => {
      await page.goto(berkeley.path);
      await expect(page.locator('.compact .wordmark')).toHaveText('WTMW');
      await expect(page.locator('.compact .city-name')).toHaveText('Berkeley, CA');
      await expect(page.locator('nav.desktop')).toBeHidden();
      const menu = page.locator('.menu-panel');
      await expect(menu).toBeHidden();
      await page.locator('summary[aria-label="Menu"]').click();
      await expect(menu.getByRole('link', { name: 'Departments' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
    });

    test('the independence line stays visible on a phone', async ({ page }) => {
      await page.goto(berkeley.path);
      await expect(page.getByText('Independent. Not affiliated with the City of Berkeley.')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Report an error' })).toBeVisible();
    });
  });
}

for (const width of [1200, 1280, 1440, 1920]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const route of [berkeley.path, `${berkeley.path}departments/`, '/']) {
      test(`${route}: nav items don't overlap and stay on screen`, async ({ page }) => {
        await page.goto(route);
        await page.evaluate(() => document.fonts.ready);
        // A hidden nav has no boxes to overlap, so make sure this width really shows it.
        await expect(page.locator('nav.desktop')).toBeVisible();
        await expect(page.locator('.compact')).toBeHidden();
        const boxes = await page.locator('nav.desktop').evaluate((nav) =>
          [...nav.querySelectorAll<HTMLElement>('.brand, .switcher > summary, .links a, .sources-pill, .cta')].map((el) => {
            const r = el.getBoundingClientRect();
            return { name: el.textContent!.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          }),
        );
        expect(boxes.length).toBeGreaterThan(1);
        for (const b of boxes) {
          expect(b.left, b.name).toBeGreaterThanOrEqual(0);
          expect(b.right, b.name).toBeLessThanOrEqual(width);
        }
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const b = boxes[j];
            const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
            expect(overlap, `"${a.name}" overlaps "${b.name}"`).toBe(false);
          }
        }
        expect((await overflow(page)).scrollWidth).toBeLessThanOrEqual(width);
      });
    }
  });
}

test.describe('desktop shell', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('marks the current page with the bay underline', async ({ page }) => {
    await page.goto(`${berkeley.path}departments/`);
    const active = page.locator('nav.desktop a[aria-current="page"]');
    await expect(active).toHaveText('Departments');
    await expect(active).toHaveCSS('border-bottom-color', 'rgb(14, 107, 111)');
  });

  test('shows the breadcrumb, the source count from the data, and the city switcher', async ({ page }) => {
    await page.goto(`${berkeley.path}gap/`);
    await expect(page.locator('.crumbs')).toHaveText(/wherethemoneywent\.com \/ us \/ ca \/ berkeley \/ gap/);
    await expect(page.locator('nav.desktop .sources-pill')).toHaveText('27 sources');
    await expect(page.locator('nav.desktop .sources-pill')).toHaveAttribute('href', `${berkeley.path}sources/`);
    await page.locator('.switcher summary').click();
    await expect(page.locator('.switcher .panel').getByRole('link', { name: 'Berkeley, CA' })).toBeVisible();
  });

  test('"Report an error" opens a prefilled GitHub issue with the page URL', async ({ page }) => {
    await page.goto(`${berkeley.path}gap/`);
    const href = await page.locator('.strip .report').getAttribute('href');
    const url = new URL(href!);
    expect(url.origin + url.pathname).toBe('https://github.com/PlayFrameStudios/wtmw/issues/new');
    expect(url.searchParams.get('template')).toBe('report-an-error.yml');
    expect(url.searchParams.get('page')).toBe('https://wherethemoneywent.com/us/ca/berkeley/gap/');
  });

  test('the footer has the promise, the not-affiliated line and its four links', async ({ page }) => {
    await page.goto(berkeley.path);
    const footer = page.locator('footer.site-footer');
    await expect(footer).toContainText('Every number on this site links to the public document it came from.');
    await expect(footer).toContainText('Not affiliated with, or endorsed by, any city government.');
    for (const name of ['Sources & methods', 'Glossary', 'Download the data', 'GitHub']) {
      await expect(footer.getByRole('link', { name })).toBeVisible();
    }
  });

  test('the footer names the copyright holder, with the build year, linking to its site', async ({ page }) => {
    await page.goto(berkeley.path);
    const legal = page.locator('footer.site-footer .legal');
    await expect(legal.locator('p').first()).toHaveText(`© ${new Date().getFullYear()} PlayFrame Studios`);
    await expect(legal.getByRole('link', { name: 'PlayFrame Studios' })).toHaveAttribute('href', 'https://playframestudios.com/');
  });

  test('the footer says Made with Foundry, linking to foundryworks.dev, and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(berkeley.path);
    const legal = page.locator('footer.site-footer .legal');
    await expect(legal).toContainText('Made with Foundry');
    await expect(legal.getByRole('link', { name: 'Foundry' })).toHaveAttribute('href', 'https://foundryworks.dev');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });

  test('loads the chosen fonts, and numbers are tabular', async ({ page }) => {
    await page.goto(berkeley.path);
    const result = await page.evaluate(async () => {
      await document.fonts.ready;
      const width = (text: string) => {
        const s = document.createElement('span');
        s.className = 'num';
        s.textContent = text;
        document.body.append(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return w;
      };
      return {
        serif: document.fonts.check('700 16px Gelasio'),
        sans: document.fonts.check('16px "Nunito Sans Variable"'),
        ones: width('111111'),
        eights: width('888888'),
      };
    });
    expect(result.serif).toBe(true);
    expect(result.sans).toBe(true);
    expect(result.ones).toBeCloseTo(result.eights, 1);
  });
});
