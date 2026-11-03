/**
 * #66: money voters set aside. Every amount is parsed from a quote on its cited page and equals the workbook Jeremy
 * approved (tests/fixtures/voter-taxes-rows-66.json, the PM's v2 rows); every purpose and approval is the workbook's
 * quote; a cell the workbook leaves blank is "not in the City's documents we use", never estimated; and a tax's group
 * is what its own kind quote says. Each rule is also broken on purpose.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { normalize, type Excerpts } from '../../src/data/documents';
import { readDocuments } from '../../src/data/pipeline';
import type { CityBudget, VoterTax } from '../../src/data/types';
import { applyVoterTaxes, type VoterTaxesSpec, type VoterTaxSpec } from '../../src/data/voter-taxes';
import { voterTaxesView } from '../../src/lib/voter-taxes';

const root = join(import.meta.dirname, '../..');
const CITIES = ['berkeley', 'fremont', 'lafayette'] as const;
type CityId = (typeof CITIES)[number];
type V2Row = [string, string, string, string, string, string, string, number, string, string, string, string, string];
const v2: { header: string[]; rows: V2Row[] } = JSON.parse(readFileSync(join(root, 'tests/fixtures/voter-taxes-rows-66.json'), 'utf8'));
const data = {} as Record<CityId, { budget: CityBudget; spec: VoterTaxesSpec; excerpts: Excerpts }>;
const run = (c: CityId, edit: (s: VoterTaxesSpec) => void = () => {}) => {
  const spec = structuredClone(data[c].spec);
  edit(spec);
  return applyVoterTaxes({ ...data[c].budget, voterTaxes: undefined }, spec, data[c].excerpts, c);
};
const tax = (s: VoterTaxesSpec, id: string) => s.taxes.find((t) => t.id === id)! as VoterTaxSpec & Record<string, unknown>;
let built: Record<CityId, ReturnType<typeof applyVoterTaxes>>;

beforeAll(async () => {
  for (const c of CITIES) {
    const dir = join(root, 'data/cities/us/ca', c);
    const { file, excerpts } = await readDocuments(dir);
    data[c] = { budget: JSON.parse(readFileSync(join(dir, 'budget.json'), 'utf8')), spec: (file as unknown as { voterTaxes: VoterTaxesSpec }).voterTaxes, excerpts };
  }
  built = Object.fromEntries(CITIES.map((c) => [c, run(c)])) as typeof built;
});

/** The workbook's tax names, as our ids. */
const ID: Record<string, string> = {
  'City Street Lighting': 'street-lighting',
  'Maintenance of City Parks, Trees & Landscaping': 'parks',
  'City Library Services': 'library',
  'City Library Services – Library Relief Act (Measure X of 2024)': 'library-x',
  'Paramedic Supplemental Tax (Emergency Medical Services)': 'paramedic',
  'Emergency Services for the Severely Disabled': 'severely-disabled',
  'Fire Protection and Emergency Response and Preparedness Tax (Measure GG of 2008)': 'gg',
  'Fire, Emergency Services and Wildfire Prevention Tax (Measure FF of 2020)': 'ff-2020',
  'SAFE STREETS Initiative (Measure FF of 2024)': 'safe-streets',
  'Property Transfer Tax - Measure P': 'measure-p',
  'Measure U1': 'measure-u1',
  'Property Transfer Tax - Measure W': 'measure-w',
  'Paramedic Tax': 'paramedic',
  'General obligation bonds (property tax levy)': 'go-bonds',
  'Measure H (1/2 cent sales tax)': 'measure-h',
};
const ours = (row: V2Row): VoterTax => {
  const c = row[0].toLowerCase() as CityId;
  const t = built[c].budget.voterTaxes!.taxes.find((x) => x.id === ID[row[1]]);
  if (!t) throw new Error(`no tax for the workbook's ${row[0]} ${row[1]}`);
  return t;
};
const num = (s: string) => Number(s.replace(/[$,]/g, ''));
/**
 * The workbook's FY2027 amount: the levy ordinance's sentence ("collections of $23,463,242"); else the budget row in
 * the rate column, read as the workbook's parenthesis says (FinSum's FY2027 proposed column, where "-" is FY2026's
 * nothing for Measure W; Fremont's last column, in
 * thousands; Lafayette's "$3,321,356"). Null where the workbook has none.
 */
const v2Amount = (row: V2Row): number | null => {
  const [, , , , , rate, src, , , amount] = row;
  if (amount) return num(/\$([\d,]+)/.exec(amount)![1]);
  if (src.startsWith('FinSum')) return num(rate.split('(')[0].slice(row[1].length).match(/(?<= )-(?= )|[\d,]{5,}/g)![1]);
  if (/\$ thousands/.test(rate)) return num(rate.split('(')[0].match(/[\d,]+/g)!.at(-1)!) * 1000;
  const dollars = /\$([\d,]{5,})/.exec(rate);
  return dollars ? num(dollars[1]) : null;
};

describe('every figure and quote equals the approved workbook (#66)', () => {
  it('builds with no errors, for every city, and covers every workbook row', () => {
    for (const c of CITIES) expect(built[c].errors, c).toEqual([]);
    expect(v2.rows).toHaveLength(15);
    expect(new Set(v2.rows.map((r) => `${r[0]} ${ID[r[1]]}`)).size).toBe(15);
    expect(CITIES.reduce((n, c) => n + built[c].budget.voterTaxes!.taxes.length, 0)).toBe(15);
  });

  it('every FY2027 amount, parsed from its quote', () => {
    let compared = 0;
    for (const row of v2.rows) {
      const want = v2Amount(row);
      const t = ours(row);
      expect(t.amount?.value ?? null, `${row[0]} ${row[1]}`).toBe(want);
      if (want !== null) {
        // The amount's digits are in its own quote: a figure typed in would not be.
        const digits = t.amount!.cite.quote.replace(/,/g, '');
        expect(digits.includes(String(want)) || digits.includes(String(want / 1000)), row[1]).toBe(true);
        compared++;
      }
    }
    expect(compared).toBe(13);
  });

  it("every purpose is the workbook's quote, word for word", () => {
    for (const row of v2.rows) {
      const t = ours(row);
      if (!row[4]) continue;
      // Some workbook cells also hold the approval sentence ("Measure GG was passed by Berkeley voters in November
      // 2008."), or Lafayette's dates, which "Approved" shows; the purpose is the rest, word for word.
      expect(normalize(row[4]).includes(normalize(t.purpose!.quote)), row[1]).toBe(true);
      expect(t.purpose!.quote.length).toBeGreaterThan(40);
    }
  });

  it("P and W: the purpose the workbook leaves blank is the City's measure page, and their kind is the ballot's \"general\"", () => {
    for (const id of ['measure-p', 'measure-w']) {
      const t = built.berkeley.budget.voterTaxes!.taxes.find((x) => x.id === id)!;
      expect(t.purpose).toEqual({ source: 'S54', quote: 'Measures P and W fund homeless services through a property transfer tax on the top 1/3 most expensive properties.' });
      expect(t.kind.source).toBe('S54');
      expect(t.kind.quote).toMatch(/\bgeneral (municipal purposes|tax)\b/);
    }
  });

  it("every approval and kind the workbook quotes is in one of ours", () => {
    let compared = 0;
    for (const row of v2.rows) {
      if (!row[11]) continue;
      const t = ours(row);
      const quotes = [t.kind, ...(t.approved?.cites ?? []), ...t.notes.flatMap((n) => n.cites)].map((c) => normalize(c.quote));
      // The workbook's cell is its first sentence, then "…" or the ballot question.
      const first = normalize(row[11].split(/(?<=\.) |;|…| Shall /)[0]);
      expect(quotes.some((q) => q.includes(first)), `${row[1]}: "${first}"`).toBe(true);
      compared++;
    }
    expect(compared).toBe(7);
  });

  it('every rate the workbook prints is in ours; Safe Streets is the ordinance, not the web page', () => {
    for (const row of v2.rows) {
      const t = ours(row);
      if (ID[row[1]] === 'safe-streets') {
        expect(t.rate!.text).toContain('$0.17842');
        expect(t.rate!.text).toContain('$0.26238');
        expect(t.rate!.text).not.toContain('0.17482');
        expect(t.rate!.cites[0]).toMatchObject({ source: 'S53', page: 1 });
        expect(row[8]).toContain('$0.17842');
        continue;
      }
      if (!/^Residential:/.test(row[5])) continue;
      for (const n of row[5].split('(')[0].match(/0\.\d+/g)!) expect(t.rate!.text, row[1]).toContain(`$${n}`);
    }
  });

  it("the cells the workbook leaves blank, and only those, are not in the City's documents", () => {
    const blanks: string[] = [];
    for (const c of CITIES)
      for (const t of built[c].budget.voterTaxes!.taxes)
        for (const cell of ['purpose', 'approved', 'rate', 'amount'] as const) if (t[cell] === null) blanks.push(`${c} ${t.id} ${cell}`);
    expect(blanks).toEqual([
      // The story's two: Street Lighting's amount, and U1's purpose and year.
      'berkeley street-lighting approved',
      'berkeley street-lighting amount',
      'berkeley measure-u1 purpose',
      'berkeley measure-u1 approved',
      // U1's workbook "rate" cell is its budget line, an amount; no source gives its rate.
      'berkeley measure-u1 rate',
      'fremont go-bonds rate',
      'fremont go-bonds amount',
    ]);
    for (const row of v2.rows) {
      const t = ours(row);
      if (t.approved === null) expect([row[2], row[11]], row[1]).toEqual(['', '']);
      if (t.purpose === null) expect(row[4], row[1]).toBe('');
    }
  });
});

describe("Berkeley's $99.7M is our sum of the City's eight estimates", () => {
  it('adds the eight levy ordinances, each its own receipt', () => {
    const sum = built.berkeley.budget.voterTaxes!.specialSum!;
    const eight = v2.rows.filter((r) => r[0] === 'Berkeley' && r[9]).map(v2Amount) as number[];
    expect(eight).toHaveLength(8);
    expect(sum).toMatchObject({ value: eight.reduce((a, b) => a + b, 0), count: 8, as: 'FY2027 estimate' });
    expect(sum.value).toBe(99_718_096);
    expect(sum.cites.map((c) => c.source).sort()).toEqual(['S46', 'S47', 'S48', 'S49', 'S50', 'S51', 'S52', 'S53']);
  });

  it('is labeled as ours, with what it leaves out', () => {
    const special = voterTaxesView(built.berkeley.budget)!.find((g) => g.group === 'special')!;
    expect(special.sum).toMatchObject({ text: '$99.7M', label: "our sum of the City's eight estimates (FY2027 estimate)", missing: ['City Street Lighting'] });
    expect(special.sum!.figure.parts).toHaveLength(8);
    // One special tax, or amounts of different kinds, make no sum: Fremont has one.
    expect(built.fremont.budget.voterTaxes!.specialSum).toBeUndefined();
    const mixed = run('berkeley', (s) => (tax(s, 'gg').amount = { ...(tax(s, 'gg').amount as object), as: 'FY2027 proposed' } as VoterTaxSpec['amount']));
    expect(mixed.errors).toEqual([]);
    expect(mixed.budget.voterTaxes!.specialSum).toBeUndefined();
  });
});

describe('each rule, broken on purpose', () => {
  it('a quote not on its page fails', () => {
    expect(run('berkeley', (s) => ((tax(s, 'parks').purpose as { quote: string }).quote = 'Funds maintenance of parks and pools.')).errors).toEqual([
      'berkeley voterTaxes parks purpose: "Funds maintenance of parks and pools." is not on S45 page 1',
    ]);
    expect(run('fremont', (s) => ((tax(s, 'paramedic').amount as { page: number }).page = 93)).errors[0]).toMatch(/^fremont voterTaxes paramedic amount: .* is not on S1 page 93$/);
  });

  it("an amount that isn't in its quote fails: no figure there, or a label the quote doesn't start with", () => {
    expect(run('berkeley', (s) => ((tax(s, 'library').amount as { figure: number }).figure = 1)).errors).toEqual([
      'berkeley voterTaxes library amount: the quote has no dollar figure 1 after its label',
    ]);
    expect(run('lafayette', (s) => ((tax(s, 'measure-h').amount as { figure: number }).figure = 5)).errors).toEqual([
      'lafayette voterTaxes measure-h amount: the quote has no dollar figure 5 after its label',
    ]);
    expect(run('berkeley', (s) => ((tax(s, 'measure-p').amount as { label: string }).label = 'Measure P')).errors).toEqual([
      'berkeley voterTaxes measure-p amount: the quote doesn\'t start with its label "Measure P"',
    ]);
  });

  it('an amount is read from its column: another column gives another figure, never a typed one', () => {
    const w = run('berkeley', (s) => ((tax(s, 'measure-w').amount as { figure: number }).figure = 2));
    expect(w.errors).toEqual([]);
    expect(w.budget.voterTaxes!.taxes.find((t) => t.id === 'measure-w')!.amount!.value).toBe(3_000_000);
    const typed = run('berkeley', (s) => (tax(s, 'measure-w').amount = { ...(tax(s, 'measure-w').amount as object), value: 9 } as VoterTaxSpec['amount']));
    expect(typed.budget.voterTaxes!.taxes.find((t) => t.id === 'measure-w')!.amount!.value).toBe(1_500_000);
  });

  it("an amount's year must be on its page", () => {
    expect(run('berkeley', (s) => ((tax(s, 'gg').amount as { as: string }).as = 'FY2031 estimate')).errors).toEqual([
      'berkeley voterTaxes gg amount: "FY2031 estimate": 2031 isn\'t on S49 page 4',
    ]);
  });

  it('an unsourced cell that carries a figure fails', () => {
    expect(run('berkeley', (s) => (tax(s, 'street-lighting').amount = { unsourced: true, value: 2_000_000 } as unknown as VoterTaxSpec['amount'])).errors).toEqual([
      "berkeley voterTaxes street-lighting amount: an unsourced cell can't carry anything else",
    ]);
    expect(run('fremont', (s) => (tax(s, 'go-bonds').rate = { unsourced: true, text: '$0.01 per $100' } as unknown as VoterTaxSpec['rate'])).errors).toEqual([
      "fremont voterTaxes go-bonds rate: an unsourced cell can't carry anything else",
    ]);
  });

  it("a tax is grouped by its own kind quote: special says special, general says general, a bond says general obligation", () => {
    expect(run('berkeley', (s) => (tax(s, 'parks').group = 'general')).errors).toEqual([
      `berkeley voterTaxes parks kind: "${tax(data.berkeley.spec, 'parks').kind.quote}" doesn't say it's a general tax`,
    ]);
    expect(run('berkeley', (s) => (tax(s, 'measure-p').group = 'special')).errors).toEqual([
      `berkeley voterTaxes measure-p kind: "${tax(data.berkeley.spec, 'measure-p').kind.quote}" doesn't say it's a special tax`,
    ]);
    expect(run('fremont', (s) => (tax(s, 'paramedic').group = 'bonds')).errors).toEqual([
      `fremont voterTaxes paramedic kind: "${tax(data.fremont.spec, 'paramedic').kind.quote}" doesn't say it's a general obligation bond`,
    ]);
    expect(run('lafayette', (s) => (tax(s, 'measure-h').group = 'special')).errors).toHaveLength(1);
  });

  it("a year or rate in a sentence must be in a quote it cites", () => {
    expect(run('berkeley', (s) => ((tax(s, 'gg').approved as { text: string }).text = 'November 2006')).errors).toEqual([
      "berkeley voterTaxes gg approved: 2006 isn't in a quote it cites",
    ]);
    expect(run('berkeley', (s) => ((tax(s, 'safe-streets').rate as { text: string }).text = '$0.17482 per sq ft (dwelling units), FY 2027')).errors).toEqual([
      "berkeley voterTaxes safe-streets rate: 0.17482 isn't in a quote it cites",
    ]);
  });

  it('two taxes with one id fail', () => {
    expect(run('fremont', (s) => s.taxes.push(structuredClone(s.taxes[0]))).errors).toEqual(['fremont voterTaxes paramedic: two taxes have this id']);
  });
});
