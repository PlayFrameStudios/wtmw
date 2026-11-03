/**
 * Lafayette's built pages (#59): a limited service city. Its police are a Sheriff contract, Fire and Library aren't in
 * its budget, it draws on its reserve on purpose, and two of its tables were printed as images, whose receipts say so.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CityBudget } from '../../src/data/types';

const root = join(import.meta.dirname, '../..');
const dist = join(root, 'dist');
const b: CityBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/lafayette/budget.json'), 'utf8'));
const PAGES = ['', 'revenue/', 'reserves/', 'departments/', 'capital/', 'sources/', 'glossary/'];
const html = (p: string) => readFileSync(join(dist, 'us/ca/lafayette', p, 'index.html'), 'utf8');
const text = (h: string) =>
  h
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
type Receipt = { kind: string; value?: string; page?: number; quote?: string; label?: string; scanned?: { image: string } };
const receipts = (h: string) => [...h.matchAll(/data-receipt="([^"]*)"/g)].map((m) => JSON.parse(decode(m[1])) as Receipt);
/** An element's text, tags stripped: a needle split by markup still matches. */
const block = (h: string, attr: string) => {
  const m = h.match(new RegExp(`<(\\w+)[^>]*${attr}[^>]*>[\\s\\S]*?</\\1>`));
  expect(m, attr).not.toBeNull();
  return text(m![0]).trim();
};

describe('Lafayette (built)', () => {
  it('builds every page a reserves city gets, and no Gap or Ballot page', () => {
    for (const p of PAGES) expect(existsSync(join(dist, 'us/ca/lafayette', p, 'index.html')), p).toBe(true);
    for (const p of ['gap/', 'ballot/', 'faq/']) expect(existsSync(join(dist, 'us/ca/lafayette', p, 'index.html')), p).toBe(false);
  });

  it('is listed on the homepage, with a sample card', () => {
    const home = readFileSync(join(dist, 'index.html'), 'utf8');
    expect(home).toMatch(/<a href="\/us\/ca\/lafayette\/"[^>]*>\s*Lafayette, CA\s*<\/a>/);
    expect(home).toContain('data-sample="us-ca-lafayette"');
  });

  it('says on the overview what kind of city it is, and names the services outside its budget', () => {
    const h = html('');
    expect(block(h, 'data-city-profile')).toContain('Lafayette is a limited service city: it contracts with Contra Costa County for police, library, animal and building services');
    expect(text(h)).toMatch(/Fire: provided by Contra Costa Consolidated Fire District not in this budget/);
    expect(text(h)).toMatch(/Library: provided by Contra Costa County, under contract not in this budget/);
  });

  it('shows the General Fund only, with no all-funds figure', () => {
    const t = text(html(''));
    expect(t).not.toMatch(/whole budget/);
    expect(t).toContain('$22.5M');
  });

  it('puts the Sheriff contract on the Police line, and Fire and Library as muted rows with no squares', () => {
    const h = html('departments/');
    expect(block(h, 'data-provided-by')).toContain('$6,454,458 of this program pays the Sheriff');
    expect(block(h, 'data-provided-by')).toContain('30.8%');
    expect(block(h, 'data-provided-by')).toContain('($336,923)');
    const fire = block(h, 'data-not-in-budget="fire"');
    expect(fire).toMatch(/^Fire Not in this budget Fire service comes from the Contra Costa Consolidated Fire District/);
    expect(fire).not.toMatch(/\$|of every/);
    // Programs, not departments; and no "citywide" table when every dollar is in a program.
    expect(text(h)).toContain('What each program gets in FY 2026-27');
    expect(text(h)).toContain('all of it in its 28 programs');
  });

  it('says plainly that the budget draws on the reserve, against its policy and forecast', () => {
    const t = block(html('reserves/'), 'data-reserve-position');
    expect(t).toContain('This budget draws $1.8M from the City\'s reserve.');
    expect(t).toContain('72% of General Fund spending, against the City\'s minimum of 60%');
    expect(t).toContain('59% by FY 2030-31, below that minimum');
    expect(text(html('reserves/'))).toContain('“intentional and strategic”');
    const drawn = receipts(html('reserves/')).find((r) => r.value === '$1,760,579');
    expect(drawn?.scanned).toEqual({ image: '/us/ca/lafayette/scans/S1-p17.png' });
  });

  it("marks every capital figure scanned, links the page image the site serves, and says so on the page", () => {
    const h = html('capital/');
    const capital = receipts(h).filter((r) => r.kind === 'figure' && r.page === 21);
    expect(capital.length).toBe(b.capitalPlan!.lines.length + 1);
    for (const r of capital) expect(r.scanned).toEqual({ image: '/us/ca/lafayette/scans/S1-p21.png' });
    expect(existsSync(join(dist, 'us/ca/lafayette/scans/S1-p21.png'))).toBe(true);
    expect(block(h, 'data-scanned-note')).toContain('The City printed this table as an image');
    // One year: no five-year wording, no year-by-year table.
    expect(text(h)).not.toMatch(/five years|Year by year/);
    expect(text(h)).toContain('By project, for FY 2026-27');
  });

  it('marks no figure scanned that a text page prints (liveness: the revenue page has none)', () => {
    const revenue = receipts(html('revenue/')).filter((r) => r.kind === 'figure');
    expect(revenue.length).toBeGreaterThan(10);
    expect(revenue.filter((r) => r.scanned)).toEqual([]);
  });

  it('leads its coverage block with what is not in the budget', () => {
    const h = html('sources/');
    expect(h.indexOf('data-not-in-budget-list')).toBeGreaterThan(-1);
    expect(h.indexOf('data-not-in-budget-list')).toBeLessThan(h.indexOf('class="qa"'));
  });
});
