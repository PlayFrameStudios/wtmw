import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allCities, cities } from '../../src/lib/cities';

// Per-city page sets (#42), as built. The fixture city is reserves, ballot off, annual, and
// borrows Berkeley's budget data; Berkeley is The Gap, ballot on, biennial.
const dist = join(import.meta.dirname, '../../dist');
const html = (path: string) => readFileSync(join(dist, path, 'index.html'), 'utf8');
const fixture = allCities.find((c) => c.fixture)!;
const berkeley = cities.find((c) => c.path === '/us/ca/berkeley/')!;
const berkeleyOverview = () => html(berkeley.path);
const fixturePages = () =>
  readdirSync(join(dist, fixture.path), { withFileTypes: true, recursive: true })
    .filter((e) => e.name === 'index.html')
    .map((e) => `/${join(e.parentPath, e.name).slice(dist.length + 1).replace(/index\.html$/, '')}`)
    .sort();
const navLinks = (page: string) =>
  [...page.match(/<nav class="wrap desktop"[\s\S]*?<\/nav>/)![0].matchAll(/<ul class="links"[\s\S]*?<\/ul>/g)]
    .flatMap((m) => [...m[0].matchAll(/<a href="([^"]+)"[^>]*>\s*([^<]+?)\s*</g)])
    .map((m) => ({ href: m[1], label: m[2].replace(/&amp;/g, '&') }));

describe('a city in balance, with no ballot, budgeting each year (the fixture)', () => {
  it('builds every page but The Gap and Ballot, and Balance & Reserves in their place', () => {
    const p = fixture.path;
    expect(fixturePages()).toEqual([p, `${p}capital/`, `${p}departments/`, `${p}glossary/`, `${p}reserves/`, `${p}revenue/`, `${p}sources/`].sort());
    expect(existsSync(join(dist, p, 'gap'))).toBe(false);
    expect(existsSync(join(dist, p, 'ballot'))).toBe(false);
  });

  it('has the 6-link nav, with Balance & Reserves in The Gap’s slot', () => {
    expect(navLinks(html(fixture.path)).map((l) => l.label)).toEqual(['Overview', 'Revenue', 'Balance & Reserves', 'Departments', 'Capital', 'Sources']);
  });

  it('links to no Gap or Ballot page from any of its pages', () => {
    const pages = fixturePages();
    expect(pages.length).toBe(7);
    for (const p of pages) expect(html(p), p).not.toMatch(/href="[^"]*\/(gap|ballot)\/[^"]*"/);
  });

  it('has no gap headline, ballot card or gap description on its overview, and points to Balance & Reserves instead', () => {
    const page = html(fixture.path);
    // Liveness: the same markers are on Berkeley's overview, so their absence here means something.
    const gapMarkers = ['Jump to the', 'gap the city must close', 'The sales-tax vote', "why there's a gap"];
    const berkeleyPage = html(berkeley.path);
    for (const m of gapMarkers) expect(berkeleyPage).toContain(m);
    for (const m of gapMarkers) expect(page).not.toContain(m);
    expect(page).toMatch(/<a class="btn btn--ghost" href="\/test\/cities\/fixtureville\/reserves\/"[^>]*>See balance &amp; reserves<\/a>/);
    expect(page).toContain(`<meta name="description" content="Where every $100 of Fixtureville's budget goes, and what it keeps in reserve.`);
    expect(page).toContain('href="/test/cities/fixtureville/capital/"');
  });

  it("labels its years in its own style, on the overview and on Balance & Reserves", () => {
    // Receipts quote the borrowed documents as written ("FY27"); the page's own labels follow the city.
    expect(html(fixture.path)).toContain('>department baseline, FY26/27<');
    expect(berkeleyOverview()).toContain('>department baseline, FY27<');
    expect(html(fixture.path)).not.toContain('>department baseline, FY27<');
    expect(html(fixture.path)).toContain(`aria-label="Fixtureville's FY 2026/27 department baseline:`);
    const reserves = html(`${fixture.path}reserves/`);
    expect(reserves).toContain('Reserves, FY 2026/27');
    expect(reserves).toContain('adopts a budget each year. This page covers FY 2026/27.');
  });

  it('shows its cited reason and a reserves module, each amount its own receipt', () => {
    const reserves = html(`${fixture.path}reserves/`);
    expect(reserves).toContain(fixture.fiscalPosition.reason.text);
    const receipts = [...reserves.matchAll(/data-receipt="([^"]+)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')));
    const [cite] = fixture.fiscalPosition.reason.cites;
    expect(receipts.some((r) => r.source === cite.source && r.page === cite.page && r.quote === cite.quote)).toBe(true);
    const amount = reserves.match(/<li class="reserve" data-reserve="operating"[\s\S]*?<\/li>/)![0];
    expect(amount).toContain('class="sourced');
    expect(amount).toContain('aria-label="$4.2M, source: ');
  });

  it('is kept out of search, and out of every list of cities', () => {
    for (const p of fixturePages()) expect(html(p), p).toContain('<meta name="robots" content="noindex">');
    for (const p of ['/', berkeley.path, `${berkeley.path}gap/`]) expect(html(p), p).not.toContain(fixture.path);
  });

  it("leaves Berkeley's receipts alone: no fixture page and no landing page in the fixture's usage", () => {
    const usage = (p: string) => JSON.parse(readFileSync(join(dist, p, 'data/source-usage.json'), 'utf8')) as Record<string, { path: string }[]>;
    const paths = (p: string) => Object.values(usage(p)).flat().map((u) => u.path);
    expect(paths(berkeley.path).some((x) => x.startsWith(fixture.path))).toBe(false);
    expect(paths(berkeley.path)).toContain('/');
    expect(paths(fixture.path).every((x) => x.startsWith(fixture.path))).toBe(true);
  });
});

describe('Berkeley: The Gap, ballot on, a two-year budget', () => {
  it("keeps today's 7-link nav", () => {
    expect(navLinks(html(berkeley.path)).map((l) => l.label)).toEqual(['Overview', 'Revenue', 'The Gap', 'Departments', 'Ballot', 'Capital', 'Sources']);
  });

  it('has no Balance & Reserves page', () => {
    expect(existsSync(join(dist, berkeley.path, 'gap'))).toBe(true);
    expect(existsSync(join(dist, berkeley.path, 'reserves'))).toBe(false);
  });
});

describe('the landing page', () => {
  it('lists every covered city, with its budget in its own year style', () => {
    const list = html('/').match(/<ul class="covered"[\s\S]*?<\/ul>/)![0];
    const items = [...list.matchAll(/<a href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>\s*<span class="covered-budget"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2], m[3]]);
    expect(items).toEqual(cities.map((c) => [c.path, `${c.name}, ${c.stateCode}`, expect.any(String)]));
    expect(items.find((i) => i[0] === berkeley.path)![2]).toBe('Two-year budget, FY2027 and FY2028');
  });
});
