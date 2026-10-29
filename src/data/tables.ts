/**
 * Tables printed in City PDFs, read row by row from a page's extracted text (source/excerpts).
 * A row is one line: its label, then its cells ("Police   124,396   124,714   116,012   129,087").
 * The line, as printed, is the row's quote, so every figure read from it carries its own receipt
 * and the quote check finds it on its page. Numbers are never typed in.
 */
import { normalize, type Excerpts } from './documents.ts';
import type { DocRef, SourceId } from './types.ts';

export interface TableSpec {
  source: SourceId;
  /** PDF page (not the printed folio). */
  page: number;
  /** The table's title as printed on the page, checked so a moved table fails loudly. */
  title: string;
  /** Multiplier from the printed figures to dollars: 1000 for "(Thousands of Dollars)". */
  unit: number;
  /** One key per printed column, left to right ("adopted-2027"). */
  columns: string[];
}

export interface TableRow {
  label: string;
  /** Each column's figure, in dollars (or as printed when unit is 1): "-" reads as 0, "(19,700)" as negative. */
  values: Record<string, number>;
  ref: DocRef;
}

/** "-" and "$" are fillers; "(1,234)" is negative; "70.4%" is a rate (0.704). Returns null for a token that isn't a cell. */
function cell(token: string): number | null {
  if (token === '-') return 0;
  const m = token.match(/^(\()?\$?([\d,]*\.?\d+)(%)?(\))?$/);
  if (!m || /[^\d]/.test(m[2].replace(/[,.]/g, '')) || Boolean(m[1]) !== Boolean(m[4])) return null;
  const n = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return (m[1] ? -n : n) / (m[3] ? 100 : 1);
}

/** Splits a printed line into its label and trailing cells (a "$" before a figure is dropped). */
export function splitRow(line: string): { label: string; cells: number[]; percent: boolean[] } {
  const tokens = normalize(line).split(' ').filter((t) => t !== '$');
  const cells: number[] = [];
  const percent: boolean[] = [];
  while (tokens.length) {
    const v = cell(tokens[tokens.length - 1]);
    if (v === null) break;
    percent.unshift(tokens[tokens.length - 1].endsWith('%'));
    cells.unshift(v);
    tokens.pop();
  }
  return { label: tokens.join(' '), cells, percent };
}

/**
 * A table on one page. `row(label)` finds the one line with that label and as many cells as the
 * table has columns (or as `columns` lists, for a row the City printed with a blank cell), and
 * returns its figures and its quote. Labels that repeat ("TOTAL") are read in order with `rows`.
 */
export function readTable(spec: TableSpec, excerpts: Excerpts) {
  const where = `${spec.source} p.${spec.page} "${spec.title}"`;
  const text = excerpts[spec.source]?.[String(spec.page)];
  if (text === undefined) throw new Error(`${where}: no excerpt for ${spec.source} page ${spec.page}`);
  if (!normalize(text).includes(normalize(spec.title))) throw new Error(`${where}: the title isn't on the page`);
  const lines = text.split('\n').map((l) => ({ quote: normalize(l), ...splitRow(l) })).filter((l) => l.label && l.cells.length);

  const toRow = (l: (typeof lines)[number], columns = spec.columns): TableRow => {
    if (l.cells.length !== columns.length) throw new Error(`${where}: "${l.quote}" has ${l.cells.length} figures, expected ${columns.length}`);
    // Percentages are rates as printed; money is scaled to dollars (rounded: "$23.244" million is $23,244,000).
    const values = Object.fromEntries(columns.map((c, i) => [c, Math.round((l.percent[i] ? l.cells[i] : l.cells[i] * spec.unit) * 1e6) / 1e6]));
    return { label: l.label, values, ref: { source: spec.source, page: spec.page, quote: l.quote } };
  };
  return {
    where,
    row(label: string, columns?: string[]): TableRow {
      const found = lines.filter((l) => l.label === label);
      if (found.length !== 1) throw new Error(`${where}: expected one "${label}" row, found ${found.length}`);
      return toRow(found[0], columns);
    },
    rows(label: string, columns?: string[]): TableRow[] {
      const found = lines.filter((l) => l.label === label);
      if (!found.length) throw new Error(`${where}: no "${label}" row`);
      return found.map((l) => toRow(l, columns));
    },
  };
}

/** Throws unless the rows' figures in `column` add up to `total`'s (to the dollar, or within `tolerance` for rounded tables). */
export function tieOut(rows: TableRow[], total: TableRow, column: string, what: string, tolerance = 0) {
  const sum = rows.reduce((a, r) => a + r.values[column], 0);
  if (Math.abs(sum - total.values[column]) > tolerance + 1e-6) {
    throw new Error(`${what}: the rows add up to ${sum.toLocaleString('en-US')} in ${column}, but "${total.label}" says ${total.values[column].toLocaleString('en-US')}`);
  }
}
