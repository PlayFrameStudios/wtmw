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
type Receipt = { kind: string; value?: string; sources: string[]; page?: number; quote?: string; column?: string; label?: string; tone?: string; csv?: string; also?: { source: string; page?: number; quote?: string }[] };
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
    expect(files).toEqual([
      'budget.json',
      'capital-plan.csv',
      'department-categories.csv',
      'department-funding.csv',
      'department-service-areas.csv',
      'general-fund-fy2027.csv',
      'positions.csv',
      'revenue.csv',
      'source-usage.json',
      'sources.csv',
    ]);
    expect(html('sources/')).not.toMatch(/workbook/i);
  });

  // (The city switcher lists Berkeley, so the city's name alone is not a leak.)
  it("carries none of Berkeley's deficit-plan copy", () => {
    for (const p of PAGES) {
      const t = text(html(p));
      for (const phrase of ['sales tax vote', 'Measure ', 'before cuts', 'asked to cut', 'gap the city must close', 'workbook']) expect(t, `${p}: "${phrase}"`).not.toContain(phrase);
    }
  });

  it('every figure cites a page of a document, and that page holds its quote', () => {
    // The City's documents, and since #51 the other governments' ones the "What this budget covers" block cites.
    const pages = Object.fromEntries(b.sources.map((s) => [s.id, excerpt(s.id)])) as Record<string, Record<string, string>>;
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
    // 19, 107, 112, 176, 184 and 188 are cited by the FAQ (#54); 33, by the staffing scope (#60); 40, by retiree health (#65); 36, by the 2002 bonds (#66);
    // 129-237, by the department budgets (Part 2).
    expect(t).toMatch(/pp\. 19, 27, 28, 29, 32, 33, 34, 36, 39, 40, 65, 66, 67, 68, 71, 73, 75, 85, 87, 89, 107, 112, 114, 120, 129, 130, 133, 137, 138, 139, 142, 145, 154, 155, 158, 164, 168, 172, 173, 176, 179, 180, 184, 186, 187, 188, 198, 201, 204, 208, 212, 214, 219, 220, 223, 228, 229, 236, 237,/);
    // FUSD's budget report has four pages before its printed page 1 (#51).
    expect(t).toMatch(/Fremont Unified School District · June 24, 2026 · .* · pp\. 1, 13, 18/);
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

  it('each department subpage and the hub name their slice of every $100 of General Fund department budgets', () => {
    const sub = (slug: string) => text(readFileSync(join(dist, 'us/ca/fremont/departments', slug, 'index.html'), 'utf8'));
    const expected: Record<string, string> = {
      police: '$45.14', fire: '$27.46', 'maintenance-operations': '$13.59', 'human-services': '$1.94',
      'community-services': '$1.14', 'public-works': '$0.81', 'community-development': '$0.80',
      'economic-development': '$0.56', 'city-council': '$0.31', finance: '$2.78',
      'human-resources': '$1.99', 'city-manager': '$1.98', 'city-attorney': '$1.10', 'city-clerk': '$0.41',
    };
    for (const [slug, value] of Object.entries(expected)) {
      expect(sub(slug), slug).toContain(`${value} of every $100 of General Fund department budgets · FY 2026/27`);
    }
    // The hub shows the $23.6M office row as one line, then splits it across the five General Fund offices.
    expect(sub('administrative-departments')).toContain('$8.25 of every $100 of General Fund department budgets · FY 2026/27');
    for (const v of ['$2.78', '$1.99', '$1.98', '$1.10', '$0.41']) expect(sub('administrative-departments'), v).toContain(`${v} of every $100`);
  });

  it('Information Technology Services is the internal service fund, not a slice of every $100', () => {
    const t = text(readFileSync(join(dist, 'us/ca/fremont/departments/information-technology-services/index.html'), 'utf8'));
    expect(t).toContain("Internal service fund — charged across departments' budgets rather than a separate slice of every $100 · FY 2026/27");
    expect(t).not.toMatch(/\$0\.00 of every \$100|\$6\.12 of every \$100/);
  });

  it('the Administrative Departments hub adds the five offices to the $23.6M row: $19.8M General Fund plus $3.8M overhead', () => {
    const h = html('departments/administrative-departments');
    const t = text(h);
    expect(t).toContain('That row is their $19.8M of General Fund money plus $3.8M in overhead charged to other funds');
    // Each office shows its slice of the row (General Fund + overhead), not its all-funds total.
    expect(t).toContain('Finance $7.9M');
    expect(t).toContain('Human Resources $5.7M');
    expect(t).toContain('City Manager $5.7M');
    expect(t).toContain('City Attorney $3.2M');
    expect(t).toContain('City Clerk $1.2M');
    // City Manager's and City Attorney's money outside the row is named, so their all-funds totals still reconcile.
    expect(t).toContain('Its $6.0M all-funds total adds $311K in Homeless Services funding outside the General Fund row.');
    expect(t).toContain('Its $18.1M all-funds total includes the $14.9M Risk Management internal service fund outside the General Fund row.');
    // The table is the sum a reader can check.
    expect(t).toContain('General Fund, five offices $19.8M');
    expect(t).toContain('Overhead charged to other funds +$3.8M');
    expect(t).toContain('Administrative Departments, General Fund summary $23.6M');
    expect(t).toContain("add up to $23,605,782");
    // The receipts carry whole dollars, and the parts add to the figure (figureReceipt() would throw otherwise).
    const rows = receipts(h);
    const at = (label: string) => rows.find((r) => r.kind === 'figure' && r.label === label);
    expect(at('City Attorney, FY 2026/27: General Fund and overhead charges to other funds')?.value).toBe('$3,155,917');
    expect(at('Administrative Departments, FY 2026/27: General Fund, five offices')?.value).toBe('$19,767,060');
    expect(at('Administrative Departments, FY 2026/27: overhead charges to other funds, five offices')?.value).toBe('$3,838,722');
    // The internal service fund is its own section, not nested under "The five General Fund offices".
    expect(h).toContain('<h2 id="dd-internal-service">The internal service fund</h2>');
    const start = h.indexOf('<section class="db-section" aria-labelledby="dd-offices">');
    const end = h.indexOf('<section class="db-section" aria-labelledby="dd-internal-service">');
    expect(start, 'the five offices section').toBeGreaterThan(0);
    expect(end, 'the internal service section').toBeGreaterThan(start);
    const general = h.slice(start, end);
    expect(general).toContain('<h2 id="dd-offices">The five General Fund offices</h2>');
    expect(general).not.toContain('Information Technology Services');
    // The drawer lists every office a sum adds, not just the first: Finance (p. 223) plus the other four.
    const sum = rows.find((r) => r.kind === 'figure' && r.label === 'Administrative Departments, FY 2026/27: General Fund, five offices') as Receipt & { also?: { page?: number }[] };
    expect(sum.also?.map((c) => c.page)).toEqual([234, 214, 220, 225]);
  });
});

describe('Fremont department subpages (built)', () => {
  const SLUGS = [
    'city-council', 'community-development', 'community-services', 'economic-development', 'fire', 'human-services',
    'maintenance-operations', 'police', 'public-works', 'city-manager', 'city-attorney', 'city-clerk', 'finance',
    'human-resources', 'information-technology-services', 'administrative-departments',
  ];
  const pages = Object.fromEntries(b.sources.map((s) => [s.id, excerpt(s.id)])) as Record<string, Record<string, string>>;
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

  it('all 16 subpages build, link from /departments/, and carry no deficit-plan copy or red/gold tones', () => {
    const listing = html('departments/');
    for (const slug of SLUGS) {
      const h = html(`departments/${slug}`);
      expect(h, slug).toContain('of every $100');
      expect(listing, slug).toContain(`href="/us/ca/fremont/departments/${slug}/"`);
      expect(text(h), slug).not.toMatch(/before cuts|sales tax vote|Measure |workbook/);
      // No money-short or one-time-money tones: these pages explain operating budgets, not deficits or reserves.
      const figures = receipts(h).filter((r) => r.kind === 'figure');
      expect(figures.length, slug).toBeGreaterThan(5);
      for (const r of figures) expect(r.tone, `${slug} ${r.label}`).toBe('neutral');
    }
  });

  it('every subpage figure cites a source, and that source’s excerpt holds its quote', () => {
    let n = 0;
    for (const slug of SLUGS) {
      for (const r of receipts(html(`departments/${slug}`))) {
        expect(b.sources.map((s) => s.id), `${slug} ${r.label}`).toContain(r.sources[0]);
        if (r.page === undefined) continue;
        n++;
        expect(norm(pages[r.sources[0]][String(r.page)] ?? ''), `${slug} ${r.label}`).toContain(norm(r.quote!));
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it('no city without departmentDetails emits a department subpage', () => {
    // Liveness: Fremont's sibling exists, so a fixture/other-city directory would mean the route leaked.
    expect(existsSync(join(dist, 'us/ca/fremont/departments/police/index.html'))).toBe(true);
    for (const c of ['berkeley', 'lafayette']) expect(existsSync(join(dist, `us/ca/${c}/departments/police`))).toBe(false);
    expect(existsSync(join(dist, 'test/cities/fixtureville/departments/police'))).toBe(false);
  });

  it('each subpage’s allocation note opens that department’s own chapter', () => {
    const generic = b.departmentDetails!.allocationNote.cites[0].page;
    for (const d of b.departmentDetails!.departments) {
      const note = receipts(html(`departments/${d.id}`)).find((r) => r.kind === 'source' && /^\*+Direct expense allocations/.test(r.quote ?? ''));
      expect(note?.page, d.id).toBe(d.allocationNote.page);
      // Only City Council shares the generic cite: every other page names its own chapter, not City Council's.
      if (d.id !== 'city-council') expect(note?.page, d.id).not.toBe(generic);
      expect(norm(pages.S1[String(note!.page)] ?? '')).toContain(norm(note!.quote!));
    }
    expect(receipts(html('departments/police')).find((r) => r.kind === 'source' && /^\*+Direct expense allocations/.test(r.quote ?? ''))?.page).toBe(194);
  });

  it('the Departments list links all 10 General Fund rows and all 15 staff rows to their subpages', () => {
    const h = html('departments/');
    const section = (id: string) => {
      const start = h.indexOf(`id="${id}"`);
      expect(start, id).toBeGreaterThan(0);
      return h.slice(start, h.indexOf('</section>', start));
    };
    const depts = section('db-depts');
    for (const row of b.generalFund[0].lines.filter((l) => l.kind === 'department')) expect(depts, row.name).toContain(`href="/us/ca/fremont/departments/${row.id}/"`);
    // The staff list has its own names ("City Manager’s Office"), and every one resolves to a page.
    const details = b.departmentDetails!;
    const slugs = new Set([...details.departments.map((d) => d.id), details.adminHub!.id]);
    const staffHrefs = [...section('db-staff').matchAll(/href="\/us\/ca\/fremont\/departments\/([a-z-]+)\/"/g)].map((m) => m[1]);
    expect(staffHrefs).toHaveLength(b.staffing.byDepartment!.length);
    expect(staffHrefs.length).toBe(15);
    for (const id of staffHrefs) expect(slugs.has(id), id).toBe(true);
    expect(staffHrefs).toContain('city-manager');
  });

  it('every figure on the subpages downloads a CSV that exists, and all three department tables are used', () => {
    const dataDir = join(dist, 'us/ca/fremont/data');
    const used = new Set<string>();
    let n = 0;
    for (const slug of SLUGS) {
      for (const r of receipts(html(`departments/${slug}`))) {
        if (r.kind !== 'figure') continue;
        expect(r.csv, `${slug} ${r.label}`).toBeDefined();
        const name = r.csv!.split('/').pop()!;
        expect(existsSync(join(dataDir, name)), `${slug} ${r.label}: ${name}`).toBe(true);
        used.add(name);
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
    // The three department tables carry the funding, category and service-area rows; the hub's $23.6M
    // summary row is the General Fund table's, so its receipt opens that download.
    expect([...used].sort()).toEqual(['department-categories.csv', 'department-funding.csv', 'department-service-areas.csv', 'general-fund-fy2027.csv']);
  });
});
