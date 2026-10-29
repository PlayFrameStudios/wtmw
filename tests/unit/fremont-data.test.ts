/**
 * Fremont (#43): budget.json from City documents alone. Each check is also broken on purpose,
 * against the real excerpts, so a test that passes proves the check runs, not just that the data is good.
 */
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkQuotesIn, type Excerpts } from '../../src/data/documents';
import { buildFremont, factFrom, type FremontDocuments } from '../../src/data/fremont/build';
import { csvTables } from '../../src/data/csv';
import { buildCity, readDocuments } from '../../src/data/pipeline';
import { readTable, splitRow } from '../../src/data/tables';
import { hasGapPlan, type CityBudget } from '../../src/data/types';
import { allCities, buildRegistry, cities } from '../../src/lib/cities';
import { parseReserves } from '../../src/lib/city-settings';
import { departmentBudgets } from '../../src/lib/department-budgets';
import { familiesFor } from '../../src/lib/families';
import { folio, openAt } from '../../src/lib/open-at';
import { csvHref } from '../../src/lib/receipts';
import { reservesFor } from '../../src/lib/reserves';
import { revenueGroupsFor } from '../../src/lib/revenue-groups';
import { revenueOutlook } from '../../src/lib/revenue-outlook';

const root = join(import.meta.dirname, '../..');
const dir = join(root, 'data/cities/us/ca/fremont');
const fremont = allCities.find((c) => c.path === '/us/ca/fremont/')!;
let file: FremontDocuments;
let excerpts: Excerpts;
let budget: CityBudget;

beforeAll(async () => {
  const docs = await readDocuments(dir);
  file = docs.file as unknown as FremontDocuments;
  excerpts = docs.excerpts;
  const built = await buildCity(root, 'us/ca/fremont');
  expect(built.errors).toEqual([]);
  budget = built.budget;
});

/** The excerpts with one page's text changed. */
const edited = (source: 'S1' | 'S2' | 'S3', page: number, from: string, to: string): Excerpts => {
  const copy = structuredClone(excerpts);
  const text = copy[source]![String(page)];
  expect(text, `"${from}" on ${source} p.${page}`).toContain(from);
  copy[source]![String(page)] = text.replace(from, to);
  return copy;
};

describe('Fremont: the build', () => {
  it('reads the adopted General Fund summary: ten departments and three citywide lines that add up to Total Expenditures', () => {
    const [uses] = budget.generalFund;
    expect(uses.year).toBe(2027);
    expect(uses.lines.filter((l) => l.kind === 'department')).toHaveLength(10);
    expect(uses.lines.filter((l) => l.kind === 'citywide').map((l) => [l.id, l.amount])).toEqual([
      ['non-departmental', 4_440_000],
      ['debt-service', 6_249_000],
      ['citywide-savings', -19_700_000],
    ]);
    expect(uses.lines.reduce((a, l) => a + l.amount, 0)).toBe(276_972_000);
    expect(uses.total.amount).toBe(276_972_000);
  });

  it('reads revenue from three pages, each column cited to the page that prints it', () => {
    const property = budget.revenue.lines.find((l) => l.name === 'Property Tax')!;
    expect(property.values).toEqual({
      'actual-2025': 145_460_000,
      'adopted-2026': 152_832_000,
      'revised-2026': 152_509_000,
      'estimate-2026': 152_527_000,
      'adopted-2027': 158_193_000,
      'projected-2028': 164_440_000,
      'projected-2029': 171_702_000,
    });
    expect('page' in property && property.page).toBe(72);
    expect(property.cites!['actual-2025'].page).toBe(95);
    expect(property.cites!['projected-2028'].page).toBe(93);
    expect(budget.revenue.total.values['adopted-2027']).toBe(284_686_000);
  });

  it('reads staffing, size, the capital plan, pension and the quoted facts', () => {
    expect(budget.staffing.fte).toBe(994.24);
    expect(budget.staffing.byDepartment).toHaveLength(15);
    expect(budget.size.allFunds.amount).toBe(427_121_000);
    expect(budget.size.generalFund.amount).toBe(289_089_000);
    expect(budget.capitalPlan!.total.total).toBe(235_526_000);
    expect(budget.pension!.fundedRatio.rate).toBe(0.704);
    expect(budget.pension!.unfunded.amount).toBe(477_258_000);
    expect(budget.facts!.citywideSavings.value).toBe(19_700_000);
    expect(budget.facts!.contingencyPolicy.value).toBe(0.167);
    expect(budget.facts!.population.value).toBe(233_974);
  });

  it('has no deficit plan, so the deficit-plan pages and views never run for it', () => {
    expect(hasGapPlan(budget)).toBe(false);
    expect(budget.workbook).toBeUndefined();
  });

  it('every quote in budget.json is on its page', () => {
    const known = new Set(budget.sources.map((s) => s.id));
    expect(checkQuotesIn({ ...budget, sources: [] }, excerpts, known, 'budget.json')).toEqual([]);
    // Liveness: a changed figure on the page is caught.
    const changed = edited('S1', 72, 'Police   124,396', 'Police   124,397');
    expect(checkQuotesIn({ ...budget, sources: [] }, changed, known, 'budget.json').join('\n')).toContain('Police 124,396');
  });
});

describe('Fremont: each check, broken', () => {
  it('a department that no longer adds up to Total Expenditures', () => {
    expect(() => buildFremont(file, edited('S1', 72, '129,087 \n', '129,088 \n'))).toThrow(/rows add up to 276,973,000 in adopted-2027, but "Total Expenditures" says 276,972,000/);
  });

  it('the forecast page disagreeing with the summary', () => {
    const r = buildFremont(file, edited('S1', 93, 'Property Tax   152,527   158,193', 'Property Tax   152,527   158,194'));
    // The forecast's own total no longer ties either, so the build stops at the first of them.
    expect(r.errors.join('\n')).toMatch(/"Property Tax" adopted-2027 is 158194000, but the summary says 158193000/);
  });

  it('a table that moved: its title is not on the page', () => {
    expect(() => buildFremont(file, edited('S1', 126, 'Expenditures by Program Category', 'Expenditures by Category'))).toThrow(/the title isn't on the page/);
  });

  it('a row whose figures are not as many as the columns', () => {
    expect(() => buildFremont(file, edited('S1', 72, 'Fines   3,608   3,608   3,468   3,468', 'Fines   3,608   3,468   3,468'))).toThrow(/"Fines 3,608 3,468 3,468" has 3 figures, expected 4/);
  });

  it('a sentence whose figure disagrees with the table', () => {
    const changed = edited('S1', 73, 'savings assumption of $19.7', 'savings assumption of $19.8');
    // The page alone: documents.json's quote is no longer on it.
    expect(() => buildFremont(file, changed)).toThrow(/quotes.citywideSavings/);
    // Page and quote together: the sentence now disagrees with the table's Citywide Savings line.
    const quotes = structuredClone(file.quotes);
    quotes.citywideSavings.quote = quotes.citywideSavings.quote.replace('$19.7', '$19.8');
    expect(buildFremont({ ...file, quotes }, changed).errors.join('\n')).toMatch(/citywide savings: the sentence says \$19800000, the table -19700000/);
  });

  it('a glossary definition that is not on its page', () => {
    expect(() => buildFremont(file, edited('S1', 279, 'not \nlegally restricted', 'not \nrestricted'))).toThrow(/glossary "General Fund"/);
  });

  it('a contingency reserve that is not 16.7% of expenditures and transfers out', () => {
    const changed = edited('S1', 79, 'funded each year at 16.7%', 'funded each year at 18.7%');
    const quotes = structuredClone(file.quotes);
    quotes.contingencyPolicy.quote = quotes.contingencyPolicy.quote.replace('16.7%', '18.7%');
    expect(buildFremont({ ...file, quotes }, changed).errors.join('\n')).toMatch(/18.7% of expenditures and transfers out|16.7% of expenditures/);
  });
});

describe('table rows', () => {
  it('reads "-" as 0, parentheses as negative, skips "$", and reads a percent as a rate', () => {
    expect(splitRow('Less: Citywide Savings   (19,700)   -   -   (19,700)')).toMatchObject({ label: 'Less: Citywide Savings', cells: [-19_700, 0, 0, -19_700] });
    expect(splitRow('Contingency Reserve   $   46,394   $   1,884   $   -   $   48,278').cells).toEqual([46_394, 1_884, 0, 48_278]);
    expect(splitRow('Funded Ratio 76.2% 66.0% 70.4%')).toMatchObject({ cells: [0.762, 0.66, 0.704], percent: [true, true, true] });
    expect(splitRow('Total $43.077 $32.346').cells).toEqual([43.077, 32.346]);
  });

  it('scales to dollars without float noise', () => {
    const t = readTable(file.tables.capitalPlan, excerpts);
    expect(t.row('Total').values['2026']).toBe(43_077_000);
  });

  it('parses a sentence’s one figure, and refuses a sentence with two', () => {
    expect(factFrom('x', { source: 'S1', page: 1, quote: 'about $11.9 million.' }, 'money').value).toBe(11_900_000);
    expect(factFrom('x', { source: 'S1', page: 1, quote: 'Population: 233,974' }, 'number').value).toBe(233_974);
    expect(() => factFrom('x', { source: 'S1', page: 1, quote: '$3.2 million and $3.1 million' }, 'money')).toThrow(/found 2/);
  });
});

describe('Fremont: the site', () => {
  it('is a draft: it gets pages but is on no list of cities', () => {
    expect(fremont.draft).toBe(true);
    expect(cities.map((c) => c.path)).not.toContain('/us/ca/fremont/');
    const meta = { name: 'X', state: 'S', stateCode: 'CA', country: 'C', countryCode: 'US', government: 'G' };
    const settings = {
      budget: { cadence: 'annual', years: [2027], labels: { long: 'FY{end}', short: 'FY{yy}', spoken: 'fiscal year {end}' } },
      fiscalPosition: { variant: 'gap', reason: { text: 't', cites: [{ source: 'S1', page: 1, quote: 'q' }] } },
      ballot: false,
    };
    expect(() => buildRegistry({ '/data/cities/us/ca/x/city.json': { ...meta, ...settings, draft: true, featured: true } }, () => true)).toThrow(/a draft city can't be the featured city/);
  });

  it('reads its reserves from the table row, in thousands', () => {
    expect(reservesFor(fremont)!.reserves.map((r) => [r.key, r.value])).toEqual([
      ['contingency', 48_278_000],
      ['budget-uncertainty', 4_298_000],
    ]);
    const row = { source: 'S1', page: 79, quote: 'Contingency Reserve $ 46,394 $ 1,884 $ - $ 48,278' };
    const reserve = (amount: object) => ({ year: 2027, reserves: [{ key: 'k', name: 'n', purpose: 'p', amount }] });
    expect(() => parseReserves('r.json', reserve({ ...row, figure: 5, unit: 1000 }))).toThrow(/the row has 4 figures, so there is no figure 5/);
    expect(() => parseReserves('r.json', reserve({ ...row, figure: 4 }))).toThrow(/"unit" must say/);
    expect(() => parseReserves('r.json', reserve(row))).toThrow(/exactly one dollar figure/);
  });

  it('cites printed pages and opens PDF pages', () => {
    const s1 = budget.sources.find((s) => s.id === 'S1')!;
    expect(folio(s1, 72)).toBe(66);
    expect(openAt({ url: s1.url, format: 'PDF', pageOffset: 6 }, 72)).toEqual({ href: `${s1.url}#page=72`, label: 'Open the PDF at page 66 ↗' });
    expect(folio({}, 72)).toBe(72);
  });

  it('downloads keep each row’s page and quote, and a figure links to its CSV', () => {
    const names = csvTables(budget).map((t) => t.name);
    expect(names).toEqual(['revenue', 'general-fund-fy2027', 'positions', 'capital-plan', 'sources']);
    const police = budget.generalFund[0].lines.find((l) => l.id === 'police')!;
    expect(csvHref(budget, fremont, police)).toBe('/us/ca/fremont/data/general-fund-fy2027.csv');
    expect(csvHref(budget, fremont, { source: 'S1', page: 72, quote: 'not a row' })).toBeUndefined();
  });

  it('departments: each per-$100 share and the sum that reconciles to the total', () => {
    const p = departmentBudgets(budget, familiesFor(fremont, budget), {}, (y) => `FY${y}`);
    expect(p.rows.reduce((a, r) => a + r.per100, 0)).toBeCloseTo(100, 9);
    expect(p.rows[0].id).toBe('police');
    expect(p.total.parts!.reduce((a, x) => a + x.value, 0)).toBe(p.total.value);
    expect(p.departments.value).toBe(285_983_000);
  });

  it('revenue: the adopted year against the year before, and the forecast after', () => {
    const r = revenueOutlook(budget, revenueGroupsFor(fremont, budget), (y) => `FY${y}`);
    expect(r.columns.map((c) => c.key)).toEqual(['actual-2025', 'estimate-2026', 'adopted-2027', 'projected-2028', 'projected-2029']);
    expect(r.total.change).toBeCloseTo(284_686 / 275_934 - 1, 9);
    expect(r.chart.reduce((a, c) => a + c.item.squares, 0)).toBe(100);
  });
});
