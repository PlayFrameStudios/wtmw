/**
 * Lafayette (#59): budget.json from City documents alone, two of whose tables were printed as images. Each check is
 * also broken on purpose, against the real excerpts, so a passing test proves the check runs, not only that the data
 * is good.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyCoverage, type CoverageFile } from '../../src/data/coverage';
import { checkQuote, type Excerpts } from '../../src/data/documents';
import { buildLafayette, type LafayetteDocuments } from '../../src/data/lafayette/build';
import { buildCity, checkScans, PIPELINES, readDocuments, scannedRefs, type Result } from '../../src/data/pipeline';
import { splitRow } from '../../src/data/tables';
import type { CityBudget } from '../../src/data/types';
import { allCities } from '../../src/lib/cities';
import { coverageFor } from '../../src/lib/coverage';
import { departmentBudgets } from '../../src/lib/department-budgets';
import { departmentItems, fullNames } from '../../src/lib/departments';
import { familiesFor } from '../../src/lib/families';
import { fy } from '../../src/lib/city-settings';
import { cityOverview } from '../../src/lib/overview';
import { reservePositionOf } from '../../src/lib/reserve-position';
import { revenueGroupsFor } from '../../src/lib/revenue-groups';

const root = join(import.meta.dirname, '../..');
const dir = join(root, 'data/cities/us/ca/lafayette');
const lafayette = allCities.find((c) => c.path === '/us/ca/lafayette/')!;
const label = (y: number) => fy(lafayette.budget.labels, y);
const coverageFile: CoverageFile = JSON.parse(readFileSync(join(dir, 'coverage.json'), 'utf8'));
let file: LafayetteDocuments;
let excerpts: Excerpts;
let budget: CityBudget;
let base: CityBudget;

beforeAll(async () => {
  const docs = await readDocuments(dir);
  file = docs.file as unknown as LafayetteDocuments;
  excerpts = docs.excerpts;
  const built = await buildCity(root, 'us/ca/lafayette');
  expect(built.errors).toEqual([]);
  budget = built.budget;
  // The budget before coverage.json is applied: its own pipeline, without the coverage step.
  base = (await (PIPELINES['us/ca/lafayette'] as { build: (d: string) => Promise<Result> }).build(dir)).budget;
});

/** buildLafayette's errors after `change` edits a copy of documents.json. */
const errorsWith = (change: (f: LafayetteDocuments) => void) => {
  const f = structuredClone(file);
  change(f);
  return buildLafayette(f, excerpts).errors;
};
/** The excerpts with one page's text changed. */
const edited = (source: 'S1' | 'S3', page: number, from: string, to: string): Excerpts => {
  const copy = structuredClone(excerpts);
  const text = copy[source]![String(page)];
  expect(text, `"${from}" on ${source} p.${page}`).toContain(from);
  copy[source]![String(page)] = text.replace(from, to);
  return copy;
};
const coverageErrors = (change: (f: CoverageFile) => void) => {
  const f = structuredClone(coverageFile);
  change(f);
  return applyCoverage(base, f, excerpts, 'City of Lafayette').errors;
};

describe('Lafayette: the build', () => {
  it('reads 28 General Fund programs with money this year, adding up to TOTAL G.F. EXPENDITURES', () => {
    const [uses] = budget.generalFund;
    expect(uses.year).toBe(2027);
    expect(uses.unit).toBe('program');
    expect(uses.lines).toHaveLength(28);
    expect(uses.lines.every((l) => l.amount > 0 && l.kind === 'department')).toBe(true);
    expect(uses.total.amount).toBe(22_457_240);
    // Spreadsheet rounding: the printed lines add up to within a dollar or two of the printed total.
    expect(Math.abs(uses.lines.reduce((a, l) => a + l.amount, 0) - 22_457_240)).toBeLessThanOrEqual(14);
    expect(uses.lines.find((l) => l.id === 'police-services')).toMatchObject({ amount: 8_360_960, page: 25 });
    expect(budget.size).toEqual({ generalFund: expect.objectContaining({ amount: 22_457_240 }) });
  });

  it('a program that no longer adds up to its section fails the build', () => {
    // A dollar off is within the spreadsheet rounding the tie-out allows; ten thousand isn't.
    expect(() => buildLafayette(file, edited('S1', 25, '8,360,960', '8,360,961'))).not.toThrow();
    expect(() => buildLafayette(file, edited('S1', 25, '8,360,960', '8,370,960'))).toThrow(
      'S1 p.25 "EXPENDITURE SUMMARY - GENERAL FUND" Police Services: the rows add up to 8,969,564 in adopted-2027, but "Subtotal" says 8,959,564',
    );
  });

  it('ties the Sheriff contract across the program page, the expenditure summary and the contract detail', () => {
    expect(budget.facts!.sheriffContract.value).toBe(6_454_458);
    expect(budget.facts!.sheriffContractRise.value).toBe(0.308);
    expect(budget.facts!.animalControl.value).toBe(336_923);
    expect(budget.facts!.sworn.value).toBe(16);
    const quote = file.quotes.sheriffContract.quote;
    const errors = buildLafayette(
      { ...file, quotes: { ...file.quotes, sheriffContract: { ...file.quotes.sheriffContract, quote: quote.replace('6,454,458', '6,454,459') } } },
      edited('S1', 76, '6,454,458', '6,454,459'),
    ).errors;
    expect(errors).toContain('Sheriff contract: the program page says 6454459, the expenditure summary 6454458');
  });

  it('reads revenue from the columns that tie, leaving out the FY 2025-26 estimate', () => {
    expect(budget.revenue.columns.map((c) => c.key)).toEqual(['actual-2024', 'actual-2025', 'revised-2026', 'adopted-2027']);
    expect(budget.revenue.total.values['adopted-2027']).toBe(25_225_308);
    const sum = budget.revenue.lines.reduce((a, l) => a + l.values['adopted-2027'], 0);
    expect(Math.abs(sum - 25_225_308)).toBeLessThanOrEqual(10);
  });

  it('counts 50.10 positions, every row adding up to the TOTAL', () => {
    expect(budget.staffing.fte).toBe(50.1);
    expect(budget.staffing).toMatchObject({ source: 'S1', page: 32 });
  });

  it('has a defined-contribution plan and no pension debt', () => {
    const pension = budget.pension!;
    if (pension.plan !== 'defined-contribution') throw new Error('Lafayette has no defined-benefit plan');
    expect(pension.rate.rate).toBe(0.1);
    expect(pension.contribution.amount).toBe(842_472);
    expect(pension.opeb.amount).toBe(758_015);
  });

  it('ties the reserve standard: core cash, the 60% target, the printed share and the excess', () => {
    const r = budget.reservePosition!;
    expect(r).toMatchObject({ year: 2027, balance: { amount: 17_560_643 }, level: { rate: 0.72 }, policy: { rate: 0.6 }, change: { amount: -1_760_579 }, outlook: { rate: 0.59, year: 2031 } });
    const errors = buildLafayette(file, edited('S1', 16, '72%', '73%')).errors;
    expect(errors.join('\n')).toMatch(/core cash over expenditures and transfers isn't the printed 0\.73/);
  });

  it('every number in a reserve note must be in a quote it cites', () => {
    expect(errorsWith((f) => (f.reserveNotes[0].text += ' It plans 3 more years of this.'))).toContain("documents.json reserveNotes[0]: 3 isn't in a quote it cites");
  });
});

describe('Lafayette: scanned tables', () => {
  it('lists every figure read from an image, so a new one is a deliberate change', () => {
    const list = [...new Set(scannedRefs(budget).map((r) => `p.${r.page} ${r.column}: ${r.quote.split(/ [\d($]/)[0]}`))].sort();
    expect(list).toEqual([
      'p.17 Budget 2026/27: Surplus or',
      'p.17 Projected 2030/31: % of General Fund Expenditures',
      'p.21 Total: 2027 Pavement Maintenance Project',
      'p.21 Total: Aqueduct Pathway Design',
      'p.21 Total: Cemetary Storm Drain',
      'p.21 Total: GRAND TOTAL:',
      'p.21 Total: Hastings Court Stabilization',
      'p.21 Total: Overhead',
      'p.21 Total: Stanley Blvd and Quandt Rd Traffic Calming and Sidewalk',
    ]);
  });

  it('a page with text must be quoted, not marked scanned', () => {
    const ref = { source: 'S1' as const, page: 16, quote: 'anything', scanned: { image: '/us/ca/lafayette/scans/S1-p16.png' } };
    expect(() => checkQuote(ref, excerpts, 'test')).toThrow('test: S1 page 16 has text, so quote it instead of marking it scanned');
    expect(() => checkQuote({ ...ref, page: 17, scanned: { image: 'S1-p17.jpg' } }, excerpts, 'test')).toThrow(/scanned.image must be the rendered page's site path/);
    expect(() => checkQuote({ ...ref, page: 17 }, excerpts, 'test')).not.toThrow();
  });

  it('every scanned receipt links an image the site serves', async () => {
    expect(await checkScans(budget, root, 'us/ca/lafayette')).toEqual([]);
    const moved = structuredClone(budget);
    moved.capitalPlan!.total.scanned = { image: '/us/ca/lafayette/scans/S1-p99.png' };
    moved.capitalPlan!.lines[0].scanned = { image: '/us/ca/fremont/scans/S1-p21.png' };
    expect(await checkScans(moved, root, 'us/ca/lafayette')).toEqual([
      'scanned image /us/ca/fremont/scans/S1-p21.png: must be under /us/ca/lafayette/scans/',
      'scanned image /us/ca/lafayette/scans/S1-p99.png: not in public/',
    ]);
  });

  it("ties the forecast's reading to the reserve standard's text", () => {
    const misread = errorsWith((f) => (f.scans.forecast.rows[1] = f.scans.forecast.rows[1].replace('17,560,643', '17,560,648')));
    expect(misread.join('\n')).toMatch(/the FY 2026-27 ending balance 17560648 isn't the core cash position 17560643/);
    const share = errorsWith((f) => (f.scans.forecast.rows[2] = f.scans.forecast.rows[2].replace('92% 72%', '92% 71%')));
    expect(share.join('\n')).toMatch(/FY 2026-27's share 0\.71 isn't the reserve standard's 0\.72/);
  });

  it("adds each capital project's sources up to its Total, and the projects to the GRAND TOTAL", () => {
    expect(budget.capitalPlan).toMatchObject({ unit: 'project', years: [2027], total: { total: 7_025_664 } });
    expect(budget.capitalPlan!.lines).toHaveLength(7);
    const row = errorsWith((f) => (f.scans.capital.rows[0] = f.scans.capital.rows[0].replace('840,000', '850,000')));
    expect(row.join('\n')).toMatch(/capital program "2027 Pavement Maintenance Project": its sources add up to 4010000, not its Total 4000000/);
    const total = errorsWith((f) => (f.scans.capital.rows[1] = f.scans.capital.rows[1].replace(/1,255,000/g, '1,256,000')));
    expect(total.join('\n')).toMatch(/the projects add up to 7026664, not 7025664/);
  });
});

describe('table rows with minus signs and empty cells', () => {
  it('reads a negative percent as its own cell', () => {
    expect(splitRow('Recreation 177,444 -15.5%').cells).toEqual([177_444, -0.155]);
  });

  it('reads a lone dash between figures as an empty cell, without breaking a dash in a label', () => {
    const { cells } = splitRow('Some Project 150,000 - 350,000');
    expect(cells).toHaveLength(3);
    expect(cells[0]).toBe(150_000);
    expect(cells[2]).toBe(350_000);
    expect(splitRow('Franchise Tax - PG&E 498,000').cells).toEqual([498_000]);
  });
});

describe('Lafayette: coverage', () => {
  it('passes on the real data', () => {
    expect(coverageErrors(() => {})).toEqual([]);
  });

  it('puts who provides police on its line, with a figure-free version for the chart', () => {
    const police = budget.generalFund[0].lines.find((l) => l.id === 'police-services')!;
    expect(police.providedBy?.text).toMatch(/^Lafayette's police are a contract with the Contra Costa County Sheriff/);
    expect(police.providedBy?.short).toBe("A contract with the Contra Costa County Sheriff's Office");
    const families = familiesFor(lafayette, budget);
    const o = cityOverview(budget, families, revenueGroupsFor(lafayette, budget), label);
    const item = departmentItems(lafayette.path, budget, o.shares, families).find((i) => i.id === 'police-services')!;
    expect(item.note).toBe(police.providedBy!.short);
    expect(item.details).toBe('Program details');
  });

  it('a provided-by line must name a program in the budget, cite a source, and keep figures out of its short form', () => {
    expect(coverageErrors((f) => (f.lines!['fire-services'] = f.lines!['police-services']))).toContain('coverage.json lines.fire-services: not a department in the budget');
    expect(coverageErrors((f) => (f.lines!['police-services'].cites = []))).toContain('coverage.json lines.police-services: who provides a service needs a source that says so');
    expect(coverageErrors((f) => (f.lines!['police-services'].short = 'A $6.5M Sheriff contract'))).toContain('coverage.json lines.police-services: "short" must be a few words with no figures');
  });

  it('lists Fire and Library as outside the budget, each needing an unused id, a provider and a source', () => {
    const c = coverageFor(lafayette, budget, revenueGroupsFor(lafayette, budget))!;
    expect(c.outside.map((o) => [o.id, o.provider])).toEqual([
      ['fire', 'Contra Costa Consolidated Fire District'],
      ['library', 'Contra Costa County, under contract'],
    ]);
    expect(coverageErrors((f) => (f.notInBudget![1].id = 'fire')).join('\n')).toMatch(/notInBudget.*the id is already used/);
    expect(coverageErrors((f) => (f.notInBudget![0].id = 'police-services')).join('\n')).toMatch(/the id is already used/);
    expect(coverageErrors((f) => (f.notInBudget![0].provider = ' ')).join('\n')).toMatch(/needs a name and who provides it/);
    expect(coverageErrors((f) => (f.notInBudget![0].paragraph.cites = [])).join('\n')).toMatch(/a service outside the budget needs a source that says who provides it/);
  });

  it('has no {allFunds} to fill: the City shows its General Fund only', () => {
    expect(budget.size.allFunds).toBeUndefined();
    const errors = coverageErrors((f) => (f.questions[0].paragraphs[0].text += ' All funds: {allFunds}.'));
    expect(errors.join('\n')).toMatch(/unknown \{allFunds\}/);
  });

  it('gives the overview its profile line and the Departments page its outside rows', () => {
    expect(budget.coverage!.profile!.text).toMatch(/^Lafayette is a limited service city/);
    expect(coverageFor(lafayette, budget, revenueGroupsFor(lafayette, budget))!.profile).toBeDefined();
    const page = departmentBudgets(budget, familiesFor(lafayette, budget), fullNames(lafayette.path, budget), label);
    expect(page.unit).toBe('program');
    expect(page.outside.map((o) => o.id)).toEqual(['fire', 'library']);
  });
});

describe('Lafayette: the reserve position', () => {
  it('says the draw plainly, against the policy, and the forecast below it', () => {
    const p = reservePositionOf(budget, label)!;
    expect(p.change).toMatchObject({ drawn: true, figure: { value: 1_760_579, tone: 'neutral' } });
    expect(p.level.value).toBe(0.72);
    expect(p.policy.value).toBe(0.6);
    expect(p.outlook).toMatchObject({ year: 2031, belowPolicy: true, figure: { value: 0.59 } });
  });
});
