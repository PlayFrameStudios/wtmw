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
import { adminHubView, departmentDetailView, departmentHref } from '../../src/lib/department-detail';
import { departmentBudgets } from '../../src/lib/department-budgets';
import { fy } from '../../src/lib/city-settings';
import { fullNames } from '../../src/lib/departments';
import { familiesFor } from '../../src/lib/families';

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

describe('Fremont department subpages: $ of every $100', () => {
  let families: ReturnType<typeof familiesFor>;
  let names: ReturnType<typeof fullNames>;
  const y = 'FY 2026/27';
  let view: (id: string) => ReturnType<typeof departmentDetailView>;
  let hub: ReturnType<typeof adminHubView>;
  beforeAll(() => {
    families = familiesFor(fremont, budget);
    names = fullNames(fremont.path, budget);
    view = (id: string) => departmentDetailView(fremont.path, budget, families, names, id, y);
    hub = adminHubView(fremont.path, budget, families, y);
  });

  it('each top-level department matches the Departments page $ of every $100, to the cent', () => {
    const expected: Record<string, string> = {
      police: '45.14', fire: '27.46', 'maintenance-operations': '13.59', 'human-services': '1.94',
      'community-services': '1.14', 'public-works': '0.81', 'community-development': '0.80',
      'economic-development': '0.56', 'city-council': '0.31',
    };
    for (const [id, txt] of Object.entries(expected)) {
      expect(view(id).per100, id).toBeDefined();
      expect(view(id).per100!.toFixed(2), id).toBe(txt);
    }
  });

  it('the line names General Fund department budgets and the year', () => {
    expect(view('police').per100Text).toBe('$45.14 of every $100 of General Fund department budgets · FY 2026/27');
  });

  it('matches the Departments page $ of every $100, so the two pages can never drift', () => {
    const label = (y: number) => fy(fremont.budget.labels, y);
    const byId = new Map(departmentBudgets(budget, families, names, label).rows.map((r) => [r.id, r.per100]));
    for (const [id, txt] of Object.entries({
      police: '45.14', fire: '27.46', 'maintenance-operations': '13.59', 'human-services': '1.94',
      'community-services': '1.14', 'public-works': '0.81', 'community-development': '0.80',
      'economic-development': '0.56', 'city-council': '0.31',
    })) {
      expect(view(id).per100!.toFixed(2), id).toBe(txt);
      expect(view(id).per100!.toFixed(2), `${id} vs /departments/`).toBe(byId.get(id)!.toFixed(2));
    }
  });

  it('departmentHref resolves every General Fund row and every printed staff name', () => {
    const details = budget.departmentDetails!;
    const slugs = new Set([...details.departments.map((d) => d.id), details.adminHub!.id]);
    // The 10 rows in #db-depts: nine departments and the Administrative Departments hub.
    const rows = budget.generalFund[0].lines.filter((l) => l.kind === 'department');
    expect(rows).toHaveLength(10);
    for (const row of rows) expect(departmentHref(fremont.path, budget, row.id), row.name).toBe(`/us/ca/fremont/departments/${row.id}/`);
    // The 15 rows in #db-staff, by their printed names: "City Manager’s Office" → city-manager.
    const staff = budget.staffing.byDepartment!;
    expect(staff).toHaveLength(15);
    for (const s of staff) {
      const href = departmentHref(fremont.path, budget, s.name);
      expect(href, s.name).toBeDefined();
      expect(slugs.has(href!.split('/').at(-2)!), `${s.name} → ${href}`).toBe(true);
    }
    expect(departmentHref(fremont.path, budget, 'City Manager’s Office')).toBe('/us/ca/fremont/departments/city-manager/');
    // Without departmentDetails (Berkeley, Lafayette), nothing links to a subpage.
    const without = { ...budget, departmentDetails: undefined };
    expect(departmentHref(fremont.path, without, 'police')).toBeUndefined();
    for (const s of staff) expect(departmentHref(fremont.path, without, s.name), s.name).toBeUndefined();
  });

  it('departmentDetailView covers all four General Fund ties, with and without major service areas', () => {
    const details = budget.departmentDetails!;
    const kind = (id: string) => details.departments.find((d) => d.id === id)!.generalFundTie.kind;
    const ids = (k: string) => details.departments.filter((d) => d.generalFundTie.kind === k).map((d) => d.id);
    expect(ids('direct')).toHaveLength(7);
    expect(ids('with-overhead')).toEqual(['city-council', 'maintenance-operations']);
    expect(ids('admin-group')).toHaveLength(5);
    expect(ids('internal-service')).toEqual(['information-technology-services']);
    expect(kind('police')).toBe('direct');
    expect(kind('economic-development')).toBe('direct');

    const withAreas = details.departments.filter((d) => d.serviceAreas).map((d) => d.id);
    expect(withAreas).toEqual(['community-development', 'community-services', 'fire', 'human-services', 'maintenance-operations', 'police', 'city-manager', 'city-attorney']);

    for (const d of details.departments) {
      const v = view(d.id);
      expect(v.kind, d.id).toBe('department');
      expect(v.id, d.id).toBe(d.id);
      expect(v.total.value, d.id).toBe(d.funding.total.amount);
      // Funding is largest first, and every row has a share and a bar.
      expect(v.funding.lines.map((l) => l.figure.value), d.id).toEqual([...d.funding.lines.map((l) => l.amount)].sort((a, b) => b - a));
      for (const l of v.funding.lines) {
        expect(l.barRatio, `${d.id} ${l.name}`).toBeGreaterThan(0);
        expect(l.barRatio, `${d.id} ${l.name}`).toBeLessThanOrEqual(1);
        expect(l.figure.tone, `${d.id} ${l.name}`).toBe('neutral');
      }
      // The four printed categories, in the City's order.
      expect(v.categories.lines.map((l) => l.name), d.id).toEqual(['Salaries and Benefits', 'Operating Expenditures', 'Capital Expenditures', 'Direct/Indirect Expense Allocation']);
      expect(v.categories.total.value, d.id).toBe(d.categories.total.amount);
      expect(v.categories.allocationNote.cites.length, d.id).toBeGreaterThan(0);
      // Service areas only where the chapter prints them, and they total the same budget.
      expect(Boolean(v.serviceAreas), `${d.id} service areas`).toBe(Boolean(d.serviceAreas));
      if (v.serviceAreas) expect(v.serviceAreas.total.value, d.id).toBe(v.total.value);
      // Only the six administrative offices carry a parent link.
      expect(Boolean(v.parent), d.id).toBe(d.group === 'administrative');
    }
    // A $0 category still renders as an accountable row.
    expect(view('economic-development').categories.lines.find((l) => l.name === 'Capital Expenditures')!.isZero).toBe(true);
    // The four ties say different things in the lede.
    const lede = (id: string) => view(id).lede.map((f) => f.text + (f.figure ? `[${f.figure.value}]` : '')).join('');
    expect(lede('economic-development')).toContain('all of it from the General Fund');
    expect(lede('police')).toContain('comes from the General Fund');
    expect(lede('city-council')).toContain('Together those two match the [898000]');
    expect(lede('information-technology-services')).toContain('budgeted as an internal service fund');
  });

  it('the administrative offices carry their slice of the $23.6M row, and IT Services is the internal service fund', () => {
    const offices: Record<string, string> = { finance: '2.78', 'human-resources': '1.99', 'city-manager': '1.98', 'city-attorney': '1.10', 'city-clerk': '0.41' };
    for (const [id, txt] of Object.entries(offices)) {
      expect(view(id).per100, id).toBeDefined();
      expect(view(id).per100!.toFixed(2), id).toBe(txt);
    }
    expect(view('information-technology-services').per100).toBeUndefined();
    expect(view('information-technology-services').per100Text).toContain('Internal service fund');
    // The five offices together are the hub's $8.25 of every $100 (exact shares, before display rounding).
    const sum = Object.keys(offices).reduce((a, id) => a + view(id).per100!, 0);
    expect(sum).toBeCloseTo(hub.per100, 2);
  });

  it('the hub shows $8.25 of every $100 and lists each of the five offices under it', () => {
    expect(hub.per100).toBeDefined();
    expect(hub.per100!.toFixed(2)).toBe('8.25');
    expect(hub.per100Text).toBe('$8.25 of every $100 of General Fund department budgets · FY 2026/27');
    const office = (id: string) => hub.generalFundOffices.find((o: { id: string }) => o.id === id)!;
    expect(office('finance').per100!.toFixed(2)).toBe('2.78');
    expect(hub.internalService.per100).toBeUndefined();
  });

  it('the hub adds the five offices to the General Fund row: $19.8M General Fund + $3.8M overhead = $23.6M', () => {
    expect(hub.generalFundOnly.value).toBe(19_767_060);
    expect(hub.overheadOnly.value).toBe(3_838_722);
    expect(hub.generalFundOnly.value + hub.overheadOnly.value).toBe(23_605_782);
    expect(hub.summary.value).toBe(23_606_000);
    expect(Math.round((hub.generalFundOnly.value + hub.overheadOnly.value) / 1000) * 1000).toBe(hub.summary.value);
    // Biggest slice of the row first, as the page lists them.
    expect(hub.generalFundOffices.map((o) => o.id)).toEqual(['finance', 'human-resources', 'city-manager', 'city-attorney', 'city-clerk']);
    const expected: Record<string, number> = {
      finance: 7_940_882,
      'human-resources': 5_684_069,
      'city-manager': 5_666_327,
      'city-attorney': 3_155_917,
      'city-clerk': 1_158_587,
    };
    for (const [id, amount] of Object.entries(expected)) {
      const o = hub.generalFundOffices.find((x) => x.id === id)!;
      // The figure beside each office is its General Fund + overhead lines, never its all-funds total.
      expect(o.generalFundRow!.value, id).toBe(amount);
      expect(o.generalFundRow!.parts!.reduce((a, p) => a + p.value, 0), `${id} parts`).toBe(amount);
    }
    expect(hub.generalFundMax).toBe(7_940_882);
    // The two sums' parts name every office, so the drawer shows the sum a reader can check.
    expect(hub.generalFundOnly.parts!.map((p) => p.label)).toEqual(['Finance', 'Human Resources', 'City Manager', 'City Attorney', 'City Clerk']);
    expect(hub.generalFundOnly.parts!.reduce((a, p) => a + p.value, 0)).toBe(hub.generalFundOnly.value);
    expect(hub.overheadOnly.parts!.reduce((a, p) => a + p.value, 0)).toBe(hub.overheadOnly.value);
    expect(hub.internalService.generalFundRow).toBeUndefined();
  });

  it('each General Fund office page says its two lines are what counts toward the row', () => {
    const lede = (id: string) => view(id).lede.map((f) => f.text + (f.figure ? `[${f.figure.value}]` : '')).join('');
    // Clerk, Finance and Human Resources are only General Fund + overhead, so their lede is the row in two parts.
    expect(lede('finance')).toContain('Both count toward the [23606000] Administrative Departments row');
    expect(lede('city-clerk')).toContain('Both count toward the [23606000] Administrative Departments row');
    // City Manager and City Attorney carry money outside the row, so the share of the row is stated before it.
    expect(lede('city-manager')).toContain('[5666327] toward the [23606000] Administrative Departments row');
    expect(lede('city-attorney')).toContain('[3155917] toward the [23606000] Administrative Departments row');
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
