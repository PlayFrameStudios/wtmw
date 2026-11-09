/**
 * What staff cost (#65), from documents.json's `staffCosts`: each printed row as quoted (page and line) with a name
 * for each of its columns, and the sections the page draws from those rows. Every figure is parsed from its quote,
 * never typed in, including "$17.72" in a deck printed in millions and Fremont's tables in thousands.
 *
 * The workbook's tie-outs are declared beside the rows and run on every build: rows that sum to a total, columns
 * that sum to a combined column, and a share the City prints. A section draws from one document only, so a figure on
 * one basis (Berkeley's General Fund pension split) never sits beside one on another (the annual report's liability).
 */
import { checkNote, checkQuote, normalize, type Excerpts } from './documents.ts';
import { staffBasisOf, type CityBudget, type DocRef, type SourceId, type StaffAs, type StaffFigure, type StaffPeriod, type StaffSection, type StepNote } from './types.ts';

export interface StaffRowSpec {
  id: string;
  /** The start of the quote: a row's label as printed, or a sentence's opening words. Its figures follow it. */
  label: string;
  source: SourceId;
  page: number;
  quote: string;
  /** 1000 for a table in thousands of dollars; 1000000 for a deck in millions. Percents are never scaled. */
  unit?: number;
  /** A name for each printed figure, in order ("2027", "combined", "total-2025"); null for one the page doesn't use. */
  columns: (string | null)[];
}

/** A figure: a row and one of its columns. */
export interface StaffRef {
  row: string;
  col: string;
}

export interface StaffPeriodSpec {
  year: number;
  /** The column's heading word, as printed. */
  as: StaffAs;
  parts: StaffRef[];
  /** What the parts add up to, as printed: the build fails if they don't. */
  total?: StaffRef;
  /** The total this year's bar is a share of. */
  of?: StaffRef;
}

export interface StaffSectionSpec {
  id: string;
  title: string;
  basis: StepNote;
  figures?: { name: string; asOf: string; ref: StaffRef }[];
  bars?: { layout: 'stacked' | 'grouped'; legend: string[]; periods: StaffPeriodSpec[] };
  notes?: StepNote[];
}

/** Columns (as strings) whose check is known not to tie, and why. */
type Differs = Record<string, string>;
export type StaffTie =
  /** For each column of `equals`, the rows' figures in that column add up to it. */
  | { kind: 'sum'; rows: string[]; equals: string; differs?: Differs }
  /** In each row, the `parts` columns add up to the `equals` column (Miscellaneous + Safety = Combined). */
  | { kind: 'across'; rows: string[]; parts: string[]; equals: string; differs?: Differs }
  /** A share the City prints: row ÷ of, in one column, rounds to `percent`, which the quote prints. */
  | { kind: 'share'; row: string; of: string; col: string; percent: number; printed: DocRef };

export interface StaffCostsSpec {
  /** What the City doesn't publish, in a sentence with no figures ("Fremont's budget doesn't publish …"). */
  unpublished?: string[];
  rows: StaffRowSpec[];
  sections: StaffSectionSpec[];
  ties: StaffTie[];
}

/** One tie-out as run: what it compares and whether it holds (to the dollar, as the workbook's ABS ≤ 1). */
export interface StaffTieResult {
  name: string;
  left: number;
  right: number;
  ties: boolean;
  differs?: string;
}

export interface Printed {
  value: number;
  percent: boolean;
}

const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * The figures in a row or sentence: "$ 27,102", "$17.72", "(19,700)" is negative, "-" is zero, "70.4%" is a percent.
 * A figure may end a sentence ("$5,667,041."); words and the label's own text are skipped.
 */
export function printedNumbers(rest: string): Printed[] {
  const out: Printed[] = [];
  // Whitespace only: normalize() would join "7,096,466 -0.8%" into one token, as it joins "full - time".
  for (const raw of flat(rest).replace(/\$/g, ' ').split(' ')) {
    const token = raw.replace(/[.,;:]$/, '');
    if (token === '-') out.push({ value: 0, percent: false });
    else {
      const m = /^(\()?(-)?(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)(\))?(%)?$/.exec(token);
      if (m) out.push({ value: (m[1] || m[2] ? -1 : 1) * Number(m[3].replace(/,/g, '')), percent: !!m[5] });
    }
  }
  return out;
}

/** Each row's figures by column name, as parsed: what the tests compare with the approved workbook. */
export type StaffValues = Record<string, Record<string, Printed>>;

const money = (v: number) => v.toLocaleString('en-US');

export function applyStaffCosts(
  budget: CityBudget,
  spec: StaffCostsSpec | undefined,
  excerpts: Excerpts,
  where: string,
): { budget: CityBudget; errors: string[]; ties: StaffTieResult[]; values: StaffValues } {
  if (!spec) return { budget, errors: [], ties: [], values: {} };
  const errors: string[] = [];
  const known = new Set<string>(budget.sources.map((s) => s.id));
  const at = `${where} staffCosts`;

  const rows = new Map<string, { spec: StaffRowSpec; cells: Record<string, Printed>; cite: DocRef }>();
  // Rows whose quote or figures failed, already reported: what draws on them says nothing more.
  const failed = new Set<string>();
  for (const r of spec.rows) {
    failed.add(r.id);
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
    const figures = printedNumbers(flat(r.quote).slice(flat(r.label).length));
    if (figures.length !== r.columns.length) {
      errors.push(`${here}: the quote prints ${figures.length} figures; columns lists ${r.columns.length}`);
      continue;
    }
    const cells: Record<string, Printed> = {};
    r.columns.forEach((c, i) => {
      if (c === null) return;
      if (c in cells) errors.push(`${here}: two columns are named ${c}`);
      const f = figures[i];
      cells[c] = f.percent ? { value: Number((f.value / 100).toFixed(6)), percent: true } : { value: Math.round(f.value * (r.unit ?? 1)), percent: false };
    });
    rows.set(r.id, { spec: r, cells, cite: { source: r.source, page: r.page, quote: r.quote } });
    failed.delete(r.id);
  }

  const used = new Set<string>();
  const cell = (ref: StaffRef, here: string): StaffFigure | undefined => {
    const row = rows.get(ref.row);
    if (!row) {
      if (!failed.has(ref.row)) errors.push(`${here}: no row ${ref.row}`);
      return undefined;
    }
    used.add(ref.row);
    const c = row.cells[ref.col];
    if (!c) {
      errors.push(`${here}: row ${ref.row} has no column ${ref.col}`);
      return undefined;
    }
    return { value: c.value, ...(c.percent ? { percent: true } : {}), label: row.spec.label, cite: { ...row.cite } };
  };

  // The tie-outs.
  const ties: StaffTieResult[] = [];
  const check = (differs: Differs | undefined, key: string, name: string, left: number, right: number) => {
    const reason = differs?.[key];
    const result: StaffTieResult = { name, left, right, ties: Math.abs(left - right) <= 1, ...(reason ? { differs: reason } : {}) };
    ties.push(result);
    if (reason && result.ties) errors.push(`${at}: "${name}" is declared as differing, but it ties; remove it from differs`);
    if (!reason && !result.ties) errors.push(`${at}: "${name}" doesn't tie: ${money(left)} vs ${money(right)}`);
  };
  const label = (id: string) => rows.get(id)!.spec.label;
  for (const tie of spec.ties) {
    const ids = tie.kind === 'sum' ? [...tie.rows, tie.equals] : tie.kind === 'across' ? tie.rows : [tie.row, tie.of];
    const missing = ids.filter((id) => !rows.has(id));
    if (missing.length) {
      const unknown = missing.filter((id) => !failed.has(id));
      if (unknown.length) errors.push(`${at}: a ${tie.kind} tie-out names ${unknown.join(', ')}, which isn't a row`);
      continue;
    }
    for (const id of ids) used.add(id);
    if (tie.kind === 'sum') {
      for (const [col, total] of Object.entries(rows.get(tie.equals)!.cells)) {
        const parts = tie.rows.map((id) => rows.get(id)!.cells[col]);
        if (parts.some((p) => !p)) {
          errors.push(`${at}: ${label(tie.equals)}, ${col}: not every row prints it`);
          continue;
        }
        check(tie.differs, col, `${label(tie.equals)} = ${tie.rows.map(label).join(' + ')}, ${col}`, parts.reduce((s, p) => s + p!.value, 0), total.value);
      }
    } else if (tie.kind === 'across') {
      for (const id of tie.rows) {
        const c = rows.get(id)!.cells;
        const missingCols = [...tie.parts, tie.equals].filter((k) => !c[k]);
        if (missingCols.length) {
          errors.push(`${at}: ${label(id)} has no column ${missingCols.join(', ')}`);
          continue;
        }
        const left = tie.parts.reduce((s, k) => s + c[k].value, 0);
        const scale = c[tie.equals].percent ? 1000 : 1;
        check(tie.differs, id, `${label(id)}: ${tie.parts.join(' + ')} = ${tie.equals}`, left * scale, c[tie.equals].value * scale);
      }
    } else {
      const [a, b] = [rows.get(tie.row)!.cells[tie.col], rows.get(tie.of)!.cells[tie.col]];
      const name = `${label(tie.row)} ÷ ${label(tie.of)}, ${tie.col}, rounds to the printed ${tie.percent}%`;
      if (!a || !b) {
        errors.push(`${at}: "${name}": both rows must print ${tie.col}`);
        continue;
      }
      try {
        checkQuote(tie.printed, excerpts, `${at} share ${tie.col}`);
        if (!normalize(tie.printed.quote).includes(`${tie.percent}%`)) errors.push(`${at}: "${name}": the quote doesn't print ${tie.percent}%`);
      } catch (e) {
        errors.push((e as Error).message);
      }
      const share = Math.round((100 * a.value) / b.value);
      ties.push({ name, left: share, right: tie.percent, ties: share === tie.percent });
      if (share !== tie.percent) errors.push(`${at}: "${name}" doesn't tie: ${share}% vs ${tie.percent}%`);
    }
  }

  // The sections.
  const sections: StaffSection[] = spec.sections.map((s) => {
    const here = `${at} section ${s.id}`;
    const docs = new Set<string>();
    const take = (ref: StaffRef, what: string) => {
      const f = cell(ref, `${here} ${what}`);
      if (f) docs.add(f.cite.source);
      return f;
    };
    const figures = (s.figures ?? []).flatMap((f, i) => {
      const got = take(f.ref, `figure ${i + 1}`);
      return got ? [{ ...got, name: f.name, asOf: f.asOf }] : [];
    });
    let bars: StaffSection['bars'];
    if (s.bars) {
      const { layout, legend } = s.bars;
      const periods = s.bars.periods.flatMap((p): StaffPeriod[] => {
        const what = `FY${p.year}`;
        if (p.parts.length !== legend.length) errors.push(`${here} ${what}: ${p.parts.length} parts for ${legend.length} legend entries`);
        const parts = p.parts.map((r) => take(r, what));
        const total = p.total && take(p.total, `${what} total`);
        const of = p.of && take(p.of, `${what} share`);
        if (parts.some((x) => !x) || (p.total && !total) || (p.of && !of)) return [];
        if (total) {
          const sum = parts.reduce((t, x) => t + x!.value, 0);
          if (Math.abs(sum - total.value) > 1) errors.push(`${here} ${what}: the parts add up to ${money(sum)}, not the total ${money(total.value)}`);
        }
        return [{ year: p.year, as: p.as, basis: staffBasisOf(p.as), parts: parts as StaffFigure[], ...(total ? { total } : {}), ...(of ? { of } : {}) }];
      });
      bars = { layout, legend, periods };
    }
    if (docs.size > 1) errors.push(`${here}: draws from ${[...docs].sort().join(' and ')}; a section's figures come from one document, on one basis`);
    for (const [i, n] of [s.basis, ...(s.notes ?? [])].entries()) errors.push(...checkNote(n, excerpts, known, `${here} ${i ? `note ${i}` : 'basis'}`));
    return { id: s.id, title: s.title, basis: s.basis, figures, ...(bars ? { bars } : {}), notes: s.notes ?? [] };
  });

  for (const u of spec.unpublished ?? []) if (/\d/.test(u)) errors.push(`${at}: "${u}" says what isn't published, so it can't hold a figure`);

  // Every row is drawn or tied: a row that is neither is unchecked data.
  for (const id of rows.keys()) if (!used.has(id)) errors.push(`${at}: row ${id} is neither drawn nor tied`);

  return {
    budget: { ...budget, staffCosts: { sections, ...(spec.unpublished ? { unpublished: spec.unpublished } : {}) } },
    errors,
    ties,
    values: Object.fromEntries([...rows].map(([id, r]) => [id, r.cells])),
  };
}
