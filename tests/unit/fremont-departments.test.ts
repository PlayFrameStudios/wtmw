/**
 * Fremont's per-department operating budgets (departmentBudgets in documents.json): the 15 department
 * records and the Administrative Departments hub parse from their quoted pages, every quote is on its
 * page under both normalizations, and every tie-out (funding to total, the three tables' equal totals,
 * and the General Fund summary cross-ties) is broken on purpose to prove it runs.
 */
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { normalize, type Excerpts } from '../../src/data/documents';
import { buildFremont, type FremontDocuments } from '../../src/data/fremont/build';
import { csvTables } from '../../src/data/csv';
import { buildCity, readDocuments } from '../../src/data/pipeline';
import { splitRow } from '../../src/data/tables';
import type { CityBudget } from '../../src/data/types';
import { allCities } from '../../src/lib/cities';

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
const edited = (page: number, from: string, to: string): Excerpts => {
  const copy = structuredClone(excerpts);
  const text = copy.S1![String(page)];
  expect(text, `"${from}" on S1 p.${page}`).toContain(from);
  copy.S1![String(page)] = text.replace(from, to);
  return copy;
};

/** The build errors, or the build's thrown message, for a mutation. */
const errorsFor = (f: FremontDocuments, x: Excerpts) => buildFremont(f, x).errors.join('\n');

describe('Fremont department budgets: the data', () => {
  it('parses all 15 departments, 8 with service areas, plus the Administrative Departments hub', () => {
    const d = budget.departmentDetails!;
    expect(d.year).toBe(2027);
    expect(d.departments.map((x) => x.id)).toEqual([
      'city-council',
      'community-development',
      'community-services',
      'economic-development',
      'fire',
      'human-services',
      'maintenance-operations',
      'police',
      'public-works',
      'city-manager',
      'city-attorney',
      'city-clerk',
      'finance',
      'human-resources',
      'information-technology-services',
    ]);
    expect(d.departments.filter((x) => x.serviceAreas)).toHaveLength(8);
    expect(d.adminHub).toMatchObject({
      id: 'administrative-departments',
      name: 'Administrative Departments',
      memberIds: ['city-manager', 'city-attorney', 'city-clerk', 'finance', 'human-resources', 'information-technology-services'],
    });
    expect(d.adminHub!.description.quote).toContain('The Administrative Departments include the City Manager’s Office');
  });

  it('holds the three tables to one total per department, and ties every General Fund summary cross-check', () => {
    const d = budget.departmentDetails!;
    const byId = new Map(d.departments.map((x) => [x.id, x]));
    for (const dept of d.departments) {
      expect(dept.funding.total.amount, `${dept.id} funding vs categories`).toBe(dept.categories.total.amount);
      if (dept.serviceAreas) expect(dept.serviceAreas.total.amount, `${dept.id} service areas vs categories`).toBe(dept.categories.total.amount);
    }
    expect(d.departments.filter((x) => x.generalFundTie.kind === 'direct')).toHaveLength(7);
    expect(d.departments.filter((x) => x.generalFundTie.kind === 'with-overhead')).toHaveLength(2);
    expect(d.departments.filter((x) => x.generalFundTie.kind === 'admin-group')).toHaveLength(5);
    expect(d.departments.filter((x) => x.generalFundTie.kind === 'internal-service')).toHaveLength(1);
    // The reconciliation figures the pages will show, read from the quotes:
    const gfLine = (id: string) => byId.get(id)!.funding.lines.find((l) => l.name === 'General Fund')!;
    const overheadLine = (id: string) => byId.get(id)!.funding.lines.find((l) => l.name.startsWith('Overhead Charges to Other Funds'))!;
    expect(gfLine('police').amount).toBe(129_087_241); // rounds to the summary's 129,087,000
    expect(gfLine('city-council').amount + overheadLine('city-council').amount).toBe(897_641); // rounds to 898,000
    expect(byId.get('information-technology-services')!.funding.lines.find((l) => l.name.startsWith('Direct Charges to General Fund'))!.amount + byId.get('information-technology-services')!.funding.lines.find((l) => l.name.startsWith('Direct Charges to Other Funds'))!.amount).toBe(25_284_669);
    // The five General Fund offices' GF + overhead sum to the "Administrative Departments" summary row.
    const offices = ['city-manager', 'city-attorney', 'city-clerk', 'finance', 'human-resources'];
    const officeSum = offices.reduce((a, id) => a + gfLine(id).amount + overheadLine(id).amount, 0);
    expect(officeSum).toBe(23_605_782);
    expect(Math.round(officeSum / 1000) * 1000).toBe(23_606_000);
  });

  it('every quote in departmentDetails is on its page, under both the quote check and the strict flat check', () => {
    const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
    const walk = (v: unknown, path: string) => {
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
      if (!v || typeof v !== 'object') return;
      const o = v as Record<string, unknown>;
      if (typeof o.source === 'string' && typeof o.quote === 'string' && typeof o.page === 'number') {
        const page = excerpts[o.source as keyof Excerpts]?.[String(o.page)];
        expect(page, `${path}: no excerpt for ${o.source} p.${o.page}`).toBeDefined();
        expect(normalize(page), `${path} (${o.quote})`).toContain(normalize(o.quote as string));
        expect(flat(page), `${path} flat (${o.quote})`).toContain(flat(o.quote as string));
      }
      for (const [k, x] of Object.entries(o)) walk(x, path ? `${path}.${k}` : k);
    };
    walk(budget.departmentDetails, 'departmentDetails');
  });

  it('reads the City Manager Major Service Area table with its blank FY 2022/23 cell, without changing the shared parser', () => {
    // The printed row is "Homeless Services - 115,132 265,340 292,741 310,619": a blank first cell, not a hyphenated label.
    // The fix lives in Fremont's wrapper, so the shared splitRow still glues `word - digit` as it always has (liveness).
    expect(splitRow('Homeless Services - 115,132 265,340 292,741 310,619').label).toBe('Homeless Services-115,132');
    expect(splitRow('Recreation 177,444 -15.5%').cells).toEqual([177_444, -0.155]);
    const cm = budget.departmentDetails!.departments.find((d) => d.id === 'city-manager')!;
    expect(cm.serviceAreas!.lines.map((l) => [l.name, l.amount])).toEqual([
      ["City Manager's Office", 4_338_901],
      ['Communications and Marketing', 1_327_426],
      ['Homeless Services', 310_619],
    ]);
    expect(cm.serviceAreas!.total.amount).toBe(5_976_946);
    const homeless = cm.serviceAreas!.lines.find((l) => l.name === 'Homeless Services')!;
    expect(homeless.quote).toBe('Homeless Services - 115,132 265,340 292,741 310,619');
  });
});

describe('Fremont department budgets: each check, broken', () => {
  it('an altered quote on a department page is caught', () => {
    // The Administrative Departments hub page no longer holds its quoted sentence.
    expect(errorsFor(file, edited(207, 'The Administrative Departments include', 'The Administrative Departments includes'))).toMatch(/adminHub/);
  });

  it('a funding row missing from the page is caught', () => {
    // Community Development loses its Homeless Services funding line.
    const changed = edited(144, 'Homeless Services $ 488,309 1.1%\n', '');
    expect(errorsFor(file, changed)).toMatch(/read 5 funding lines, expected 6/);
  });

  it('a funding row added to the page is caught', () => {
    // A line the department's chapter doesn't print would change the count and the labels.
    const changed = edited(193, 'Public Safety Grants $ 1,828,362 1.4%', 'Public Safety Grants $ 1,828,362 1.4%\nNew Fund $ 1 0.0%');
    expect(errorsFor(file, changed)).toMatch(/read 3 funding lines, expected 2/);
  });

  it('a General Fund line that no longer rounds to the summary is caught', () => {
    // Police's General Fund line moves $500: still a valid quote and total, but the p.66 cross-tie breaks.
    const changed = edited(193, 'General Fund $ 129,087,241 98.6%', 'General Fund $ 129,087,741 98.6%');
    expect(errorsFor(file, changed)).toMatch(/General Fund total 129,087,741 doesn't round to the summary's 129,087,000/);
  });

  it('a funding total that disagrees with Expenditures by Category is caught', () => {
    const changed = edited(135, 'City Council Total $ 897,642', 'City Council Total $ 897,700');
    expect(errorsFor(file, changed)).toMatch(/"City Council": the funding sources add up to 897,641, not the printed 897,700/);
  });

  it('an administrative office whose funding no longer sums with its fellows is caught', () => {
    // Finance's General Fund line moves $1,000: the five offices no longer round to "Administrative Departments".
    const changed = edited(229, 'General Fund $6,545,566 82.4%', 'General Fund $6,546,566 82.4%');
    expect(errorsFor(file, changed)).toMatch(/administrative offices' .* doesn't round to the summary's 23,606,000/);
  });
});

describe('Fremont department budgets: CSV downloads', () => {
  it('adds the three department tables, and leaves a city without departmentDetails unchanged', () => {
    const names = csvTables(budget).map((t) => t.name);
    expect(names).toContain('department-funding');
    expect(names).toContain('department-categories');
    expect(names).toContain('department-service-areas');
    // Berkeley and Lafayette have no departmentDetails, so their tables stay as they were.
    const without = csvTables({ ...budget, departmentDetails: undefined }).map((t) => t.name);
    expect(without).toEqual(['revenue', 'general-fund-fy2027', 'positions', 'capital-plan', 'sources']);
  });

  it('each department row keeps its page and quote, and the total row its department', () => {
    const funding = csvTables(budget).find((t) => t.name === 'department-funding')!;
    expect(funding.columns).toEqual(['departmentId', 'department', 'name', 'amount', 'share', 'source', 'related', 'page', 'quote']);
    const policeTotal = funding.rows.find((r) => (r as { departmentId: string }).departmentId === 'police' && (r as { name: string }).name === 'Total') as {
      amount: number;
      page: number;
      quote: string;
    };
    expect(policeTotal.amount).toBe(130_915_603);
    expect(policeTotal.page).toBe(193);
    expect(policeTotal.quote).toBe('Police Total $ 130,915,603');
    expect(fremont.path).toBe('/us/ca/fremont/');
  });
});
