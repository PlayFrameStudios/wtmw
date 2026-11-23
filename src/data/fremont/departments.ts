/**
 * Fremont's per-department operating budgets, from the adopted budget's department chapters
 * (documents.json `departmentBudgets`, quoted from source/excerpts S1 pages 135-243). Each
 * department's *Sources of Funding* block and its *Expenditures by Category* (and, where the
 * chapter prints one, its *Major Service Area*) table are read from their pages: every figure
 * is parsed from its quote, every table tied to its own totals, the three tables' totals held
 * to be the same number, and each department's funding reconciled to its General Fund summary
 * row (S1 p.66). The build fails on any mismatch.
 *
 * Pure Node TS: explicit `.ts` imports, no Vite globals, imported only by `src/data/fremont/build.ts`.
 */
import { checkNote, checkQuote, normalize, type Excerpts } from '../documents.ts';
import { readTable, tieOut, type TableRow } from '../tables.ts';
import type { AdminDepartmentsHub, CityBudget, DepartmentBudgetDetail, DepartmentExpenseLine, DepartmentFundingLine, DepartmentGeneralFundTie, DocRef, SourceId, StepNote } from '../types.ts';

const YEAR = 2027;
const ADOPTED = `adopted-${YEAR}`;

/** The five printed columns shared by every category and major-service-area table. */
const COLUMNS = ['actual-2023', 'actual-2024', 'actual-2025', 'adopted-2026', ADOPTED] as const;
const HEADINGS: (string | string[])[] = [
  ['FY 2022/23', 'Actual'],
  ['FY 2023/24', 'Actual'],
  ['FY 2024/25', 'Actual'],
  ['FY 2025/26', 'Adopted'],
  ['FY 2026/27', 'Adopted'],
];
/** The category rows every department prints, in order. */
const CATEGORY: [id: string, label: string][] = [
  ['salaries', 'Salaries and Benefits'],
  ['operating', 'Operating Expenditures'],
  ['capital', 'Capital Expenditures'],
  ['allocation', 'Direct/Indirect Expense Allocation'],
];
const CATEGORY_TITLE = 'Historical Expenditures/Budget by Category';
const SERVICE_AREA_TITLE = 'Historical Expenditures/Budget by Major Service Area';

/** A stable URL slug from a printed name: "City Manager's Office" → "city-managers-office". */
const slug = (name: string) => name.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** documents.json's `departmentBudgets` block: what each department's pages print, and its General Fund tie. */
export interface DepartmentBudgetsSpec {
  source: SourceId;
  /** The *Administrative Departments* hub: the page naming the 6 constituent offices, and their slugs. */
  adminHub: { source: SourceId; page: number; quote: string; memberIds: string[] };
  /** The footnote every department prints under its *Expenditures by Category* table. */
  allocationNote: StepNote;
  departments: {
    id: string;
    name: string;
    group: 'department' | 'administrative';
    tie: { kind: DepartmentGeneralFundTie['kind']; summaryId?: string };
    fundingPage: number;
    /** The funding sources' printed names, in order; a wrapped label is its joined name. */
    fundingLabels: string[];
    /** The printed total line's label, e.g. "City Council Total". */
    totalLabel: string;
    categoryPage: number;
    serviceAreaPage?: number;
    /** Overrides SERVICE_AREA_TITLE (Fire's chapter titles it "Fire: Historical …"). */
    serviceAreaTitle?: string;
    /** The division rows, in printed order. */
    serviceAreaLabels?: string[];
  }[];
}

/** A line of *Sources of Funding*: its label, amount, share and the flat line that quotes it. */
interface FundingLine {
  name: string;
  amount: number;
  share: number;
  quote: string;
}

/**
 * Reads a department's *Sources of Funding* block. Labels wrap over lines ("Development Cost\nCenter\n$ 19,126,248 42.0%"),
 * so lines accumulate into a chunk until the chunk ends in "$ amount pct%"; the last chunk is the "{Department} Total" row,
 * which may itself carry a stray "%" (Human Services). Every parsed line is check-quoted, and the labels are verified
 * against `fundingLabels` in order so a silently dropped or reordered line fails the build.
 */
function readFundingSources(
  where: string,
  source: SourceId,
  page: number,
  excerpts: Excerpts,
  fundingLabels: string[],
  totalLabel: string,
): { lines: DepartmentFundingLine[]; total: DocRef & { amount: number } } {
  const text = excerpts[source]?.[String(page)];
  if (text === undefined) throw new Error(`${where}: no excerpt for ${source} page ${page}`);
  if (!normalize(text).includes('Sources of Funding')) throw new Error(`${where}: "Sources of Funding" isn't on the page`);
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const start = lines.findIndex((l) => normalize(l).includes('Sources of Funding'));
  // Collapse a chunk to the exact quote shape the strict dist check re-flattens to: spaces collapsed, nothing else touched.
  const flat = (chunk: string[]) => chunk.join(' ').replace(/\s+/g, ' ').trim();
  const totalRe = new RegExp(`^${totalLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\$\\s?([\\d,]+)(?:\\s+%)?\\s*$`);
  const found: FundingLine[] = [];
  let total: (DocRef & { amount: number }) | undefined;
  let buffer: string[] = [];
  for (const line of lines.slice(start + 1)) {
    buffer.push(line);
    const joined = flat(buffer);
    const m = joined.match(totalRe);
    if (m) {
      total = { source, page, quote: joined, amount: Number(m[1].replace(/,/g, '')) };
      break;
    }
    if (/\$\s?[\d,.]+\s+[\d.]+%\s*$/.test(joined)) {
      const fm = joined.match(/^(.*?)\s+\$\s?([\d,]+)\s+([\d.]+)%\s*$/);
      if (!fm) throw new Error(`${where}: can't parse funding line "${joined}"`);
      found.push({ name: fm[1].trim(), amount: Number(fm[2].replace(/,/g, '')), share: Math.round(Number(fm[3]) * 1e7) / 1e9, quote: joined });
      buffer = [];
    }
  }
  if (!total) throw new Error(`${where}: no "${totalLabel}" row`);
  if (found.length !== fundingLabels.length) throw new Error(`${where}: read ${found.length} funding lines, expected ${fundingLabels.length}`);
  for (const [i, name] of fundingLabels.entries()) if (found[i].name !== name) throw new Error(`${where}: funding line ${i + 1} is "${found[i].name}", expected "${name}"`);
  const linesOut: DepartmentFundingLine[] = [];
  for (const f of found) {
    const ref: DocRef = { source, page, quote: f.quote };
    checkQuote(ref, excerpts, where);
    linesOut.push({ ...ref, name: f.name, amount: f.amount, share: f.share });
  }
  checkQuote(total, excerpts, where);
  return { lines: linesOut, total };
}

/**
 * A department's five-column expenditure table, read with the shared `readTable()`.
 *
 * One printed row in City Manager's Major Service Area table (S1 p.210) has a blank first column:
 * "Homeless Services - 115,132 265,340 292,741 310,619". The shared `splitRow()` deliberately glues
 * `word - digit` into a compound (so a label like "Franchise Tax - PG&E" stays one label), which reads
 * this as "Services-115,132" and loses the zero cell. Only for this shape — a dash after a word followed
 * by exactly four figures at end of line — rewrite the dash to the figure dash `‒`, which `splitRow()`
 * already reads as 0. The printed `-` is restored on every quote before it is returned and checked
 * against the untouched excerpt, so no other table's parsing changes and the data is byte-for-byte the same.
 */
function readDepartmentTable(source: SourceId, page: number, title: string, excerpts: Excerpts) {
  const key = String(page);
  const raw = excerpts[source]?.[key];
  if (raw === undefined) throw new Error(`${source} p.${page}: no excerpt`);
  const prepared: Excerpts = {
    ...excerpts,
    [source]: {
      ...excerpts[source],
      [key]: raw.replace(/(?<=[\w%])[ \t]+-(?=(?:[ \t]+(?:\$[ \t]*)?(?:[\d,]+|-)){4}[ \t]*$)/gm, ' \u2012'),
    },
  };
  const table = readTable({ source, page, title, unit: 1, columns: [...COLUMNS], headings: HEADINGS }, prepared);
  const restore = (r: TableRow): TableRow => {
    const quote = r.ref.quote.replace(/\u2012/g, '-');
    checkQuote({ source, page, quote }, excerpts, table.where);
    return { ...r, ref: { ...r.ref, quote }, at: (column) => ({ ...r.at(column), quote }) };
  };
  return { where: table.where, row: (label: string) => restore(table.row(label)), all: () => table.all().map(restore) };
}

/** A five-column table's rows and its Totals row, tied across all five columns (±$2 for whole-dollar rounding). */
function readFiveColumnTable(
  source: SourceId,
  page: number,
  title: string,
  excerpts: Excerpts,
  rows: { id: string; name: string; label: string }[],
): { lines: DepartmentExpenseLine[]; total: DocRef & { amount: number } } {
  const table = readDepartmentTable(source, page, title, excerpts);
  const found = rows.map((r) => ({ ...r, row: table.row(r.label) }));
  const totals = table.row('Totals');
  for (const c of COLUMNS) tieOut(found.map((r) => r.row), totals, c, table.where, 2);
  return {
    lines: found.map(({ id, name, row }) => ({ id, name, amount: row.values[ADOPTED], ...row.at(ADOPTED) })),
    total: { amount: totals.values[ADOPTED], ...totals.at(ADOPTED) },
  };
}

/** The four category rows every department prints (the allocation row carries a * or ** marker). */
function readCategories(where: string, source: SourceId, page: number, excerpts: Excerpts) {
  const table = readDepartmentTable(source, page, CATEGORY_TITLE, excerpts);
  const rows = new Map<string, TableRow>();
  for (const [id, label] of CATEGORY) {
    const row = table.all().find((r) => r.label === label || r.label.startsWith(`${label}*`));
    if (!row) throw new Error(`${where}: no "${label}" row`);
    rows.set(id, row);
  }
  const totals = table.row('Totals');
  for (const c of COLUMNS) tieOut([...rows.values()], totals, c, table.where, 2);
  return {
    lines: [...rows.entries()].map(([id, row]) => ({
      id,
      name: id === 'allocation' ? 'Direct/Indirect Expense Allocation' : CATEGORY.find(([i]) => i === id)![1],
      amount: row.values[ADOPTED],
      ...row.at(ADOPTED),
    })),
    total: { amount: totals.values[ADOPTED], ...totals.at(ADOPTED) },
  };
}

/**
 * Builds `budget.departmentDetails` from documents.json's `departmentBudgets` and runs every tie-out:
 * each department's funding sources sum to its total (amount ±$2, shares to 100% ±0.2%), the three tables'
 * totals are the same number, and each department's funding reconciles to its General Fund summary row.
 */
export function buildDepartmentDetails(
  spec: DepartmentBudgetsSpec | undefined,
  budget: CityBudget,
  excerpts: Excerpts,
): { budget: CityBudget; errors: string[] } {
  if (!spec) return { budget, errors: [] };
  const errors: string[] = [];
  const at = 'documents.json departmentBudgets';
  const known = new Set<string>(budget.sources.map((s) => s.id));
  if (!known.has(spec.source)) errors.push(`${at}: unknown source ${spec.source}`);
  errors.push(...checkNote(spec.allocationNote, excerpts, known, `${at} allocationNote`));
  if (!known.has(spec.adminHub.source)) errors.push(`${at}: adminHub cites unknown source ${spec.adminHub.source}`);
  else {
    try {
      checkQuote(spec.adminHub, excerpts, `${at} adminHub`);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  const departments: DepartmentBudgetDetail[] = [];
  // Each General Fund administrative office's GF + overhead funding lines (for the p.66 "Administrative Departments" tie).
  const adminOffices: { id: string; office: number }[] = [];
  for (const d of spec.departments) {
    const where = `${at} "${d.name}"`;
    try {
      const funding = readFundingSources(where, spec.source, d.fundingPage, excerpts, d.fundingLabels, d.totalLabel);
      const categories = readCategories(where, spec.source, d.categoryPage, excerpts);
      const serviceAreas =
        d.serviceAreaPage !== undefined
          ? readFiveColumnTable(
              spec.source,
              d.serviceAreaPage,
              d.serviceAreaTitle ?? SERVICE_AREA_TITLE,
              excerpts,
              (d.serviceAreaLabels ?? []).map((label) => ({ id: slug(label), name: label, label })),
            )
          : undefined;
      const sum = funding.lines.reduce((a, l) => a + l.amount, 0);
      if (Math.abs(sum - funding.total.amount) > 2) errors.push(`${where}: the funding sources add up to ${sum.toLocaleString('en-US')}, not the printed ${funding.total.amount.toLocaleString('en-US')}`);
      const shares = funding.lines.reduce((a, l) => a + l.share, 0);
      if (Math.abs(shares - 1) > 0.002) errors.push(`${where}: the printed shares add up to ${shares}, not 100%`);
      if (funding.total.amount !== categories.total.amount)
        errors.push(`${where}: Sources of Funding totals ${funding.total.amount.toLocaleString('en-US')}, but Expenditures by Category totals ${categories.total.amount.toLocaleString('en-US')}`);
      if (serviceAreas && serviceAreas.total.amount !== categories.total.amount)
        errors.push(`${where}: Major Service Areas totals ${serviceAreas.total.amount.toLocaleString('en-US')}, but Expenditures by Category totals ${categories.total.amount.toLocaleString('en-US')}`);
      const detail: DepartmentBudgetDetail = { id: d.id, name: d.name, group: d.group, year: YEAR, generalFundTie: d.tie, funding, categories, ...(serviceAreas ? { serviceAreas } : {}) };
      departments.push(detail);
      const gf = detail.funding.lines.find((l) => l.name === 'General Fund');
      const overhead = detail.funding.lines.find((l) => l.name.startsWith('Overhead Charges to Other Funds'));
      if (d.tie.kind === 'admin-group') {
        if (!gf || !overhead) errors.push(`${where}: needs General Fund and Overhead Charges to Other Funds lines`);
        else adminOffices.push({ id: d.id, office: gf.amount + overhead.amount });
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  // Cross-table General Fund tie-outs against the summary rows (S1 p.66, in thousands of dollars).
  const summary = new Map((budget.generalFund[0]?.lines ?? []).filter((l) => l.kind === 'department').map((l) => [l.id, l]));
  const gfLine = (d: DepartmentBudgetDetail) => d.funding.lines.find((l) => l.name === 'General Fund');
  const overhead = (d: DepartmentBudgetDetail) => d.funding.lines.find((l) => l.name.startsWith('Overhead Charges to Other Funds'));
  for (const d of departments) {
    const where = `${at} "${d.name}"`;
    const tie = d.generalFundTie;
    if (tie.kind === 'direct' || tie.kind === 'with-overhead') {
      const summaryRow = tie.summaryId ? summary.get(tie.summaryId) : undefined;
      if (!summaryRow) {
        errors.push(`${where}: no General Fund summary row ${tie.summaryId ?? '(none)'}`);
        continue;
      }
      const gf = gfLine(d);
      if (!gf) {
        errors.push(`${where}: no General Fund funding line to reconcile to the summary`);
        continue;
      }
      const total = gf.amount + (tie.kind === 'with-overhead' ? overhead(d)?.amount ?? 0 : 0);
      if (Math.round(total / 1000) * 1000 !== summaryRow.amount)
        errors.push(`${where}: General Fund ${tie.kind === 'with-overhead' ? 'and overhead ' : ''}total ${total.toLocaleString('en-US')} doesn't round to the summary's ${summaryRow.amount.toLocaleString('en-US')}`);
    } else if (tie.kind === 'internal-service') {
      const direct = d.funding.lines.find((l) => l.name.startsWith('Direct Charges to General Fund'));
      const other = d.funding.lines.find((l) => l.name.startsWith('Direct Charges to Other Funds'));
      if (gfLine(d)) errors.push(`${where}: has a General Fund line, but is funded by direct charges`);
      if (!direct || !other) errors.push(`${where}: needs Direct Charges to General Fund and Direct Charges to Other Funds lines`);
      else if (direct.amount + other.amount !== d.funding.total.amount)
        errors.push(`${where}: Direct Charges to General Fund + Other Funds = ${(direct.amount + other.amount).toLocaleString('en-US')}, not the total ${d.funding.total.amount.toLocaleString('en-US')}`);
    }
    // 'admin-group' offices accumulate in `adminOffices`, checked against the summary row below.
  }
  if (adminOffices.length) {
    const adminRow = summary.get('administrative-departments');
    if (!adminRow) errors.push(`${at}: no "Administrative Departments" General Fund summary row`);
    else {
      const sum = adminOffices.reduce((a, x) => a + x.office, 0);
      if (sum !== 23_605_782) errors.push(`${at}: the administrative offices' General Fund + overhead totals ${sum.toLocaleString('en-US')}, not 23,605,782`);
      if (Math.round(sum / 1000) * 1000 !== adminRow.amount)
        errors.push(`${at}: the administrative offices' ${sum.toLocaleString('en-US')} doesn't round to the summary's ${adminRow.amount.toLocaleString('en-US')}`);
    }
  }

  const adminHub: AdminDepartmentsHub = {
    id: 'administrative-departments',
    name: 'Administrative Departments',
    description: { source: spec.adminHub.source, page: spec.adminHub.page, quote: spec.adminHub.quote },
    memberIds: spec.adminHub.memberIds,
  };
  {
    const offices = new Set(departments.filter((d) => d.group === 'administrative').map((d) => d.id));
    for (const id of adminHub.memberIds) if (!offices.has(id)) errors.push(`${at}: adminHub lists ${id}, which isn't an administrative office`);
  }

  // Every department row on the General Fund summary has a page: no dead or missing subpage links.
  const pageable = new Set(departments.map((d) => d.id));
  pageable.add(adminHub.id);
  for (const line of budget.generalFund[0]?.lines.filter((l) => l.kind === 'department') ?? []) {
    if (!pageable.has(line.id)) errors.push(`${at}: no department subpage for "${line.name}"`);
  }

  return {
    budget: { ...budget, departmentDetails: { year: YEAR, allocationNote: spec.allocationNote, adminHub, departments } },
    errors,
  };
}
