/**
 * #65: what staff cost. Every figure is parsed from a quote on its cited page and equals the workbook Jeremy approved
 * (tests/fixtures/staff-costs-rows-65.json, the PM's rows); the workbook's tie-outs run on every build; a block draws
 * from one document only, so no figure sits beside one on another basis. Each rule is also broken on purpose.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { normalize, type Excerpts } from '../../src/data/documents';
import { readDocuments } from '../../src/data/pipeline';
import { applyStaffCosts, printedNumbers, type StaffCostsSpec } from '../../src/data/staff-costs';
import type { CityBudget, StaffAs } from '../../src/data/types';
import { fy } from '../../src/lib/city-settings';
import { staffCostsView } from '../../src/lib/staff-costs';

const root = join(import.meta.dirname, '../..');
const CITIES = ['berkeley', 'fremont', 'lafayette'] as const;
type CityId = (typeof CITIES)[number];
type PmRow = [string, string, string, number | string, string, string, string, number | null, number | null, string];
const workbook: PmRow[] = JSON.parse(readFileSync(join(root, 'tests/fixtures/staff-costs-rows-65.json'), 'utf8'));
const data = {} as Record<CityId, { budget: CityBudget; spec: StaffCostsSpec; excerpts: Excerpts }>;
const run = (c: CityId, edit: (s: StaffCostsSpec) => void = () => {}) => {
  const spec = structuredClone(data[c].spec);
  edit(spec);
  return applyStaffCosts({ ...data[c].budget, staffCosts: undefined }, spec, data[c].excerpts, c);
};
let built: Record<CityId, ReturnType<typeof applyStaffCosts>>;

beforeAll(async () => {
  for (const c of CITIES) {
    const dir = join(root, 'data/cities/us/ca', c);
    const { file, excerpts } = await readDocuments(dir);
    data[c] = { budget: JSON.parse(readFileSync(join(dir, 'budget.json'), 'utf8')), spec: (file as unknown as { staffCosts: StaffCostsSpec }).staffCosts, excerpts };
  }
  built = Object.fromEntries(CITIES.map((c) => [c, run(c)])) as typeof built;
});

/** The workbook's source names, as ours number them. */
const SOURCE: Record<string, string> = { 'Item21-Supp2': 'S43', 'BFPC-2026-01-22': 'S44', S39: 'S39', S1: 'S1', S3: 'S3' };
/** Where each of the workbook's measures is in our rows: the row, and the column its period names. */
const where = (city: string, measure: string, period: string): { row: string; col: string } => {
  const year = /FY(\d{4})(?:\/(\d{2}))?/.exec(period);
  const y = year ? String(year[2] ? 2000 + Number(year[2]) : Number(year[1])) : '';
  const june = /June 30, (\d{4})/.exec(period)?.[1];
  if (city === 'Berkeley') {
    const row = { 'General Fund salaries & benefits': 's43-pay', 'General Fund grand total': 's43-total' }[measure];
    if (row) return { row, col: y };
    if (measure.startsWith('Pension normal')) return { row: 's44-normal', col: y };
    if (measure.startsWith('Pension unfunded')) return { row: 's44-ual', col: y };
    return { row: measure.startsWith('Net pension') ? 's39-pension' : 's39-opeb', col: `total-${june}` };
  }
  if (city === 'Fremont') {
    const plan = measure.startsWith('OPEB') ? 'opeb' : 'pension';
    const what = [
      ['unfunded accrued liability', 'ual'],
      ['funded ratio', 'ratio'],
      ['normal cost', 'normal'],
      ['unfunded-liability contribution', 'ual-contribution'],
      ['actuarially determined contribution', 'adc'],
      ['additional ual', 'additional'],
      ['administrative', 'admin'],
      ['total employer', 'total'],
    ].find(([k]) => measure.toLowerCase().includes(k))![1];
    return { row: `${plan}-${what}`, col: plan === 'opeb' ? 'value' : 'combined' };
  }
  if (measure.startsWith('City payroll')) return { row: 'retirement', col: 'payroll' };
  const row = measure.startsWith('General Fund personnel') ? 'personnel' : measure.startsWith('Contract Sheriff') ? 'sheriff' : 'total';
  return { row, col: /final budget/.test(period) ? 'final' : y };
};
/** The workbook's word for a period, as ours names it. */
const asOf = (period: string): StaffAs => (/est\.$/.test(period) ? 'estimate' : (/(actual|adopted|proposed|baseline)$/.exec(period)![1] as StaffAs));

describe('every figure equals the approved workbook (#65)', () => {
  it('builds with no errors, for every city', () => {
    for (const c of CITIES) expect(built[c].errors, c).toEqual([]);
  });

  it("every workbook figure, by the row and column it's printed in", () => {
    let compared = 0;
    for (const [city, measure, period, value, unit, , , , , quote] of workbook) {
      if (typeof value !== 'number') continue;
      const c = city.toLowerCase() as CityId;
      const { row, col } = where(city, measure, period);
      if (col === 'final') {
        // Lafayette's FY 2025-26 final budget: printed, but the page uses the estimate beside it (as #64 does).
        const r = data.lafayette.spec.rows.find((x) => x.id === row)!;
        expect(printedNumbers(r.quote.slice(r.label.length))[2].value, `${measure} ${period}`).toBe(value);
      } else expect(built[c].values[row]?.[col], `${city} ${measure} ${period}`).toEqual(unit === '%' ? { value: Number((value / 100).toFixed(6)), percent: true } : { value, percent: false });
      // The workbook's quote is the same printed row (less its note on units).
      const r = data[c].spec.rows.find((x) => x.id === row)!;
      expect(normalize(r.quote), `${measure}`).toContain(normalize(quote.replace(/ \((thousands|\$ in millions)[^)]*\)$/, '')));
      compared++;
    }
    expect(compared).toBe(22 + 13 + 16);
  });

  it("Lafayette's ACFR figures, from the sentence and the table they're printed in", () => {
    expect(built.lafayette.values.retirement).toEqual({
      payroll: { value: 5_667_041, percent: false },
      city: { value: 842_472, percent: false },
      employees: { value: 276_236, percent: false },
    });
    expect(built.lafayette.values.opeb).toEqual({
      governmental: { value: 758_015, percent: false },
      business: { value: 90_539, percent: false },
      total: { value: 848_554, percent: false },
    });
    for (const [city, measure, , , , , src, page, , quote] of workbook)
      if (city === 'Lafayette' && src === 'S3') expect(normalize(data.lafayette.excerpts.S3[String(page)]), measure).toContain(normalize(quote));
  });

  it("every bar's year has the column word the workbook gives it, with one declared exception", () => {
    // Lafayette's FY 2026-27 book keeps the heading "Proposed"; the site calls the adopted year adopted throughout (#64).
    let compared = 0;
    for (const [city, measure, period, value] of workbook) {
      // The measures drawn as bars by year: Berkeley's pay and pension split, Lafayette's personnel and Sheriff contract.
      if (typeof value !== 'number' || !/salaries & benefits|^Pension normal|^Pension unfunded-liability payment|personnel|Sheriff/.test(measure)) continue;
      if (/final budget/.test(period) || city === 'Fremont') continue;
      const c = city.toLowerCase() as CityId;
      const { row, col } = where(city, measure, period);
      const period_ = data[c].budget.staffCosts!.sections.flatMap((s) => s.bars?.periods ?? []).find((p) => p.year === Number(col) && p.parts.some((x) => x.cite.quote === data[c].spec.rows.find((r) => r.id === row)!.quote))!;
      expect(period_.as, `${city} ${measure} ${period}`).toBe(city === 'Lafayette' && /proposed$/.test(period) ? 'adopted' : asOf(period));
      compared++;
    }
    expect(compared).toBe(5 + 8 + 8);
  });

  it("Fremont: what the budget doesn't publish is said, not estimated", () => {
    const [row] = workbook.filter(([city, , , value]) => city === 'Fremont' && value === 'not published');
    expect(row[1]).toBe('General Fund salaries and benefits');
    expect(data.fremont.budget.staffCosts!.unpublished).toEqual(["Fremont's budget doesn't publish a General Fund total for salaries and benefits."]);
  });
});

describe("the workbook's tie-outs, run on every build", () => {
  const names = (c: CityId) => built[c].ties.map((t) => t.name);

  it("the workbook's five: Fremont's three contribution sums (combined) and Berkeley's two printed shares", () => {
    expect(names('fremont')).toContain('Actuarial Determined Contributions (ADC) = Normal Cost + Unfunded Liability Contribution, combined');
    expect(names('fremont')).toContain('Total Employer Contribution = Actuarial Determined Contributions (ADC) + Additional UAL Contribution, combined');
    expect(names('fremont')).toContain('Total Employer Contribution = Normal Cost + Administrative Expenses + Unfunded Liability Contribution, value');
    expect(built.berkeley.ties.filter((t) => t.name.includes('rounds to the printed'))).toEqual([
      { name: 'Salaries & Benefits ÷ Grand Total, 2027, rounds to the printed 66%', left: 66, right: 66, ties: true },
      { name: 'Salaries & Benefits ÷ Grand Total, 2028, rounds to the printed 67%', left: 67, right: 67, ties: true },
    ]);
  });

  it('and the ones the pages make free: categories to Grand Total, Miscellaneous + Safety = Combined, governmental + business-type = total', () => {
    expect(built.berkeley.ties).toHaveLength(5 + 2 + 4);
    expect(built.fremont.ties).toHaveLength(3 * 3 + 1 + 1 + 8);
    expect(built.lafayette.ties).toHaveLength(4 + 4 + 1);
    for (const c of CITIES) expect(built[c].ties.filter((t) => !t.ties), c).toEqual([]);
  });
});

describe('broken on purpose', () => {
  const rowOf = (s: StaffCostsSpec, id: string) => s.rows.find((r) => r.id === id)!;
  const section = (s: StaffCostsSpec, id: string) => s.sections.find((x) => x.id === id)!;

  it('a share the City prints is checked to the whole percent, and must be in its quote', () => {
    expect(
      run('berkeley', (s) => {
        const t = s.ties.find((x) => x.kind === 'share' && x.col === '2027') as { percent: number };
        t.percent = 67;
      }).errors,
    ).toEqual(['berkeley staffCosts: "Salaries & Benefits ÷ Grand Total, 2027, rounds to the printed 67%" doesn\'t tie: 66% vs 67%']);
    expect(
      run('berkeley', (s) => {
        const t = s.ties.find((x) => x.kind === 'share' && x.col === '2027') as { printed: { quote: string } };
        t.printed.quote = 'Salaries & Benefit account for';
      }).errors,
    ).toEqual(['berkeley staffCosts: "Salaries & Benefits ÷ Grand Total, 2027, rounds to the printed 66%": the quote doesn\'t print 66%']);
  });

  it('a column read out of order breaks Miscellaneous + Safety = Combined', () => {
    const errors = run('fremont', (s) => (rowOf(s, 'pension-normal').columns = ['miscellaneous', 'combined', 'safety'])).errors;
    expect(errors).toContain('fremont staffCosts: "Normal Cost: miscellaneous + safety = combined" doesn\'t tie: 29,128,000 vs 12,224,000');
  });

  it("a block can't draw from two documents: Berkeley's budget pay beside the annual report's liabilities", () => {
    const errors = run('berkeley', (s) => section(s, 'liabilities').figures!.push({ name: 'Salaries', asOf: 'FY2027', ref: { row: 's43-pay', col: '2027' } })).errors;
    expect(errors).toEqual(['berkeley staffCosts section liabilities: draws from S39 and S43; a section\'s figures come from one document, on one basis']);
  });

  it("a stacked bar's parts must add up to the total it prints", () => {
    const errors = run('fremont', (s) => {
      const bars = section(s, 'pension').bars!;
      bars.legend.pop();
      bars.periods[0].parts.pop();
    }).errors;
    expect(errors).toEqual(['fremont staffCosts section pension FY2027: the parts add up to 63,795,000, not the total 65,234,000']);
  });

  it('a row missing from its sum fails the sum, and is reported as unchecked', () => {
    const errors = run('lafayette', (s) => {
      const t = s.ties.find((x) => x.kind === 'sum' && x.equals === 'base') as { rows: string[] };
      t.rows = t.rows.filter((r) => r !== 'capital');
    }).errors;
    expect(errors.filter((e) => e.includes("doesn't tie"))).toHaveLength(4);
    expect(errors).toContain('lafayette staffCosts: row capital is neither drawn nor tied');
  });

  it('a "not published" sentence with a figure in it fails: absence is said, never estimated', () => {
    expect(run('fremont', (s) => s.unpublished!.push('About $100M of the General Fund is pay.')).errors).toEqual([
      'fremont staffCosts: "About $100M of the General Fund is pay." says what isn\'t published, so it can\'t hold a figure',
    ]);
  });

  it('a figure-count mismatch and a label mismatch fail', () => {
    expect(run('berkeley', (s) => rowOf(s, 's44-ual').columns.pop()).errors[0]).toBe('berkeley staffCosts row s44-ual: the quote prints 4 figures; columns lists 3');
    expect(run('berkeley', (s) => (rowOf(s, 's44-ual').label = 'Normal Cost')).errors[0]).toBe('berkeley staffCosts row s44-ual: the quote doesn\'t start with its label "Normal Cost"');
  });

  it("a note's number must be in a quote it cites", () => {
    const errors = run('lafayette', (s) => (section(s, 'retirement').basis.text += ' The City contributes 15%.')).errors;
    expect(errors).toEqual(["lafayette staffCosts section retirement basis: 15 isn't in a quote it cites"]);
  });
});

describe('reading a printed row', () => {
  it('millions with cents, percents, a minus percent after a dollar figure, and a figure ending a sentence', () => {
    expect(printedNumbers(' $17.72 $19.25')).toEqual([
      { value: 17.72, percent: false },
      { value: 19.25, percent: false },
    ]);
    expect(printedNumbers(' $7,096,466 -0.8% 70.4%')).toEqual([
      { value: 7096466, percent: false },
      { value: -0.8, percent: true },
      { value: 70.4, percent: true },
    ]);
    expect(printedNumbers(' was approximately $5,667,041. Contributions (520,168) -')).toEqual([
      { value: 5667041, percent: false },
      { value: -520168, percent: false },
      { value: 0, percent: false },
    ]);
  });

  it('a deck in millions is read to the dollar: $17.72 million is 17,720,000', () => {
    expect(built.berkeley.values['s44-normal']['2025']).toEqual({ value: 17_720_000, percent: false });
  });
});

describe('the section (lib/staff-costs)', () => {
  const view = (c: CityId) => {
    const { labels } = JSON.parse(readFileSync(join(root, 'data/cities/us/ca', c, 'city.json'), 'utf8')).budget;
    return staffCostsView(data[c].budget, (y) => fy(labels, y))!;
  };

  it("Berkeley's share is shown whole, with the division in its receipt", () => {
    const fy27 = view('berkeley').sections[0].bars!.rows.find((r) => r.year === 2027)!;
    expect(fy27.segments[0].share!.text).toBe('66%');
    expect(fy27.segments[0].share!.figure.label).toBe('Salaries and benefits as a share of grand Total, FY2027 proposed: $207,920,092 ÷ $313,917,287');
  });

  it("a total the City prints is its receipt (Fremont); one it doesn't is built from the parts (Berkeley's pension)", () => {
    const fremont = view('fremont').sections[0].bars!.rows[0].total!.figure;
    expect([fremont.value, fremont.parts, fremont.ref]).toEqual([65_234_000, undefined, expect.objectContaining({ page: 45, quote: 'Total Employer Contribution $ 22,586 $ 42,648 $ 65,234' })]);
    const berkeley = view('berkeley').sections[1].bars!.rows[0].total!.figure;
    expect([berkeley.value, berkeley.parts]).toEqual([
      51_800_000,
      [
        { label: 'Normal cost', value: 17_720_000 },
        { label: 'Unfunded-liability payment', value: 34_080_000 },
      ],
    ]);
  });

  it('a figure on its own under $1M is shown to the dollar, as the City prints it', () => {
    expect(view('lafayette').sections[1].figures.map((f) => f.text)).toEqual(['$842,472', '$758,015']);
    expect(view('fremont').sections[0].figures.map((f) => f.text)).toEqual(['$477.3M', '70.4%']);
  });
});
