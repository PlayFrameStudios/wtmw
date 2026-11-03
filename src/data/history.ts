/**
 * The General Fund over the years (#64), from documents.json's `history`: each printed row as quoted (page and
 * line), what each of its columns is (year, and the City's word for it: actual, estimate, adopted, proposed), and
 * the lines the page draws from those rows. Every figure is parsed from its quote, never typed in.
 *
 * The workbook's tie-outs are declared beside the rows and run on every build: lines that sum to a total, an ending
 * balance that is next year's beginning, and a figure two documents both print. A step the City's figures don't
 * make (a restated balance) is declared with its reason, shown on the page, and is an error if it stops differing.
 */
import { checkNote, checkQuote, normalize, type Excerpts } from './documents.ts';
import { basisOf, type CityBudget, type DocRef, type HistoryAdjustment, type HistoryAs, type HistoryLine, type HistoryPanel, type SourceId, type StepNote } from './types.ts';

export interface HistoryRowSpec {
  id: string;
  /** The row's label as printed: the quote starts with it, and its figures follow. */
  label: string;
  source: SourceId;
  page: number;
  quote: string;
  /** 1000 for a table printed in thousands of dollars. */
  unit?: number;
  /** One entry per printed figure, in order; null for a column the page doesn't use (a budget beside its actual). */
  columns: ({ year: number; as: HistoryAs } | null)[];
}

export interface HistoryLineSpec {
  id: string;
  label: string;
  kind: HistoryLine['kind'];
  /** The rows it's drawn from, each limited to some years when two rows print the same year. */
  from: { row: string; years?: number[] }[];
  /** Spending printed in parentheses (the annual report's) is drawn as a positive amount. */
  negate?: boolean;
}

export interface HistoryPanelSpec {
  id: string;
  title: string;
  /**
   * The documents its lines may draw from: one basis per panel. Berkeley's annual report (accounting basis) and its
   * budget (budget basis) are separate panels, so no line can join their figures.
   */
  sources: SourceId[];
  basis: StepNote;
  lines: HistoryLineSpec[];
  /** The City's notes printed with the table, quoted as printed. */
  notes?: StepNote[];
}

/** Years (as strings) whose check is known not to tie, and why. */
type Differs = Record<string, string>;
export type HistoryTie =
  | { kind: 'sum'; rows: string[]; equals: string; differs?: Differs }
  | { kind: 'next'; row: string; equals: string; differs?: Differs }
  | { kind: 'same'; rows: [string, string]; year: number; as?: [HistoryAs, HistoryAs]; differs?: Differs };

export interface HistorySpec {
  rows: HistoryRowSpec[];
  panels: HistoryPanelSpec[];
  ties: HistoryTie[];
}

/** One tie-out as run: what it compares and whether it holds (to the dollar, as the workbook's ABS ≤ 1). */
export interface TieResult {
  name: string;
  left: number;
  right: number;
  ties: boolean;
  /** The declared reason, for a check known not to tie. */
  differs?: string;
}

interface Cell {
  year: number;
  as: HistoryAs;
  value: number;
}
interface Row {
  spec: HistoryRowSpec;
  cells: Cell[];
  cite: DocRef;
}

/** The figures after a row's label: "$ 27,102", "(19,700)" is negative, "-" is zero; percents aren't figures. */
export function printedFigures(rest: string): number[] {
  const out: number[] = [];
  for (const token of normalize(rest).replace(/\$/g, ' ').split(' ')) {
    if (token === '-') out.push(0);
    else {
      const m = /^(\()?(-)?(\d{1,3}(?:,\d{3})*|\d+)(\))?$/.exec(token);
      if (m) out.push((m[1] || m[2] ? -1 : 1) * Number(m[3].replace(/,/g, '')));
    }
  }
  return out;
}

const fy = (year: number) => `FY${year}`;

/** Each row's figures as parsed from its quote, drawn or not: what the tests compare with the approved workbook. */
export type HistoryValues = Record<string, { year: number; as: HistoryAs; value: number }[]>;

export function applyHistory(
  budget: CityBudget,
  spec: HistorySpec | undefined,
  excerpts: Excerpts,
  where: string,
): { budget: CityBudget; errors: string[]; ties: TieResult[]; values: HistoryValues } {
  if (!spec) return { budget, errors: [], ties: [], values: {} };
  const errors: string[] = [];
  const known = new Set<string>(budget.sources.map((s) => s.id));
  const at = `${where} history`;

  const rows = new Map<string, Row>();
  for (const r of spec.rows) {
    const here = `${at} row ${r.id}`;
    if (rows.has(r.id)) errors.push(`${here}: two rows have this id`);
    if (!known.has(r.source)) {
      errors.push(`${here}: unknown source ${r.source}`);
      continue;
    }
    try {
      checkQuote(r, excerpts, here);
    } catch (e) {
      errors.push((e as Error).message);
      continue;
    }
    const quote = normalize(r.quote);
    if (!quote.startsWith(normalize(r.label))) {
      errors.push(`${here}: the quote doesn't start with its label "${r.label}"`);
      continue;
    }
    const figures = printedFigures(quote.slice(normalize(r.label).length));
    if (figures.length !== r.columns.length) {
      errors.push(`${here}: the quote prints ${figures.length} figures; columns lists ${r.columns.length}`);
      continue;
    }
    const cells = r.columns.flatMap((c, i) => (c ? [{ ...c, value: figures[i] * (r.unit ?? 1) }] : []));
    rows.set(r.id, { spec: r, cells, cite: { source: r.source, page: r.page, quote: r.quote } });
  }

  const valueAt = (id: string, year: number, as?: HistoryAs): Cell | undefined => {
    const found = rows.get(id)?.cells.filter((c) => c.year === year && (!as || c.as === as)) ?? [];
    if (found.length > 1) errors.push(`${at}: row ${id} prints ${fy(year)} twice; name which (as)`);
    return found[0];
  };

  // The tie-outs.
  const ties: TieResult[] = [];
  const adjustments: { row: string; adjustment: HistoryAdjustment }[] = [];
  const check = (tie: HistoryTie, name: string, year: number, left: number, right: number) => {
    const reason = tie.differs?.[String(year)];
    const result: TieResult = { name, left, right, ties: Math.abs(left - right) <= 1, ...(reason ? { differs: reason } : {}) };
    ties.push(result);
    if (reason && result.ties) errors.push(`${at}: "${name}" is declared as differing, but it ties; remove it from differs`);
    if (!reason && !result.ties) errors.push(`${at}: "${name}" doesn't tie: ${left.toLocaleString('en-US')} vs ${right.toLocaleString('en-US')}`);
    return result;
  };
  for (const tie of spec.ties) {
    const ids = tie.kind === 'next' ? [tie.row, tie.equals] : tie.kind === 'sum' ? [...tie.rows, tie.equals] : tie.rows;
    const missing = ids.filter((id) => !rows.has(id));
    if (missing.length) {
      errors.push(`${at}: a ${tie.kind} tie-out names ${missing.join(', ')}, which isn't a row that parsed`);
      continue;
    }
    const label = (id: string) => rows.get(id)!.spec.label;
    if (tie.kind === 'sum') {
      for (const c of rows.get(tie.equals)!.cells) {
        const parts = tie.rows.map((id) => valueAt(id, c.year, c.as));
        if (parts.some((p) => !p)) {
          errors.push(`${at}: ${label(tie.equals)}, ${fy(c.year)} ${c.as}: not every row prints it`);
          continue;
        }
        check(tie, `${label(tie.equals)} = ${tie.rows.map(label).join(' + ')}, ${fy(c.year)} ${c.as}`, c.year, parts.reduce((s, p) => s + p!.value, 0), c.value);
      }
    } else if (tie.kind === 'next') {
      for (const c of rows.get(tie.row)!.cells) {
        const next = valueAt(tie.equals, c.year + 1);
        if (!next) continue;
        const r = check(tie, `${label(tie.row)} ${fy(c.year)} = ${label(tie.equals)} ${fy(c.year + 1)}`, c.year, c.value, next.value);
        if (r.differs) {
          const from = rows.get(tie.row)!;
          const to = rows.get(tie.equals)!;
          adjustments.push({
            row: tie.row,
            adjustment: {
              reason: r.differs,
              from: { label: from.spec.label, year: c.year, value: c.value, cite: from.cite },
              to: { label: to.spec.label, year: c.year + 1, value: next.value, cite: to.cite },
            },
          });
        }
      }
    } else {
      const [a, b] = tie.rows.map((id, i) => valueAt(id, tie.year, tie.as?.[i]));
      if (!a || !b) errors.push(`${at}: ${label(tie.rows[0])} and ${label(tie.rows[1])}: both must print ${fy(tie.year)}`);
      else check(tie, `${label(tie.rows[0])} (${rows.get(tie.rows[0])!.spec.source}) = ${label(tie.rows[1])} (${rows.get(tie.rows[1])!.spec.source}), ${fy(tie.year)}`, tie.year, a.value, b.value);
    }
  }

  // The panels and their lines.
  const used = new Set<string>();
  const panels: HistoryPanel[] = spec.panels.map((p) => {
    const lines: HistoryLine[] = p.lines.map((l) => {
      const here = `${at} panel ${p.id} line ${l.id}`;
      const series: HistoryLine['series'] = [];
      const years = new Map<number, string>();
      for (const f of l.from) {
        const row = rows.get(f.row);
        if (!row) {
          errors.push(`${here}: no row ${f.row}`);
          continue;
        }
        used.add(f.row);
        if (!p.sources.includes(row.spec.source)) errors.push(`${here}: row ${f.row} is from ${row.spec.source}, which isn't one of this panel's documents (${p.sources.join(', ')})`);
        const cells = row.cells.filter((c) => !f.years || f.years.includes(c.year));
        for (const c of cells) {
          const before = years.get(c.year);
          if (before) errors.push(`${here}: two figures for ${fy(c.year)} (rows ${before} and ${f.row}); a line draws one figure a year`);
          years.set(c.year, f.row);
        }
        for (const as of [...new Set(cells.map((c) => c.as))]) {
          const mine = cells.filter((c) => c.as === as);
          series.push({
            label: row.spec.label,
            basis: basisOf(as),
            as,
            years: Object.fromEntries(mine.map((c) => [String(c.year), l.negate ? -c.value : c.value])),
            cite: row.cite,
          });
        }
      }
      if (!series.length) errors.push(`${here}: draws nothing`);
      return { id: l.id, label: l.label, kind: l.kind, series };
    });
    for (const [i, n] of [p.basis, ...(p.notes ?? [])].entries()) errors.push(...checkNote(n, excerpts, known, `${at} panel ${p.id} ${i ? `note ${i}` : 'basis'}`));
    return { id: p.id, title: p.title, basis: p.basis, lines, notes: p.notes ?? [], adjustments: [] };
  });

  // A declared difference is shown in the panel that draws its row.
  for (const { row, adjustment } of adjustments) {
    const panel = panels.find((p) => spec.panels.find((s) => s.id === p.id)!.lines.some((l) => l.from.some((f) => f.row === row)));
    if (panel) panel.adjustments.push(adjustment);
    else errors.push(`${at}: the difference for ${row} isn't in any panel, so the page can't say why`);
  }
  // Every row is drawn or tied: a row that is neither is unchecked data.
  for (const t of spec.ties) for (const id of t.kind === 'next' ? [t.row, t.equals] : t.kind === 'sum' ? [...t.rows, t.equals] : t.rows) used.add(id);
  for (const id of rows.keys()) if (!used.has(id)) errors.push(`${at}: row ${id} is neither drawn nor tied`);

  return { budget: { ...budget, history: { panels } }, errors, ties, values: Object.fromEntries([...rows].map(([id, r]) => [id, r.cells])) };
}
