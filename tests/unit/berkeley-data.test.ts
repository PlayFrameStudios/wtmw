import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import { departmentId, parseSourceDocument } from '../../src/data/berkeley/extract';
import { PINNED, allRefs, validateBerkeley } from '../../src/data/berkeley/validate';
import { csvTables, toCsv } from '../../src/data/csv';
import { buildCity, serialize, type Result } from '../../src/data/pipeline';
import { gapPlan, type GapBudget } from '../../src/data/types';

const root = join(import.meta.dirname, '../..');
const CITY = 'us/ca/berkeley';
const WORKBOOK = join(root, 'data/cities', CITY, 'source/Berkeley_Budget_FY25-FY28.xlsx');

/** A copy of the real workbook with one edit applied, written to a temp file. */
async function mutated(edit: (wb: ExcelJS.Workbook) => void): Promise<Result> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(WORKBOOK);
  edit(wb);
  const path = join(await mkdtemp(join(tmpdir(), 'wtmw-')), 'mutated.xlsx');
  await wb.xlsx.writeFile(path);
  return buildCity(root, CITY, path);
}

const setCell = (tab: string, address: string, value: ExcelJS.CellValue) => (wb: ExcelJS.Workbook) => {
  wb.getWorksheet(tab)!.getCell(address).value = value;
};

let real: Result;
let budget: GapBudget;
beforeAll(async () => {
  real = await buildCity(root, CITY);
  budget = gapPlan(real.budget, 'test');
});

describe('Berkeley workbook → budget.json', () => {
  it('passes every tie-out check', () => {
    expect(real.errors).toEqual([]);
  });

  it('matches the committed budget.json (run `npm run data` after changing the workbook)', async () => {
    expect(await readFile(join(root, 'data/cities', CITY, 'budget.json'), 'utf8')).toBe(serialize(budget));
  });

  it('FY27: 16 departments, baselines 283,764,035, cuts 29,251,348, net with sales tax 19,808,353', () => {
    const fy27 = budget.departmentReductions[0];
    const sum = (k: 'baseline' | 'reduction' | 'netReduction') => fy27.departments.reduce((a, d) => a + d[k], 0);
    expect(fy27.departments).toHaveLength(16);
    expect(sum('baseline')).toBe(283_764_035);
    expect(sum('reduction')).toBe(29_251_348);
    expect(sum('netReduction')).toBe(19_808_353);
  });

  it('FY26 revenue lines sum to the TOTAL row, 311,935,259, within ±2', () => {
    const lines = budget.revenue.lines.reduce((a, l) => a + l.values['adopted-2026'], 0);
    expect(budget.revenue.total.values['adopted-2026']).toBe(311_935_259);
    expect(Math.abs(lines - 311_935_259)).toBeLessThanOrEqual(2);
  });

  it('deficit bridge: initial + revenue + three adjustments + one-time = -29,249,339 (FY27)', () => {
    const inputs = budget.deficitBridge.steps.filter((s) => s.kind === 'estimate' || s.kind === 'change');
    expect(inputs.map((s) => s.key)).toEqual([
      'initial-estimate',
      'revenue-projections',
      'center-street-debt-service',
      'parking-funds-stabilization',
      'non-departmental',
      'one-time-resources',
    ]);
    expect(inputs.reduce((a, s) => a + s.years[2027], 0)).toBe(-29_249_339);
    expect(budget.deficitBridge.steps.at(-1)).toMatchObject({ key: 'final-gap', years: { 2027: -29_249_339, 2028: -29_532_958 } });
  });

  it("every record's source resolves to a row in Sources", () => {
    const ids = new Set(budget.sources.map((s) => s.id));
    const refs = allRefs(budget);
    expect(refs.length).toBeGreaterThan(100);
    for (const r of refs) for (const id of [r.source, ...(r.related ?? [])]) expect(ids, `${r.table} row ${r.row}`).toContain(id);
  });

  it('gives receipts a table and row, e.g. "Deficit Bridge FY27-28, row 13"', () => {
    expect(budget.deficitBridge.steps.at(-1)).toMatchObject({ source: 'S1', table: 'Deficit Bridge FY27-28', row: 13 });
  });

  it('types S1–S10 as city documents and S11–S19 as news; documents.json adds S20–S23 and S25–S27 (city) and S24 (news) after them', () => {
    expect(budget.sources.filter((s) => s.type === 'city').map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21, 22, 23, 25, 26, 27]);
    expect(budget.sources.filter((s) => s.row !== undefined)).toHaveLength(PINNED.sourceCount);
    expect(budget.sources.map((s) => s.id)).toEqual(Array.from({ length: 27 }, (_, i) => `S${i + 1}`));
  });

  it('computes derived columns the workbook left uncomputed', () => {
    // Dept Reductions FY27!E5 and D20 are formulas with no stored result.
    const [attorney] = budget.departmentReductions[0].departments;
    const it = budget.departmentReductions[0].departments.find((d) => d.id === 'it-cost-allocation-plan')!;
    expect(attorney).toMatchObject({ id: 'city-attorney', reductionPct: 0, charter: true });
    expect(it.budgetAfterReduction).toBe(0);
  });
});

describe('break-it: validation fails when the workbook is wrong', () => {
  it('control: an unedited round-trip still passes', async () => {
    expect((await mutated(() => {})).errors).toEqual([]);
  });

  it('a changed department baseline fails the 283,764,035 check', async () => {
    const { errors } = await mutated(setCell('Dept Reductions FY27', 'B18', 106_198_575)); // Police +1
    expect(errors).toContainEqual(expect.stringMatching(/^FY27 sum of department baselines: expected 283,764,035, got 283,764,036/));
  });

  it('a changed bridge step fails the -29,249,339 check', async () => {
    const { errors } = await mutated(setCell('Deficit Bridge FY27-28', 'B6', 5_111_719));
    expect(errors).toContainEqual(expect.stringMatching(/^FY27 final gap: expected -29,249,339/));
  });

  it('revenue lines off by 3 fail the ±2 tie-out; off by 2 pass it', async () => {
    const off = (n: number) => mutated(setCell('GF Revenue FY26', 'B5', 95_236_939 + n));
    expect((await off(3)).errors).toContainEqual(expect.stringMatching(/^FY26 adopted revenue lines vs TOTAL row/));
    expect((await off(2)).errors.filter((e) => e.startsWith('FY26 adopted revenue lines'))).toEqual([]);
  });

  it('our arithmetic is checked against every result Excel stored', async () => {
    const { errors } = await mutated(setCell('Dept Reductions FY27', 'E6', { formula: 'C6/B6', result: 0.5 }));
    expect(errors).toContainEqual('Dept Reductions FY27!E6: computed 0.07344 but the workbook says 0.5');
  });

  it('a tab whose source line changes stops the build', async () => {
    await expect(
      mutated(setCell('Deficit Bridge FY27-28', 'A2', 'Source: some other document')),
    ).rejects.toThrow(/Deficit Bridge FY27-28!A2: expected text starting "Source: Berkeley Budget & Finance Committee/);
  });

  it('a moved column stops the build', async () => {
    await expect(mutated(setCell('Dept Reductions FY27', 'C4', 'Proposed Cut'))).rejects.toThrow(
      /Dept Reductions FY27!C4: expected header "Proposed Reduction"/,
    );
  });

  it('a typed-over formula in an input cell stops the build', async () => {
    await expect(mutated(setCell('Dept Reductions FY27', 'B18', { formula: 'B17*2', result: 1 }))).rejects.toThrow(
      /Dept Reductions FY27!B18: expected a typed-in number, found formula =B17\*2/,
    );
  });

  it('a source ID that is not in Sources & Links fails validation', () => {
    const broken = structuredClone(budget);
    broken.capitalProgram.lines[0].source = 'S99';
    expect(validateBerkeley(broken)).toContain('Capital Program FY27-28 row 5: source S99 is not in Sources & Links');
  });
});

describe('source documents', () => {
  it('splits publisher, title, committee and date', () => {
    expect(parseSourceDocument('City of Berkeley — FY27-FY28 Budget Balancing Plan (Budget & Finance Cmte, Apr 16 2026)')).toEqual({
      publisher: 'City of Berkeley',
      title: 'FY27-FY28 Budget Balancing Plan',
      committee: 'Budget & Finance Cmte',
      date: '2026-04-16',
      dateLabel: 'Apr 16 2026',
    });
  });

  it('keeps a month-only date as YYYY-MM and unquotes headlines', () => {
    expect(parseSourceDocument("Berkeleyside — finance audit: pension & infrastructure (May 2022)")).toMatchObject({
      title: 'finance audit: pension & infrastructure',
      date: '2022-05',
    });
    expect(parseSourceDocument("Daily Cal — 'how Berkeley is trying to fix its $30M deficit'")).toEqual({
      publisher: 'Daily Cal',
      title: 'how Berkeley is trying to fix its $30M deficit',
      committee: undefined,
      date: undefined,
      dateLabel: undefined,
    });
  });

  it('leaves a parenthetical that is not a date in the title', () => {
    expect(parseSourceDocument('City of Berkeley — Financial Condition FY2012–FY2021 (Auditor)').title).toBe(
      'Financial Condition FY2012–FY2021 (Auditor)',
    );
  });
});

describe('department ids', () => {
  it.each([
    ['Office of Dir. of Police Accountability (ODPA)', 'odpa'],
    ['Mayor & Council', 'mayor-council'],
    ["City Manager's Office (CMO)", 'cmo'],
    ['Planning & Development', 'planning-development'],
  ])('%s → %s', (name, id) => expect(departmentId(name)).toBe(id));
});

describe('CSV downloads', () => {
  it('quotes commas and quotes, joins related sources, and keeps receipt columns', () => {
    const csv = toCsv({
      name: 't',
      columns: ['label', 'amount', 'source', 'related', 'table', 'row'],
      rows: [{ label: 'Fire, "Station 7"', amount: 1, source: 'S17', related: ['S8', 'S12'], table: 'X', row: 15 }],
    });
    expect(csv).toBe('label,amount,source,related,table,row\r\n"Fire, ""Station 7""",1,S17,S8;S12,X,15\r\n');
  });

  it('has one table per extracted tab, each with rows', () => {
    const tables = csvTables(budget);
    expect(tables.map((t) => t.name)).toEqual([
      'revenue-fy2026',
      'deficit-bridge',
      'department-reductions-fy2027',
      'department-reductions-fy2028',
      'fte-scenarios',
      'position-reductions',
      'one-time-resources',
      'capital-program',
      'personnel-cost-composition',
      'unfunded-liabilities',
      'sources',
      'glossary',
    ]);
    for (const t of tables) expect(t.rows.length, t.name).toBeGreaterThan(0);
  });
});
