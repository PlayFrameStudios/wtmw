/**
 * The school district's budget (#52): data/cities/{city}/schools.json. Another government's book, so
 * every source it cites must be typed 'other' (coverage.json registers them, #51). Each figure is read
 * from its quote, never typed in, and the build fails unless the parts reconcile to their totals:
 *   - revenue: the narrative's parts add up to its total, and the State form's exact total rounds to it;
 *   - spending: the State form's rows add up to its total to the dollar, and the narrative's rounds it;
 *   - the parcel taxes add up to the revenue part they make.
 */
import { paragraphChecks, type ParagraphContext } from './coverage.ts';
import { normalize, type Excerpts } from './documents.ts';
import { splitRow } from './tables.ts';
import type { CityBudget, CoverageParagraph, DocRef, Schools, SchoolsAmount, SchoolsParcelTax, SchoolsPart } from './types.ts';

type AmountSpec = Omit<SchoolsAmount, 'value'>;
type PartSpec = Omit<SchoolsPart, 'amount'> & { amount: AmountSpec };

export interface SchoolsFile {
  district: string;
  short: string;
  fiscalYear: string;
  banner: CoverageParagraph;
  year: CoverageParagraph;
  revenue: { total: AmountSpec; exact: AmountSpec; parcelForm: AmountSpec; parts: PartSpec[]; notes: CoverageParagraph[] };
  spending: { total: AmountSpec; exact: AmountSpec; rows: PartSpec[]; notes: CoverageParagraph[] };
  balance: { paragraphs: CoverageParagraph[]; quotes: DocRef[] };
  parcelTaxes: (Omit<SchoolsParcelTax, 'amount'> & { amount: AmountSpec })[];
  links: Schools['links'];
}

/** The tokens a schools paragraph can use: the City's fiscal year, in the city's own style, and the State form's exact figures. */
export const SCHOOLS_TOKENS = ['year', 'revenueExact', 'parcelForm', 'spendingExact'] as const;

const MONEY = /\$\s?([\d,]*\.?\d+)(\s?million)?/gi;

/** The amount a quote holds: its one dollar figure, or the `figure`th; for a table row, its `figure`th cell. */
export function amountFrom(spec: AmountSpec): number {
  const n = spec.figure;
  if (spec.row) {
    const { cells } = splitRow(spec.quote);
    if (!n || n > cells.length) throw new Error(`"${spec.quote}": a row needs "figure", which of its ${cells.length} cells to read`);
    return cells[n - 1];
  }
  const found = [...normalize(spec.quote).matchAll(MONEY)];
  if (n === undefined && found.length !== 1) throw new Error(`"${spec.quote}": expected one dollar figure, found ${found.length}; name the "figure" to read`);
  const m = found[(n ?? 1) - 1];
  if (!m) throw new Error(`"${spec.quote}": has no dollar figure ${n}`);
  return Math.round(Number(m[1].replace(/,/g, '')) * (m[2] ? 1e6 : 1));
}

export function applySchools(
  budget: CityBudget,
  file: SchoolsFile,
  excerpts: Excerpts,
  pages: ParagraphContext['pages'],
): { budget: CityBudget; errors: string[] } {
  const errors: string[] = [];
  const known = new Map(budget.sources.map((s) => [s.id, s]));
  const glossaryTerms = new Set((budget.glossary ?? []).map((g) => g.term));
  const { cite, paragraph } = paragraphChecks({ known, excerpts, glossaryTerms, pages, tokens: SCHOOLS_TOKENS, errors });
  const where = (w: string) => `schools.json ${w}`;

  // Another government's book: never the City's.
  const theirs = (ref: DocRef, w: string) => {
    const s = known.get(ref.source);
    if (s && s.type !== 'other') errors.push(`${where(w)}: cites ${ref.source}, a ${s.type} source; the school district's figures come from its own documents ("other")`);
  };
  const para = (p: CoverageParagraph, w: string) => {
    paragraph(p, where(w));
    for (const c of p.cites ?? []) theirs(c, w);
  };
  const amount = (spec: AmountSpec, w: string): SchoolsAmount => {
    cite(spec, where(w));
    theirs(spec, w);
    try {
      return { ...spec, value: amountFrom(spec) };
    } catch (e) {
      errors.push(`${where(w)}: ${(e as Error).message}`);
      return { ...spec, value: NaN };
    }
  };
  const part = (p: PartSpec, w: string): SchoolsPart => {
    if (p.about) para(p.about, `${w} about`);
    return { ...p, amount: amount(p.amount, `${w} amount`) };
  };

  para(file.banner, 'banner');
  para(file.year, 'year');
  for (const p of file.revenue.parts) if (!/^#[0-9a-f]{6}$/i.test(p.color ?? '')) errors.push(where(`revenue ${p.id}: needs a "color" for its squares, like "#0e6b6f"`));
  const revenue = {
    total: amount(file.revenue.total, 'revenue total'),
    exact: amount(file.revenue.exact, 'revenue exact'),
    parcelForm: amount(file.revenue.parcelForm, 'revenue parcelForm'),
    parts: file.revenue.parts.map((p) => part(p, `revenue ${p.id}`)),
    notes: file.revenue.notes,
  };
  file.revenue.notes.forEach((n, i) => para(n, `revenue note ${i + 1}`));
  const spending = {
    total: amount(file.spending.total, 'spending total'),
    exact: amount(file.spending.exact, 'spending exact'),
    rows: file.spending.rows.map((p) => part(p, `spending ${p.id}`)),
    notes: file.spending.notes,
  };
  file.spending.notes.forEach((n, i) => para(n, `spending note ${i + 1}`));
  file.balance.paragraphs.forEach((p, i) => para(p, `balance paragraph ${i + 1}`));
  file.balance.quotes.forEach((q, i) => {
    cite(q, where(`balance quote ${i + 1}`));
    theirs(q, `balance quote ${i + 1}`);
  });
  const parcelTaxes = file.parcelTaxes.map((t) => {
    para(t.measure, `parcel tax ${t.id} measure`);
    para(t.pays, `parcel tax ${t.id} pays`);
    return { ...t, amount: amount(t.amount, `parcel tax ${t.id} amount`) };
  });
  for (const id of file.links) if (!known.has(id)) errors.push(where(`links: unknown source ${id}`));

  if (!normalize(file.revenue.total.quote).includes(file.fiscalYear)) errors.push(`schools.json fiscalYear: "${file.fiscalYear}" isn't the year the revenue total's quote names`);

  // Reconciliation: rounded book figures are compared in the book's own rounding.
  const sum = (xs: { amount: SchoolsAmount }[]) => xs.reduce((a, x) => a + x.amount.value, 0);
  const tenths = (n: number) => Math.round(n / 1e5);
  const money = (n: number) => `$${(n / 1e6).toFixed(1)}M`;
  if (tenths(sum(revenue.parts)) !== tenths(revenue.total.value)) {
    errors.push(`schools.json revenue: the parts add up to ${money(sum(revenue.parts))}, not the total ${money(revenue.total.value)}`);
  }
  if (tenths(revenue.exact.value) !== tenths(revenue.total.value)) {
    errors.push(`schools.json revenue: the State form's total ${revenue.exact.value} doesn't round to the narrative's ${money(revenue.total.value)}`);
  }
  if (sum(spending.rows) !== spending.exact.value) errors.push(`schools.json spending: the rows add up to ${sum(spending.rows)}, not the State form's total ${spending.exact.value}`);
  if (tenths(spending.exact.value) !== tenths(spending.total.value)) {
    errors.push(`schools.json spending: the State form's total ${spending.exact.value} doesn't round to the narrative's ${money(spending.total.value)}`);
  }
  const parcel = revenue.parts.find((p) => p.id === 'parcel-taxes');
  if (!parcel) errors.push('schools.json revenue: needs a "parcel-taxes" part, which the parcel taxes add up to');
  else if (tenths(sum(parcelTaxes)) !== tenths(parcel.amount.value)) {
    errors.push(`schools.json parcel taxes: add up to ${money(sum(parcelTaxes))}, not the revenue part ${money(parcel.amount.value)}`);
  }

  const schools: Schools = { district: file.district, short: file.short, fiscalYear: file.fiscalYear, banner: file.banner, year: file.year, revenue, spending, balance: file.balance, parcelTaxes, links: file.links };
  return { budget: { ...budget, schools }, errors };
}
