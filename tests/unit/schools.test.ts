/**
 * The school district's budget (#52): schools.json's checks, each broken on purpose against the real
 * BUSD excerpts, so a passing test shows the check runs and not only that the data is good.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ALWAYS_PAGES } from '../../src/data/coverage';
import type { Excerpts } from '../../src/data/documents';
import { buildCity, readDocuments } from '../../src/data/pipeline';
import { amountFrom, applySchools, type SchoolsFile } from '../../src/data/schools';
import type { CityBudget } from '../../src/data/types';
import { allCities } from '../../src/lib/cities';
import { hasPage } from '../../src/lib/city-pages';
import { schoolsFor } from '../../src/lib/schools';

const root = join(import.meta.dirname, '../..');
const dir = join(root, 'data/cities/us/ca/berkeley');
const file: SchoolsFile = JSON.parse(readFileSync(join(dir, 'schools.json'), 'utf8'));
const pages = [...ALWAYS_PAGES, 'schools'];
const berkeley = allCities.find((c) => c.path === '/us/ca/berkeley/')!;
let budget: CityBudget;
let excerpts: Excerpts;

beforeAll(async () => {
  const built = await buildCity(root, 'us/ca/berkeley');
  expect(built.errors).toEqual([]);
  budget = built.budget;
  excerpts = (await readDocuments(dir)).excerpts;
});

/** schools.json's errors after `change` edits a copy of it. */
const errors = (change: (f: SchoolsFile) => void = () => {}, ex: Excerpts = excerpts) => {
  const f = structuredClone(file);
  change(f);
  return applySchools(budget, f, ex, pages).errors;
};
const part = (f: SchoolsFile, id: string) => f.revenue.parts.find((p) => p.id === id)!;
const row = (f: SchoolsFile, id: string) => f.spending.rows.find((p) => p.id === id)!;

describe('schools.json figures', () => {
  it('pass on the real data', () => {
    expect(errors()).toEqual([]);
  });

  it('are read from their quotes: a sentence\'s dollar figure, the one named, or a table row\'s cell', () => {
    expect(amountFrom(file.revenue.total)).toBe(248_200_000);
    expect(amountFrom(part(file, 'lcff').amount)).toBe(122_900_000);
    expect(amountFrom({ ...part(file, 'lcff').amount, figure: 2 })).toBe(116); // "$116.1 base funding": no "million"
    expect(amountFrom(file.revenue.exact)).toBe(248_205_134);
    expect(amountFrom(row(file, 'indirect').amount)).toBe(-643_740);
    expect(() => amountFrom({ ...part(file, 'lcff').amount, figure: undefined })).toThrow(/expected one dollar figure, found 3/);
  });

  it('every quote must be on its page', () => {
    expect(errors((f) => (part(f, 'other-local').amount.page = 16))).toEqual([
      'schools.json revenue other-local amount: "Unrestricted local revenues total $2.3 million and include $0.4 million in leases and rental revenue and $1.9 million in other local revenue." is not on S30 page 16',
    ]);
  });

  it("cite only the district's own documents, never the City's", () => {
    expect(errors((f) => (f.revenue.total.source = 'S20'))).toContain(
      'schools.json revenue total: cites S20, a city source; the school district\'s figures come from its own documents ("other")',
    );
  });

  it('a number typed into the copy must be in a quote it cites', () => {
    expect(errors((f) => (f.balance.paragraphs[1].text = f.balance.paragraphs[1].text.replace('$0.2 million', '$0.3 million')))).toEqual([
      "schools.json balance paragraph 2: 0.3 isn't in any quote it cites",
    ]);
  });

  it('reads "$.2 million" as 0.2', () => {
    // The book prints the third year's deficit as "$.2 million"; the copy writes "$0.2 million".
    expect(file.balance.paragraphs[1].cites![0].quote).toContain('$.2 million');
    expect(file.balance.paragraphs[1].text).toContain('$0.2 million');
    expect(errors().filter((e) => e.includes('balance paragraph 2'))).toEqual([]);
  });
});

describe('reconciliation (#52: "the revenue parts reconcile to the stated total")', () => {
  it('fails when the revenue parts stop adding up to the total: no residual hides the gap', () => {
    // The story's four parts, without BUSD's own $2.3M of unrestricted local revenue (p.19): $245.9M.
    expect(errors((f) => (f.revenue.parts = f.revenue.parts.filter((p) => p.id !== 'other-local')))).toEqual([
      'schools.json revenue: the parts add up to $245.9M, not the total $248.2M',
    ]);
  });

  it("fails when the State form's exact total doesn't round to the narrative's", () => {
    const ex = structuredClone(excerpts);
    ex.S30!['101'] = ex.S30!['101'].replace('248,205,134.00', '248,305,134.00');
    expect(
      errors((f) => (f.revenue.exact.quote = f.revenue.exact.quote.replace('248,205,134.00', '248,305,134.00')), ex),
    ).toEqual(["schools.json revenue: the State form's total 248305134 doesn't round to the narrative's $248.2M"]);
  });

  it("fails when the spending rows don't add up to the State form's total, to the dollar", () => {
    expect(errors((f) => (f.spending.rows = f.spending.rows.filter((r) => r.id !== 'capital')))).toEqual([
      "schools.json spending: the rows add up to 249316078, not the State form's total 249487813",
    ]);
  });

  it('fails when the parcel taxes stop adding up to their revenue part', () => {
    expect(errors((f) => (f.parcelTaxes = f.parcelTaxes.filter((t) => t.id !== 'maintenance')))).toEqual([
      'schools.json parcel taxes: add up to $59.4M, not the revenue part $68.8M',
    ]);
  });

  it("the fiscal year is the one the total's quote names", () => {
    expect(errors((f) => (f.fiscalYear = '2025-26'))).toEqual(['schools.json fiscalYear: "2025-26" isn\'t the year the revenue total\'s quote names']);
  });
});

describe('the page, as it gets the data', () => {
  it('has the five parts biggest first, in $100 squares, and the parcel-tax line the State form records', () => {
    const s = schoolsFor(berkeley, budget)!;
    expect(s.revenue.waffle.map((w) => [w.id, w.squares])).toEqual([
      ['lcff', 49],
      ['parcel-taxes', 28],
      ['restricted', 20],
      ['other-state', 2],
      ['other-local', 1],
    ]);
    expect(s.revenue.parts.reduce((a, p) => a + p.figure.value, 0)).toBe(s.revenue.total.value);
    const note = s.revenue.notes[1].segments.find((x) => x.kind === 'figure')!;
    expect(note.text).toBe('$68,632,427');
    expect(note.figure.ref).toMatchObject({ source: 'S30', page: 106, column: '2026-27 Budget, Total Fund' });
  });

  it('derives spending shares from its own dollars; the credit row has none', () => {
    const s = schoolsFor(berkeley, budget)!;
    const share = Object.fromEntries(s.spending.rows.map((r) => [r.id, r.share]));
    expect(share.certificated).toBeCloseTo(100_848_393 / 249_487_813, 12);
    expect(share.indirect).toBeUndefined();
  });

  it('only Berkeley has the page; Fremont and the fixture city do not', () => {
    expect(allCities.filter((c) => hasPage(c, 'schools')).map((c) => c.path)).toEqual(['/us/ca/berkeley/']);
  });
});
