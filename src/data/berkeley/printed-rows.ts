/**
 * A year's department table as a City document prints it (#63): each workbook row, and the total, cites its line on
 * the page, and the build reads every column back out of that line and compares it with ours. The April 16 plan has
 * no FY2028 table, so FY2028's rows cite the May 19 proposed budget (Item 21, S40), row by row.
 *
 * Inputs (baseline, cut, bridge money) must match exactly. The City prints whole dollars and one-decimal percents
 * computed from unrounded amounts, so a derived dollar column may be $1 off and a percent must round to the printed
 * one. A column the City prints differently on purpose or by mistake is declared in `differs` with the reason, and a
 * declared difference that stops differing is an error too, so the list can't go stale.
 */
import { checkQuote, normalize, type Excerpts } from '../documents.ts';
import type { DepartmentReduction, DepartmentReductionTotal, GeneralFundUses, SourceId, WorkbookBudget } from '../types.ts';

const COLUMNS = ['baseline', 'reduction', 'budgetAfterReduction', 'reductionPct', 'salesTaxAllocation', 'netReduction', 'netReductionPct'] as const;
type Column = (typeof COLUMNS)[number];
const INPUTS: Column[] = ['baseline', 'reduction', 'salesTaxAllocation'];

export interface PrintedRow {
  page: number;
  /** The row as printed: its name, then its columns in the table's order (a row with three prints the first three). */
  quote: string;
  /** Columns the City prints differently from ours, and why. */
  differs?: Partial<Record<Column, string>>;
}

export interface PrintedTable {
  year: number;
  source: SourceId;
  /** By department id, and "total" for the table's total. */
  rows: Record<string, PrintedRow>;
}

type Row = DepartmentReduction | DepartmentReductionTotal;

/** The trailing numbers of a printed row: "Fire 57,206,818 6,800,791 … 5.4%" → [57206818, 6800791, …, 0.054]. */
export function printedColumns(quote: string): number[] {
  const tokens = normalize(quote).split(' ');
  const out: number[] = [];
  for (let i = tokens.length - 1; i >= 0 && /^\d[\d,]*(\.\d+)?%?$/.test(tokens[i]); i--) {
    const t = tokens[i];
    out.unshift(t.endsWith('%') ? Number(t.slice(0, -1)) / 100 : Number(t.replace(/,/g, '')));
  }
  return out;
}

function compare(row: Row, printed: PrintedRow, where: string): string[] {
  const errors: string[] = [];
  const values = printedColumns(printed.quote);
  if (values.length !== 7 && values.length !== 3) return [`${where}: "${printed.quote}" prints ${values.length} numbers; expected 7 (or 3)`];
  const differs = printed.differs ?? {};
  for (const [column, reason] of Object.entries(differs)) {
    if (!COLUMNS.includes(column as Column)) errors.push(`${where}: differs names "${column}", which isn't a column`);
    else if (!reason?.trim()) errors.push(`${where}: differs.${column} needs the reason`);
  }
  COLUMNS.slice(0, values.length).forEach((column, i) => {
    const ours = row[column];
    const theirs = values[i];
    const pct = column.endsWith('Pct');
    const agrees = pct ? (ours * 100).toFixed(1) === (theirs * 100).toFixed(1) : INPUTS.includes(column) ? ours === theirs : Math.abs(ours - theirs) <= 1;
    const shown = (n: number) => (pct ? `${(n * 100).toFixed(1)}%` : n.toLocaleString('en-US'));
    if (column in differs) {
      if (agrees) errors.push(`${where}: ${column} is declared as differing, but the City prints ${shown(theirs)} and ours is ${shown(ours)}; remove it from differs`);
    } else if (!agrees) {
      errors.push(`${where}: ${column} is ${shown(ours)}, but the City prints ${shown(theirs)}${INPUTS.includes(column) ? '' : ' (more than rounding)'}`);
    }
  });
  return errors;
}

/**
 * Each row of the year's table, and its total, gets its printed line as its receipt (page and quote), and so does
 * the same year's General Fund baseline (generalFund), which is read from those rows. Returns the budget and errors.
 */
export function applyPrintedRows<B extends WorkbookBudget>(budget: B, spec: PrintedTable, excerpts: Excerpts, known: Set<string>): { budget: B; errors: string[] } {
  const errors: string[] = [];
  const where = (id: string) => `documents.json departmentRows ${spec.year} ${id}`;
  if (!known.has(spec.source)) return { budget, errors: [`documents.json departmentRows: unknown source ${spec.source}`] };
  const table = budget.departmentReductions.find((t) => t.year === spec.year);
  if (!table) return { budget, errors: [`documents.json departmentRows: no FY${spec.year} department table`] };

  const cite = <T extends Row>(row: T, id: string): T => {
    const printed = spec.rows[id];
    if (!printed) {
      errors.push(`${where(id)}: no printed row. Every FY${spec.year} row cites its line in ${spec.source}`);
      return row;
    }
    if (row.source !== spec.source) errors.push(`${where(id)}: the workbook cites ${row.source} for this row, not ${spec.source}`);
    try {
      checkQuote({ source: spec.source, page: printed.page, quote: printed.quote }, excerpts, where(id));
    } catch (e) {
      errors.push((e as Error).message);
      return row;
    }
    errors.push(...compare(row, printed, where(id)));
    return { ...row, page: printed.page, quote: printed.quote };
  };

  const departments = table.departments.map((d) => cite(d, d.id));
  const total = cite(table.total, 'total');
  const ids = new Set([...table.departments.map((d) => d.id), 'total']);
  for (const id of Object.keys(spec.rows)) if (!ids.has(id)) errors.push(`${where(id)}: no such department in FY${spec.year}`);

  const byId = new Map(departments.map((d) => [d.id, d]));
  const generalFund = budget.generalFund.map((g): GeneralFundUses => {
    if (g.year !== spec.year) return g;
    const at = (r: { page?: number; quote?: string }) => (r.quote ? { page: r.page, quote: r.quote } : {});
    return { ...g, lines: g.lines.map((l) => ({ ...l, ...at(byId.get(l.id) ?? {}) })), total: { ...g.total, ...at(total) } };
  });
  return {
    budget: { ...budget, departmentReductions: budget.departmentReductions.map((t) => (t === table ? { ...t, departments, total } : t)), generalFund },
    errors,
  };
}
