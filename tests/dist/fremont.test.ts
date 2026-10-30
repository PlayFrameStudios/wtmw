/**
 * Fremont's built pages (#43, #44): a city built from City documents alone, published since #44.
 * Every figure's receipt names a page of a document the build checked it against, and a figure
 * read from a table row names its column.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CityBudget } from '../../src/data/types';

const root = join(import.meta.dirname, '../..');
const dist = join(root, 'dist');
const b: CityBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/fremont/budget.json'), 'utf8'));
const excerpt = (id: string) => JSON.parse(readFileSync(join(root, `data/cities/us/ca/fremont/source/excerpts/${id}.json`), 'utf8')) as Record<string, string>;
const PAGES = ['', 'revenue/', 'reserves/', 'departments/', 'capital/', 'sources/', 'glossary/'];
const html = (p: string) => readFileSync(join(dist, 'us/ca/fremont', p, 'index.html'), 'utf8');
const text = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
type Receipt = { kind: string; value?: string; sources: string[]; page?: number; quote?: string; column?: string; label?: string };
const receipts = (h: string) => [...h.matchAll(/data-receipt="([^"]*)"/g)].map((m) => JSON.parse(decode(m[1])) as Receipt);
const figure = (p: string, label: RegExp) => {
  const found = receipts(html(p)).filter((r) => r.kind === 'figure' && label.test(r.label ?? ''));
  expect(found.length, `${p}: a figure labelled ${label}`).toBeGreaterThan(0);
  return found[0];
};

describe('Fremont (built)', () => {
  it('builds every page a reserves city gets, and no Gap or Ballot page', () => {
    for (const p of PAGES) expect(existsSync(join(dist, 'us/ca/fremont', p, 'index.html')), p).toBe(true);
    for (const p of ['gap/', 'ballot/']) expect(existsSync(join(dist, 'us/ca/fremont', p, 'index.html')), p).toBe(false);
  });

  it('is published (#44): indexable, on the landing page and in the city switcher', () => {
    for (const p of PAGES) expect(html(p), p).not.toMatch(/name="robots"/);
    // Liveness: a fixture city's page is still noindexed, so the check above can fail.
    expect(readFileSync(join(dist, 'test/cities/fixtureville/index.html'), 'utf8')).toMatch(/<meta name="robots" content="noindex"/);
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toContain('href="/us/ca/fremont/"');
    expect(readFileSync(join(dist, 'us/ca/berkeley/index.html'), 'utf8')).toMatch(/<a href="\/us\/ca\/fremont\/"[^>]*>Fremont, CA<\/a>/);
  });

  it('offers its data and no workbook', () => {
    const files = readdirSync(join(dist, 'us/ca/fremont/data')).sort();
    expect(files).toEqual(['budget.json', 'capital-plan.csv', 'general-fund-fy2027.csv', 'positions.csv', 'revenue.csv', 'source-usage.json', 'sources.csv']);
    expect(html('sources/')).not.toMatch(/workbook/i);
  });

  // (The city switcher lists Berkeley, so the city's name alone is not a leak.)
  it("carries none of Berkeley's deficit-plan copy", () => {
    for (const p of PAGES) {
      const t = text(html(p));
      for (const phrase of ['sales tax vote', 'Measure ', 'before cuts', 'asked to cut', 'gap the city must close', 'workbook']) expect(t, `${p}: "${phrase}"`).not.toContain(phrase);
    }
  });

  it('every figure cites a page of a Fremont document, and that page holds its quote', () => {
    const pages = { S1: excerpt('S1'), S2: excerpt('S2'), S3: excerpt('S3') } as Record<string, Record<string, string>>;
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
    let n = 0;
    for (const p of PAGES) {
      for (const r of receipts(html(p))) {
        expect(b.sources.map((s) => s.id), r.label).toContain(r.sources[0]);
        if (r.page === undefined) continue;
        n++;
        expect(norm(pages[r.sources[0]][String(r.page)] ?? ''), `${p} ${r.label}`).toContain(norm(r.quote!));
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it('receipts know each document’s page offset and archive copy', () => {
    const data = JSON.parse(decode(html('').match(/<script type="application\/json" id="receipt-data">([\s\S]*?)<\/script>/)![1]));
    expect(data.sources.S1.pageOffset).toBe(6);
    expect(data.sources.S1.format).toBe('PDF');
    expect(data.sources.S2.archive.url).toMatch(/^https:\/\/web\.archive\.org\/web\/\d{14}\/https:\/\/www\.fremont\.gov\//);
    expect(data.sources.S1.archive).toBeUndefined();
  });

  it('the sources list names printed pages', () => {
    const t = text(html('sources/'));
    expect(t).toMatch(/pp\. 27, 32, 34, 39, 65, 66, 67, 68, 71, 73, 85, 87, 89, 114, 120,/);
    expect(t).not.toMatch(/pp\. 33, 38/);
  });

  it('a figure read from a table row names its column; a figure from a sentence does not', () => {
    const police = figure('departments/', /^Police, /);
    expect(police.quote).toBe('Police 124,396 124,714 116,012 129,087');
    expect(police.column).toBe('2026/27 Adopted');
    const actual = receipts(html('revenue/')).find((r) => r.kind === 'figure' && r.column === '2024/25 Actual');
    expect(actual?.page, 'a FY 2024/25 actual, cited to the history page').toBe(95);
    expect(figure('', /^Ongoing maintenance support/).column).toBeUndefined();
  });

  it('overview: the City’s own 87%, attributed to it; what is tight; the capital plan in figures', () => {
    const t = text(html(''));
    expect(t).toContain('The City describes its budget as allocating 87% of the budget to direct costs for public safety and maintenance');
    expect(figure('', /^Share of the budget for direct costs/).page).toBe(77);
    expect(t).toMatch(/not to restore \$3\.2M of ongoing maintenance support or \$3\.1M of ongoing personnel/);
    // The $19.9M sits right under the reserve list, next to the $4.3M it left.
    expect(t).toMatch(/Budget Uncertainty Reserve \$4\.3M In FY 2024\/25 the City used \$19\.9M of its Budget Uncertainty Reserve to cover a one-time revenue shortfall\. This budget adds nothing to it/);
    expect(t).toMatch(/It sets out \$235\.5M over five years, \$32\.3M of it in FY 2026\/27\. The General Fund puts in \$3\.8M a year/);
    expect(figure('', /five-year total$/).column).toBe('Five Year Total');
    expect(figure('', /Capital Improvement Program.*, FY 2026\/27$/).column).toBe('FY 2026/2027');
  });

  it('the $19.9M is cited to the mid-year report, in its words', () => {
    const draw = figure('reserves/', /^Budget Uncertainty Reserve used in FY 2024\/25/);
    expect(draw.sources[0]).toBe('S2');
    expect(draw.page).toBe(5);
    expect(draw.quote).toContain('$19.9 million of the Budget Uncertainty Reserve applied to address the one-time revenue shortfall');
    expect(text(html('reserves/'))).not.toMatch(/drew|when the State recovered/);
  });

  it('Balance & Reserves: sources and uses, what is left, what the budget assumes, and the forecast', () => {
    const h = html('reserves/');
    const t = text(h);
    for (const heading of ['Money in and money out, FY 2026/27', 'The Budget Uncertainty Reserve', 'What the budget assumes', 'What the City’s forecast shows'])
      expect(t).toContain(heading.replace('’', "'"));
    const value = (label: RegExp) => figure('reserves/', label).value;
    expect(value(/^General Fund total sources/)).toBe('$292,715,000');
    expect(value(/^General Fund total uses/)).toBe('$289,089,000');
    expect(value(/^Added to the Contingency Reserve/)).toBe('$1,884,000');
    expect(value(/^Unreserved fund balance at the end of FY 2026\/27/)).toBe('$1,742,000');
    expect(value(/^Unreserved fund balance, FY 2027\/28, City forecast/)).toBe('$6,071,000');
    expect(value(/^Unreserved fund balance, FY 2028\/29, City forecast/)).toBe('$12,450,000');
    // The uses bar closes with what is left, so it is as long as the sources bar: two bars of one length.
    const widths = (aria: string) => [...h.split(`aria-label="${aria}`)[1].split('</div>')[0].matchAll(/width:([\d.]+)%/g)].reduce((a, m) => a + Number(m[1]), 0);
    expect(widths('Sources')).toBeCloseTo(100, 1);
    expect(widths('Uses')).toBeCloseTo(100, 1);
    // No red, no gold: neither money short nor one-time money.
    const sheet = h.slice(h.indexOf('id="bs-flow"'), h.indexOf('</main>'));
    expect(sheet.length).toBeGreaterThan(1000);
    expect(sheet).not.toMatch(/--red|--gold/);
    expect(t).toContain('assumes the placeholder salary adjustment again in each forecast year');
  });

  it('per $100: a department too small for a square is less than $1, not $0', () => {
    const h = html('');
    // City Council has no square, so it shows in its tooltip panel and the legend.
    expect(text(h)).toMatch(/City Council less than \$1 of every \$100/);
    expect(text(h)).toMatch(/Oversight & elected less than \$1/);
    expect(text(h)).not.toMatch(/\$0 of every \$100|elected \$0/);
  });

  it('the glossary defines the three terms the pages rely on, in the City’s words', () => {
    const h = html('glossary/');
    const g = text(h);
    for (const term of ['Budget Uncertainty Reserve', 'Contingency Reserve', 'Citywide Savings']) expect(h).toMatch(new RegExp(`<dt[^>]*>${term}</dt>`));
    expect(g).toContain('The General Fund Contingency Reserve is intended to mitigate the effects of unanticipated situations');
    expect(g).toContain('historical experience of under-spending total allocated resources, primarily due to salary savings from vacant positions');
    expect(g).not.toMatch(/6\.[67]%/);
  });
});
