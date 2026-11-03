/**
 * #63: FY2028's department table is Item 21's (S40), cited row by row, and what the Council restored at adoption is
 * the annotated agenda's (S41). Each rule the build enforces is also broken here on purpose, starting with the bug
 * that started it: FY2027's charter-office figures copied into FY2028 and cited to a plan with no FY2028 table.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyPrintedRows, printedColumns, type PrintedTable } from '../../src/data/berkeley/printed-rows';
import { adoptionFrom, checkQuote, type DocumentsFile, type Excerpts } from '../../src/data/documents';
import { buildCity, readDocuments } from '../../src/data/pipeline';
import { checkNumbering, nextNumber } from '../../src/data/source-numbers';
import type { DocRef, GapBudget, WorkbookBudget } from '../../src/data/types';
import { shortMoney } from '../../src/lib/format';

const root = join(import.meta.dirname, '../..');
const dir = join(root, 'data/cities/us/ca/berkeley');
const b: GapBudget = JSON.parse(readFileSync(join(dir, 'budget.json'), 'utf8'));
const ballot = JSON.parse(readFileSync(join(dir, 'ballot.json'), 'utf8'));
const [fy27, fy28] = b.departmentReductions;
const known = new Set(b.sources.map((s) => s.id));
let file: DocumentsFile;
let excerpts: Excerpts;
beforeAll(async () => ({ file, excerpts } = await readDocuments(dir)));

describe('FY2028 department table: Item 21, row by row (#63)', () => {
  it("every FY2028 row and the total cite S40, with a quote that is on the cited page: S1 couldn't pass this", () => {
    for (const r of [...fy28.departments, fy28.total]) {
      expect(r.source, r.table + r.row).toBe('S40');
      expect(r.page).toBe(r === fy28.total ? 12 : 11);
      expect(() => checkQuote({ source: r.source, page: r.page, quote: r.quote! }, excerpts, `row ${r.row}`)).not.toThrow();
      // The April 16 plan, cited before: it has no FY2028 table to find the row on.
      expect(() => checkQuote({ source: 'S1', page: r.page, quote: r.quote! }, excerpts, `row ${r.row}`)).toThrow();
    }
  });

  it("FY2028's General Fund baseline carries the same receipts, and no FY2028 figure cites S1", () => {
    const g = b.generalFund.find((x) => x.year === 2028)!;
    for (const l of g.lines) expect(l, l.id).toMatchObject({ source: 'S40', page: 11, quote: fy28.departments.find((d) => d.id === l.id)!.quote });
    expect(g.total).toMatchObject({ source: 'S40', page: 12, quote: fy28.total.quote });
    expect(JSON.stringify([fy28, g])).not.toContain('"source":"S1"');
  });

  it("has Item 21's charter offices and PRW, not FY2027's", () => {
    const d = (id: string) => fy28.departments.find((x) => x.id === id)!;
    expect([d('city-attorney').baseline, d('city-attorney').reduction]).toEqual([7_828_432, 0]);
    expect([d('city-auditor').baseline, d('city-auditor').reduction]).toEqual([4_061_371, 367_458]);
    expect([d('odpa').baseline, d('odpa').reduction]).toEqual([1_339_846, 71_708]);
    expect([d('mayor-council').baseline, d('mayor-council').reduction]).toEqual([7_014_592, 877_248]);
    expect(d('prw').reduction).toBe(1_205_811);
    // The City's 29,773,019, plus the $1 of PRW rounding its totals don't carry; its baseline total leaves out the
    // $600,000 IT Cost Allocation Plan line, which ours counts, as FY2027's does.
    expect(fy28.total).toMatchObject({ baseline: 288_033_394 + 600_000, reduction: 29_773_019 + 1, salesTaxAllocation: 9_633_945, netReduction: 20_139_074 + 1 });
  });

  it('leaves FY2027 as it was: the April 16 plan, no quotes', () => {
    expect(fy27.departments.every((d) => d.source === 'S1' && d.quote === undefined)).toBe(true);
    expect(fy27.total).toMatchObject({ source: 'S1', baseline: 283_764_035, reduction: 29_251_348 });
  });
});

describe('the printed-row check, broken on purpose', () => {
  // The table as the workbook gives it, before receipts: what applyPrintedRows sees in the build.
  const workbook = () => {
    const w = structuredClone(b) as unknown as WorkbookBudget;
    for (const r of [...w.departmentReductions[1].departments, w.departmentReductions[1].total]) {
      delete r.page;
      delete r.quote;
    }
    return w;
  };
  const run = (edit: (w: WorkbookBudget, spec: PrintedTable) => void = () => {}) => {
    const w = workbook();
    const spec = structuredClone(file.departmentRows);
    edit(w, spec);
    return applyPrintedRows(w, spec, excerpts, known).errors;
  };
  const row = (w: WorkbookBudget, id: string) => w.departmentReductions[1].departments.find((d) => d.id === id)!;

  it('passes as committed', () => expect(run()).toEqual([]));

  it("fails the bug #63 fixed: FY2027's Mayor & Council figures in FY2028", () => {
    const errors = run((w) => Object.assign(row(w, 'mayor-council'), { baseline: 6_899_331, reduction: 863_145, budgetAfterReduction: 6_036_186 }));
    expect(errors).toContain('documents.json departmentRows 2028 mayor-council: baseline is 6,899,331, but the City prints 7,014,592');
    expect(errors).toContain('documents.json departmentRows 2028 mayor-council: reduction is 863,145, but the City prints 877,248');
  });

  it('fails a $1 change to an input, but lets a derived column be $1 off (rounding)', () => {
    expect(run((w) => (row(w, 'fire').salesTaxAllocation += 1))).toContain('documents.json departmentRows 2028 fire: salesTaxAllocation is 3,703,329, but the City prints 3,703,328');
    expect(run((w) => (row(w, 'fire').netReduction += 1))).toEqual([]);
    expect(run((w) => (row(w, 'fire').netReduction += 2))).toEqual(['documents.json departmentRows 2028 fire: netReduction is 3,097,465, but the City prints 3,097,463 (more than rounding)']);
  });

  it('fails a percent that rounds differently from the printed one', () => {
    expect(run((w) => (row(w, 'police').reductionPct = 0.1006))).toEqual([]);
    expect(run((w) => (row(w, 'police').reductionPct = 0.1016))).toEqual(['documents.json departmentRows 2028 police: reductionPct is 10.2%, but the City prints 10.1% (more than rounding)']);
  });

  it('fails a quote that is not on its page, a row with no printed line, and a row the workbook cites elsewhere', () => {
    expect(run((_, s) => (s.rows.fire.page = 12))).toEqual([expect.stringMatching(/fire: "Fire 57,206,818 .*" is not on S40 page 12$/)]);
    expect(run((_, s) => delete s.rows.hhcs)).toEqual(['documents.json departmentRows 2028 hhcs: no printed row. Every FY2028 row cites its line in S40']);
    expect(run((w) => (row(w, 'finance').source = 'S1'))).toEqual(['documents.json departmentRows 2028 finance: the workbook cites S1 for this row, not S40']);
  });

  it('fails a declared difference that no longer differs, so the list of City-side differences cannot go stale', () => {
    expect(run((w) => (row(w, 'mayor-council').budgetAfterReduction = 6_136_365))).toEqual([
      'documents.json departmentRows 2028 mayor-council: budgetAfterReduction is declared as differing, but the City prints 6,136,365 and ours is 6,136,365; remove it from differs',
    ]);
    expect(run((_, s) => (s.rows.fire.differs = { reduction: 'no reason' }))).toEqual([
      'documents.json departmentRows 2028 fire: reduction is declared as differing, but the City prints 6,800,791 and ours is 6,800,791; remove it from differs',
    ]);
  });

  it('reads the columns after the name, not a footnote marker in it', () => {
    expect(printedColumns('City Clerk (1) 3,998,036 94,456 3,903,580 2.4% 0 94,456 2.4%')).toEqual([3998036, 94456, 3903580, 0.024, 0, 94456, 0.024]);
    expect(printedColumns('IT Cost Allocation Plan 600,000 0 600,000')).toEqual([600000, 0, 600000]);
  });
});

describe('what the Council restored at adoption (#63)', () => {
  const pass = (ref: DocRef) => ref;
  const ids = fy27.departments.map((d) => d.id);
  const spec = () => structuredClone(file.adoptionAmendments);

  it('reads the amounts and positions from the motion’s table: Fire $1,728,334 for 9, CMO $236,000 for 1, and spending equals transfers', () => {
    const { restored, spending, transfers } = b.documentFacts.adoptionAmendments;
    expect(restored.map((r) => [r.department, r.amount, r.positions, r.bothYears])).toEqual([
      ['fire', 1_728_334, 9, true],
      ['cmo', 236_000, 1, false],
    ]);
    expect(restored[0].lines.map((l) => l.amount)).toEqual([238_232, 1_109_795, 380_307]);
    expect([spending.amount, transfers.amount]).toEqual([2_292_334, 2_292_334]);
    expect(restored.every((r) => r.cite.source === 'S41' && r.cite.page === 4)).toBe(true);
  });

  it('quotes the motion that carried, not the failed one with nearly the same words', () => {
    const { motion } = b.documentFacts.adoptionAmendments;
    expect(motion).toMatchObject({ source: 'S41', page: 3 });
    expect(motion.quote).toContain('(for a total of $978,334 in FY 2027 as reflected in the table below)');
  });

  it('fails when the transfers no longer match the spending (the gap would have changed)', () => {
    const s = spec();
    s.transfers.quote = s.transfers.quote.replace('$2,292,334', '$2,292,000');
    expect(adoptionFrom(s, pass, ids).errors).toEqual(['documents.json adoptionAmendments: spending 2292334 and transfers 2292000 differ, so the gap changed']);
  });

  it("fails when the Fire lines don't come to the motion's 9.0 positions", () => {
    const s = spec();
    s.restored.fire.cite.quote = s.restored.fire.cite.quote.replace(' 3.0 FTE Paramedics (Step 1) $380,307', '');
    expect(adoptionFrom(s, pass, ids).errors).toEqual(['documents.json adoptionAmendments: the motion funds 9.0 Fire positions, but the table\'s lines name 6']);
  });

  it('fails a number in our words that is not in the quote, a second year the motion does not give, and an unknown department', () => {
    const s = spec();
    s.restored.fire.what = 'a fire inspector, 6 firefighters and 3 paramedics';
    s.restored.cmo.bothYears = true;
    s.motion.quote = s.motion.quote.replace('In both FY 2027 and FY 2028 increase', 'Increase');
    s.restored.library = { ...s.restored.cmo, bothYears: false };
    expect(adoptionFrom(s, pass, ids).errors).toEqual([
      'documents.json adoptionAmendments.restored.fire: "a fire inspector, 6 firefighters and 3 paramedics" says 6, which isn\'t in the quote',
      'documents.json adoptionAmendments.restored.fire: bothYears, but the motion doesn\'t say "In both FY 2027 and FY 2028"',
      'documents.json adoptionAmendments.restored.cmo: bothYears, but the motion doesn\'t say "In both FY 2027 and FY 2028"',
      'documents.json adoptionAmendments.restored.library: no department "library"',
    ]);
  });

  it("doesn't count the CMO line's \"($236K)\" as a second amount", () => {
    expect(b.documentFacts.adoptionAmendments.restored[1].lines).toEqual([{ label: '1 OED FTE identified for removal in the CMO Reduction Plan ($236K)', amount: 236_000 }]);
  });

  it("the Ballot page's position-count caveat says what the motion's table says", () => {
    const { restored, transfers } = b.documentFacts.adoptionAmendments;
    const text: string = ballot.countsCaveat.text;
    expect(text).toContain(`restored ${restored[0].positions} Fire positions and ${restored[1].positions} City Manager's Office position for FY2027`);
    expect(text).toContain(`paid for with ${shortMoney(transfers.amount, 2)} of revenue transfers, so the gap didn't change`);
    expect(text).not.toMatch(/minutes|April 16/);
    expect(ballot.countsCaveat.cites.map((c: DocRef) => [c.source, c.page])).toEqual([
      ['S41', 3],
      ['S41', 4],
      ['S41', 4],
    ]);
  });
});

describe('source numbers (#63)', () => {
  it('a later City document can be numbered past the files after it; the chain still runs S1–Sn', () => {
    expect(nextNumber([{ number: 1 }, { number: 2 }, { number: 40 }])).toBe(3);
    expect(checkNumbering(b.sources)).toEqual([]);
    expect(b.sources.map((s) => s.number)).toEqual(Array.from({ length: 44 }, (_, i) => i + 1));
  });

  // Since #65, the last City document is S44 (the January budget update); renumbering it S45 leaves the gap.
  it('the data build runs the check: S44 renumbered S45 leaves a gap at 44, and the build says so', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wtmw-63-'));
    try {
      cpSync(join(root, 'data'), join(tmp, 'data'), { recursive: true });
      const city = join(tmp, 'data/cities/us/ca/berkeley');
      const docs = JSON.parse(readFileSync(join(city, 'documents.json'), 'utf8'));
      docs.sources.find((s: { id: string }) => s.id === 'S44').id = 'S45';
      writeFileSync(join(city, 'documents.json'), JSON.stringify(docs).replaceAll('"source":"S44"', '"source":"S45"'));
      cpSync(join(city, 'source/excerpts/S44.json'), join(city, 'source/excerpts/S45.json'));
      const { errors } = await buildCity(tmp, 'us/ca/berkeley');
      expect(errors).toEqual(['us/ca/berkeley: no source is numbered 44: the numbers must run S1–S45 with no gaps']);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('fails a gap, a duplicate, or an id that disagrees with its number', () => {
    expect(checkNumbering([{ id: 'S1', number: 1 }, { id: 'S3', number: 3 }])).toEqual(['no source is numbered 2: the numbers must run S1–S3 with no gaps']);
    expect(checkNumbering([{ id: 'S1', number: 1 }, { id: 'S1', number: 1 }])).toEqual(['two sources are numbered 1: S1 and S1']);
    expect(checkNumbering([{ id: 'S1', number: 1 }, { id: 'S9', number: 2 }])).toEqual(['source S9 is numbered 2']);
  });
});
