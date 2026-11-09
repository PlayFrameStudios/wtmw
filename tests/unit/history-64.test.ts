/**
 * #64: the General Fund over the years. Every figure is parsed from a quote on its cited page and equals the
 * workbook Jeremy approved (tests/fixtures/history-rows-64.json, the PM's rows); the workbook's tie-outs run on
 * every build; and Berkeley's annual report and budget are never one line. Each rule is also broken on purpose.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkQuote, type Excerpts } from '../../src/data/documents';
import { applyHistory, printedFigures, type HistorySpec } from '../../src/data/history';
import { readDocuments } from '../../src/data/pipeline';
import { numberFromIds } from '../../src/data/source-numbers';
import type { CityBudget, HistoryAs } from '../../src/data/types';
import { historyPanels, ticksFor } from '../../src/lib/history';

const root = join(import.meta.dirname, '../..');
const CITIES = ['berkeley', 'fremont', 'lafayette'] as const;
type CityId = (typeof CITIES)[number];
const workbook = JSON.parse(readFileSync(join(root, 'tests/fixtures/history-rows-64.json'), 'utf8'));
const data: Record<CityId, { budget: CityBudget; spec: HistorySpec; excerpts: Excerpts }> = {} as never;
const run = (c: CityId, edit: (s: HistorySpec) => void = () => {}) => {
  const spec = structuredClone(data[c].spec);
  edit(spec);
  return applyHistory({ ...data[c].budget, history: undefined }, spec, data[c].excerpts, c);
};
let built: Record<CityId, ReturnType<typeof applyHistory>>;

beforeAll(async () => {
  for (const c of CITIES) {
    const dir = join(root, 'data/cities/us/ca', c);
    const { file, excerpts } = await readDocuments(dir);
    data[c] = { budget: JSON.parse(readFileSync(join(dir, 'budget.json'), 'utf8')), spec: (file as unknown as { history: HistorySpec }).history, excerpts };
  }
  built = Object.fromEntries(CITIES.map((c) => [c, run(c)])) as typeof built;
});

/** "FY2021/22 actual" → 2022; "FY2025" → 2025. */
const yearOf = (h: string) => {
  const m = /^FY(\d{4})(?:\/(\d{2}))?/.exec(h)!;
  return m[2] ? 2000 + Number(m[2]) : Number(m[1]);
};
/** The workbook's word for a column, as ours names it; null for a budget column beside an actual, which we skip. */
const asOf = (h: string): HistoryAs | null =>
  /est\.( actual)?$/.test(h) ? 'estimate' : / actual$/.test(h) || /^FY\d{4}$/.test(h) ? 'actual' : / adopted$/.test(h) ? 'adopted' : / proposed$/.test(h) ? 'proposed' : null;

describe('every figure equals the approved workbook (#64)', () => {
  it('builds with no errors, for every city', () => {
    for (const c of CITIES) expect(built[c].errors, c).toEqual([]);
  });

  it("Fremont: all 37 rows of the adopted budget's p.95 table, six years each, in dollars", () => {
    const { header, rows } = workbook.Fremont;
    let compared = 0;
    for (const r of rows) {
      const ours = built.fremont.values[data.fremont.spec.rows.find((x) => x.label === r[0])!.id];
      header.slice(1, 7).forEach((h: string, i: number) => {
        expect(ours.find((c) => c.year === yearOf(h)), `${r[0]} ${h}`).toEqual({ year: yearOf(h), as: asOf(h), value: r[1 + i] });
        compared++;
      });
    }
    expect(compared).toBe(37 * 6);
  });

  it('Lafayette: both books, with the two places our column word differs from the workbook, each for a reason', () => {
    // The FY 2024-25 book heads its FY 2023-24 column "Actual" (pp.19, 32); the workbook calls it "est.". The FY 2026-27
    // book keeps the heading "Proposed" though the Council adopted it (the site calls that year adopted throughout).
    const word: Record<string, HistoryAs | null> = { 'FY2023/24 est.': 'actual', 'FY2026/27 proposed': 'adopted' };
    let compared = 0;
    for (const [label, , cols, src, page] of workbook.Lafayette.rows) {
      // The workbook's L0 is our S7.
      const row = data.lafayette.spec.rows.find((x) => x.source === (src === 'L0' ? 'S7' : src) && x.page === page)!;
      expect(row.label, label).toBe(/revenue/.test(label) ? 'TOTAL GENERAL FUND REVENUE' : 'Subtotal General Fund');
      for (const [h, v] of Object.entries(cols) as [string, number][]) {
        const as = h in word ? word[h] : asOf(h);
        if (!as) continue;
        expect(built.lafayette.values[row.id].find((c) => c.year === yearOf(h)), `${row.id} ${h}`).toEqual({ year: yearOf(h), as, value: v });
        compared++;
      }
    }
    expect(compared).toBe(3 + 3 + 4 + 4);
  });

  it("Berkeley: the annual report's six lines, FY2021–FY2025, and the budget's two totals", () => {
    let compared = 0;
    for (const [book, label, cols, , page] of workbook.Berkeley.rows) {
      const row = data.berkeley.spec.rows.find((x) => (book === 'ACFR' ? x.source === 'S39' && x.label === label : x.source === 'S42' && x.page === page))!;
      for (const [h, v] of Object.entries(cols) as [string, number][]) {
        expect(built.berkeley.values[row.id].find((c) => c.year === yearOf(h)), `${row.id} ${h}`).toEqual({ year: yearOf(h), as: asOf(h), value: v });
        compared++;
      }
    }
    expect(compared).toBe(6 * 5 + 5 + 3);
  });

  it('Lafayette transfers (not in the workbook): the reserve standard pages, FY2023 to FY2027', () => {
    expect(built.lafayette.values['s7-transfers']).toEqual([
      { year: 2023, as: 'actual', value: 575_516 },
      { year: 2024, as: 'actual', value: 1_163_894 },
    ]);
    expect(built.lafayette.values['s1-transfers']).toEqual([
      { year: 2025, as: 'actual', value: 3_215_751 },
      { year: 2026, as: 'estimate', value: 2_644_037 },
      { year: 2027, as: 'adopted', value: 2_086_539 },
    ]);
  });

  it('every point the page draws cites its row, and the row is on the cited page with the figure in it', () => {
    for (const c of CITIES) {
      const panels = data[c].budget.history!.panels;
      expect(panels.length, c).toBeGreaterThan(0);
      for (const s of panels.flatMap((p) => p.lines.flatMap((l) => l.series))) {
        expect(() => checkQuote(s.cite, data[c].excerpts, c)).not.toThrow();
        const unit = c === 'fremont' ? 1000 : 1;
        for (const v of Object.values(s.years)) expect(s.cite.quote, `${c} ${s.label}`).toContain((Math.abs(v) / unit).toLocaleString('en-US'));
      }
    }
  });
});

describe("the workbook's tie-outs, run on every build", () => {
  const count = (c: CityId, re: RegExp) => built[c].ties.filter((t) => re.test(t.name)).length;

  it('Fremont: the workbook’s 35 (five per year, and four year-to-year), plus contingency + uncertainty = reserved', () => {
    expect(count('fremont', /^Total Revenues = Property Tax \+/)).toBe(6);
    expect(count('fremont', /^Total Sources = Beginning Unreserved Fund Balance \+ Total Revenues \+ Transfers In,/)).toBe(6);
    expect(count('fremont', /^Total Expenditures = City Council \+/)).toBe(6);
    expect(count('fremont', /^Total Uses = Total Expenditures \+ Transfers Out,/)).toBe(6);
    expect(count('fremont', /^Total Ending Fund Balance = Reserved Fund Balance \+ Unreserved Fund Balance,/)).toBe(6);
    expect(count('fremont', /^Unreserved Fund Balance FY\d+ = Beginning Unreserved Fund Balance FY\d+$/)).toBe(5);
    expect(count('fremont', /^Reserved Fund Balance = Contingency Reserve \+ Budget Uncertainty Reserve,/)).toBe(6);
    expect(built.fremont.ties).toHaveLength(41);
    expect(built.fremont.ties.every((t) => t.ties)).toBe(true);
  });

  it('Lafayette: FY2023-24 in the FY2024-25 book = FY2023-24 in the FY2026-27 book, revenue and expenditures', () => {
    expect(built.lafayette.ties.map((t) => [t.name, t.left, t.ties])).toEqual([
      ['TOTAL GENERAL FUND REVENUE (S7) = TOTAL GENERAL FUND REVENUE (S1), FY2024', 20_546_997, true],
      ['Subtotal General Fund (S7) = Subtotal General Fund (S1), FY2024', 16_808_802, true],
    ]);
  });

  it("Berkeley: 14 tie and the restatement doesn't, declared with its reason", () => {
    expect(count('berkeley', /^Operating surplus\/\(deficit\) = Revenues \+ Expenditures \+ Other financing sources \(uses\), FY\d+ actual$/)).toBe(5);
    expect(count('berkeley', /^Ending fund balance = Beginning fund balance as restated \+ Operating surplus\/\(deficit\), FY\d+ actual$/)).toBe(5);
    expect(count('berkeley', /^Ending fund balance FY\d+ = Beginning fund balance as restated FY\d+$/)).toBe(4);
    expect(count('berkeley', /^Grand Total \(S42\) = Grand Total \(S42\), FY2026$/)).toBe(1);
    expect(built.berkeley.ties.filter((t) => !t.ties)).toEqual([
      {
        name: 'Ending fund balance FY2024 = Beginning fund balance as restated FY2025',
        left: 153_029_258,
        right: 152_752_975,
        ties: false,
        differs: 'The report begins FY2025 from a fund balance "as restated", not from FY2024\'s ending balance.',
      },
    ]);
  });

  it('all three: 52 of the workbook, 51 tie; ours adds 6 for Fremont', () => {
    const all = CITIES.flatMap((c) => built[c].ties);
    expect(all).toHaveLength(52 + 6);
    expect(all.filter((t) => t.ties)).toHaveLength(51 + 6);
  });
});

describe('broken on purpose', () => {
  const rowOf = (s: HistorySpec, id: string) => s.rows.find((r) => r.id === id)!;

  it('a quote from another row is not on the page', () => {
    const errors = run('fremont', (s) => Object.assign(rowOf(s, 'sales-tax'), { quote: rowOf(s, 'property-tax').quote.replace('Property Tax', 'Sales Tax') })).errors;
    expect(errors).toContainEqual(expect.stringMatching(/^fremont history row sales-tax: "Sales Tax 118,943 .*" is not on S1 page 95$/));
  });

  it('a misread figure fails its tie-out: Sales Tax read in the wrong column order breaks the revenue sum in every year', () => {
    const errors = run('fremont', (s) => rowOf(s, 'sales-tax').columns.reverse()).errors;
    expect(errors.filter((e) => /"Total Revenues = Property Tax \+ .*" doesn't tie/.test(e))).toHaveLength(6);
  });

  it('the tie-outs hold to the dollar, as the workbook\'s: Other Revenues read 0.1% high ($52 to $111) fails the revenue sum every year', () => {
    const errors = run('fremont', (s) => (rowOf(s, 'other-revenues').unit = 1001)).errors;
    expect(errors.filter((e) => /"Total Revenues = Property Tax \+ .*" doesn't tie/.test(e))).toHaveLength(6);
  });

  it('a row left out of its sum fails that sum every year, and is reported as unchecked', () => {
    const errors = run('fremont', (s) => {
      const tie = s.ties.find((t) => t.kind === 'sum' && t.equals === 'total-expenditures') as { rows: string[] };
      tie.rows = tie.rows.filter((r) => r !== 'debt-service');
    }).errors;
    expect(errors.filter((e) => e.includes("Total Expenditures = City Council + ") && e.includes("doesn't tie"))).toHaveLength(6);
    expect(errors).toContain('fremont history: row debt-service is neither drawn nor tied');
  });

  it('a figure in the wrong column: shifting the columns breaks the year-to-year tie', () => {
    const errors = run('berkeley', (s) => {
      rowOf(s, 'acfr-ending').columns = [...rowOf(s, 'acfr-ending').columns.slice(1), { year: 2020, as: 'actual' }];
    }).errors;
    expect(errors.length).toBeGreaterThan(4);
  });

  it('the restatement, undeclared, fails; a declared difference that ties fails too, so the list cannot go stale', () => {
    const tie = (s: HistorySpec) => s.ties.find((t) => t.kind === 'next') as { differs?: Record<string, string> };
    expect(run('berkeley', (s) => delete tie(s).differs).errors).toEqual([
      'berkeley history: "Ending fund balance FY2024 = Beginning fund balance as restated FY2025" doesn\'t tie: 153,029,258 vs 152,752,975',
    ]);
    expect(run('berkeley', (s) => (tie(s).differs!['2023'] = 'no reason')).errors).toEqual([
      'berkeley history: "Ending fund balance FY2023 = Beginning fund balance as restated FY2024" is declared as differing, but it ties; remove it from differs',
    ]);
  });

  it("Berkeley's budget figures can't join the annual report's line: a panel draws only its own documents", () => {
    const errors = run('berkeley', (s) => s.panels[0].lines[1].from.push({ row: 'budget-expenditures' })).errors;
    expect(errors).toContain("berkeley history panel results line spending: row budget-expenditures is from S42, which isn't one of this panel's documents (S39)");
  });

  it('a line takes one figure a year: both Lafayette books print FY2023-24, so the earlier book is limited to its first years', () => {
    const errors = run('lafayette', (s) => delete s.panels[0].lines[0].from[0].years).errors;
    expect(errors).toEqual(['lafayette history panel budget line revenue: two figures for FY2024 (rows s7-revenue and s1-revenue); a line draws one figure a year']);
  });

  it('a quote that prints a different number of figures than its columns, or that starts with another label, fails (once)', () => {
    expect(run('lafayette', (s) => rowOf(s, 's1-transfers').columns.pop()).errors).toEqual(['lafayette history row s1-transfers: the quote prints 3 figures; columns lists 2']);
    expect(run('lafayette', (s) => (rowOf(s, 's1-transfers').label = 'Subtotal General Fund')).errors).toEqual([
      'lafayette history row s1-transfers: the quote doesn\'t start with its label "Subtotal General Fund"',
    ]);
  });

  it('a note with a number its quote lacks fails', () => {
    expect(run('fremont', (s) => (s.panels[0].notes![0].text = s.panels[0].notes![0].text.replace('FY 2022/23', 'FY 2021/22'))).errors).toEqual([
      "fremont history panel budget note 1: 2021 isn't in a quote it cites",
    ]);
  });
});

describe('reading a printed row', () => {
  it('dollar signs, parentheses for negatives, a dash for zero, and no percents', () => {
    expect(printedFigures(' $ 27,102 $ (19,700) - 3.1% 575,516')).toEqual([27102, -19700, 0, 575516]);
  });
});

describe('the chart (lib/history)', () => {
  const fy = (y: number) => `FY${y}`;

  it('round gridlines up to the largest figure', () => {
    expect(ticksFor(285_841_172)).toEqual([0, 100e6, 200e6, 300e6]);
    expect(ticksFor(25_225_308)).toEqual([0, 10e6, 20e6, 30e6]);
    expect(ticksFor(0)).toEqual([0]);
  });

  it("Berkeley: two panels, the report's and the budget's, and no line has figures from both", () => {
    const panels = historyPanels(data.berkeley.budget, fy);
    expect(panels.map((p) => [p.id, p.charts.map((c) => c.kind)])).toEqual([
      ['results', ['flow', 'balance']],
      ['budget', ['flow']],
    ]);
    for (const p of panels) for (const l of p.lines) expect(new Set(l.points.map((pt) => pt.figure.ref.source)).size, `${p.id} ${l.id}`).toBe(1);
  });

  it("marks only the budget panel's revenue as covered by its spending (within $981K every year)", () => {
    const charts = CITIES.flatMap((c) => historyPanels(data[c].budget, fy).flatMap((p) => p.charts.map((ch) => [c, p.id, ch.kind, ch.under])));
    expect(charts.filter(([, , , u]) => u)).toEqual([['berkeley', 'budget', 'flow', { line: 'revenue', over: 'spending', gap: 981_220 }]]);
  });

  it("the restatement's difference is built from its two figures", () => {
    const [a] = historyPanels(data.berkeley.budget, fy)[0].adjustments;
    expect(a.figure.value).toBe(276_283);
    expect(a.figure.parts).toEqual([
      { label: 'Ending fund balance, FY2024', value: 153_029_258 },
      { label: 'Beginning fund balance as restated, FY2025', value: -152_752_975 },
    ]);
  });
});

describe('Lafayette sources (#64)', () => {
  it('the FY 2024-25 book is S7, after coverage.json’s S5 and S6, which keep their numbers; the Measure H page is S8 (#66)', () => {
    expect(data.lafayette.budget.sources.map((s) => [s.id, s.type])).toEqual([
      ['S1', 'city'],
      ['S2', 'city'],
      ['S3', 'city'],
      ['S4', 'city'],
      ['S5', 'other'],
      ['S6', 'other'],
      ['S7', 'city'],
      ['S8', 'city'],
    ]);
    expect(data.lafayette.budget.sources.find((s) => s.id === 'S7')!.url).toBe('https://www.lovelafayette.org/home/showpublisheddocument/8038/638723780789770000');
  });

  it('a source numbered back into the files before it fails', () => {
    expect(numberFromIds([{ id: 'S1' }, { id: 'S7' }, { id: 'S3' }], 1, 'documents.json').errors).toEqual([
      'documents.json: source 3 is S3, expected S8 or later (it continues the numbering)',
    ]);
  });
});
