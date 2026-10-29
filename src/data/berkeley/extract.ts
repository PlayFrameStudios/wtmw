/**
 * Berkeley_Budget_FY25-FY28.xlsx → CityBudget.
 *
 * Reads typed-in inputs and the workbook's TOTAL rows only. Every derived
 * column (budget after reduction, percentages, net cuts, subtotals) is
 * computed here, because the file doesn't store results for all of its
 * formulas (e.g. Dept Reductions FY27!E5 and D20 have none). Wherever the
 * workbook did cache a result, it's recorded as a CrossCheck so validation
 * can confirm our arithmetic matches Excel's.
 *
 * Skipped on purpose: Scenario Model (its "gap remaining" counts the
 * $9.4M twice, as FY27 tax revenue and as the one-time bridge), Dept Comparison and Charts (views of the tabs
 * read here), GF Expenditure History and Enterprise & Special Funds (no
 * page uses them yet).
 */
import type {
  BridgeStep,
  CapitalLine,
  CityBudget,
  GapBudget,
  CostComponent,
  CrossCheck,
  DepartmentReductions,
  Fte,
  GlossaryEntry,
  OneTimeItem,
  Ref,
  Revenue,
  RevenueLine,
  Source,
  SourceId,
  UnfundedLiability,
  WorkbookBudget,
} from '../types.ts';
import { SCHEMA_VERSION } from '../types.ts';
import { REVENUE } from './columns.ts';
import type { Tab, Workbook } from '../workbook.ts';

/**
 * Each tab names its source in prose on row 2. Pin that line and the S-number
 * it means, and require the S-number's title to agree, so an edited workbook
 * can't silently re-point a tab at the wrong document.
 */
const TAB_SOURCES: Record<string, { line: string; source: SourceId; titleIncludes: string }> = {
  'GF Revenue FY26': {
    line: 'Source: City of Berkeley FY2026 Mid-Year General Fund Revenue Report, Feb 26, 2026',
    source: 'S2',
    titleIncludes: 'FY2026 Mid-Year General Fund Revenue Report',
  },
  'Deficit Bridge FY27-28': {
    line: 'Source: Berkeley Budget & Finance Committee, FY27-FY28 Budget Balancing Plan, April 16, 2026',
    source: 'S1',
    titleIncludes: 'FY27-FY28 Budget Balancing Plan',
  },
  'Dept Reductions FY27': {
    line: 'Source: Berkeley Budget & Finance Committee, FY27-FY28 Budget Balancing Plan, April 16, 2026',
    source: 'S1',
    titleIncludes: 'FY27-FY28 Budget Balancing Plan',
  },
  'Dept Reductions FY28': {
    line: 'Source: Berkeley Budget & Finance Committee, FY27-FY28 Budget Balancing Plan, April 16, 2026',
    source: 'S1',
    titleIncludes: 'FY27-FY28 Budget Balancing Plan',
  },
  'FTE & Positions': {
    line: 'Source: Berkeley Budget & Finance Committee, FY27-FY28 Budget Balancing Plan, April 16, 2026',
    source: 'S1',
    titleIncludes: 'FY27-FY28 Budget Balancing Plan',
  },
  'One-Time Resources': {
    line: 'Source: Berkeley Budget & Finance Committee, FY27-FY28 Budget Balancing Plan, April 16, 2026',
    source: 'S1',
    titleIncludes: 'FY27-FY28 Budget Balancing Plan',
  },
  'Capital Program FY27-28': {
    line: 'Source: Berkeley Proposed FY27-FY31 CIP Budget Presentation, May 28, 2026',
    source: 'S3',
    titleIncludes: 'FY27-FY31 CIP Budget Presentation',
  },
};

/**
 * Personnel & Pension cites three documents in one line and doesn't number
 * them, so its rows are mapped one by one, using each source's "Used for"
 * column on the Sources & Links tab (quoted alongside).
 */
const PERSONNEL_SOURCE_LINE =
  'Sources: Berkeley budget overview (Jan 2026); City Auditor Financial Condition report; Berkeleyside (May 2022)';
const PERSONNEL_ROW_SOURCES: Record<number, Pick<Ref, 'source' | 'related'>> = {
  6: { source: 'S11' }, // S11 (Jan 1 2026): "Expenditure growth; personnel/pension split"
  7: { source: 'S11' },
  8: { source: 'S11' },
  9: { source: 'S2', related: ['S11'] }, // ties to the FY26 adopted GF revenue total (S2)
  10: { source: 'S11' },
  14: { source: 'S8' }, // S8: "Unfunded liability / pension history"; note says "City Auditor baseline"
  15: { source: 'S17', related: ['S8'] }, // S17: "Unfunded liability $773.1M"
  16: { source: 'S12' }, // S12: "Baseline reset; 8%/6.5% growth; $600M liabilities"
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parses "City of Berkeley — FY27-FY28 Budget Balancing Plan (Budget & Finance Cmte, Apr 16 2026)". */
export function parseSourceDocument(doc: string) {
  const dash = doc.indexOf(' — ');
  if (dash < 0) throw new Error(`source "${doc}" has no "Publisher — Title" separator`);
  const publisher = doc.slice(0, dash).trim();
  let title = doc.slice(dash + 3).trim();
  let committee: string | undefined;
  let date: string | undefined;
  let dateLabel: string | undefined;

  const paren = title.match(/^(.*?)\s*\(([^()]*)\)$/);
  const dated = paren?.[2].match(/^(?:(.*?),\s*)?((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (?:(\d{1,2}) )?(\d{4}))$/);
  if (paren && dated) {
    title = paren[1];
    committee = dated[1] || undefined;
    dateLabel = dated[2];
    const month = String(MONTHS.indexOf(dated[3]) + 1).padStart(2, '0');
    date = dated[4] ? `${dated[5]}-${month}-${dated[4].padStart(2, '0')}` : `${dated[5]}-${month}`;
  }
  // Headlines are quoted in the workbook: 'considers 10% budget cuts, $29M deficit'
  title = title.replace(/^'(.*)'$/, '$1');
  return { publisher, title, committee, date, dateLabel };
}

/** "Health, Housing & Community Svcs (HHCS)" → "hhcs"; "Mayor & Council" → "mayor-council". */
export function departmentId(name: string): string {
  const abbr = name.match(/\(([A-Z]{2,})\)$/);
  if (abbr) return abbr[1].toLowerCase();
  return name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const ratio = (num: number, den: number) => (den === 0 ? null : num / den);

/** Rows from `start` until column A starts with `stop`; returns [dataRows, stopRow]. */
function rowsUntil(tab: Tab, start: number, stop: string): [number[], number] {
  const rows: number[] = [];
  for (let r = start; r < start + 200; r++) {
    const label = tab.optionalText(`A${r}`);
    if (label.startsWith(stop)) return [rows, r];
    if (!label) throw new Error(`${tab.name}!A${r}: blank row before "${stop}"`);
    rows.push(r);
  }
  throw new Error(`${tab.name}: no "${stop}" row found below row ${start}`);
}

export async function extractBerkeley(wb: Workbook, meta: GapBudget['workbook']) {
  const checks: CrossCheck[] = [];
  /** Record a formula cell the workbook computed, beside our own value for it. */
  const check = (tab: Tab, address: string, computed: number | null) => {
    const cached = tab.cached(address);
    if (cached !== undefined) checks.push({ what: `${tab.name}!${address}`, computed, cached });
  };

  const sources = readSources(wb.tab('Sources & Links'));
  const byId = new Map(sources.map((s) => [s.id, s]));

  const sourced = (name: string) => {
    const tab = wb.tab(name);
    const expected = TAB_SOURCES[name];
    tab.expectText('A2', expected.line);
    const doc = byId.get(expected.source);
    if (!doc?.title.includes(expected.titleIncludes)) {
      throw new Error(`${name}: expected ${expected.source} to be "${expected.titleIncludes}", found "${doc?.title}"`);
    }
    const ref = (row: number): Ref => ({ source: expected.source, table: name, row });
    return { tab, ref };
  };

  // GF Revenue FY26
  const revenue = ((): Revenue => {
    const { tab, ref } = sourced('GF Revenue FY26');
    tab.expectRow(4, [
      'Revenue Source',
      'FY2026 Adopted',
      'FY2026 Mid-Year Actual',
      '% of Adopted Recvd',
      'FY2025 Mid-Year Actual',
      'FY26 vs FY25 ($)',
      'FY26 vs FY25 (%)',
    ]);
    const line = (r: number, read: (a: string) => number): RevenueLine => {
      const adopted = read(`B${r}`);
      const actual = read(`C${r}`);
      const prior = read(`E${r}`);
      const lineValue = {
        name: tab.text(`A${r}`),
        values: { [REVENUE.adopted]: adopted, [REVENUE.midYear]: actual, [REVENUE.priorMidYear]: prior },
        pctOfAdoptedReceived: ratio(actual, adopted),
        changeVsFy2025: actual - prior,
        changeVsFy2025Pct: ratio(actual - prior, prior),
        ...ref(r),
      };
      check(tab, `D${r}`, lineValue.pctOfAdoptedReceived);
      check(tab, `F${r}`, lineValue.changeVsFy2025);
      check(tab, `G${r}`, lineValue.changeVsFy2025Pct);
      return lineValue;
    };
    const [rows, totalRow] = rowsUntil(tab, 5, 'TOTAL');
    const noteRow = totalRow + 2;
    tab.expectText(`A${noteRow}`, 'Note:');
    return {
      title: tab.text('A1'),
      note: tab.text(`A${noteRow}`),
      columns: [
        { key: REVENUE.adopted, year: 2026, basis: 'adopted' },
        { key: REVENUE.midYear, year: 2026, basis: 'mid-year-actual' },
        { key: REVENUE.priorMidYear, year: 2025, basis: 'mid-year-actual' },
      ],
      primary: REVENUE.adopted,
      totalName: 'General Fund revenue and transfers',
      lines: rows.map((r) => line(r, tab.input)),
      total: line(totalRow, tab.value),
    };
  })();

  // Deficit Bridge FY27-28
  const deficitBridge = (() => {
    const { tab, ref } = sourced('Deficit Bridge FY27-28');
    tab.expectRow(4, ['Line Item', 'FY2027', 'FY2028']);
    const layout: [number, string, BridgeStep['kind'], string][] = [
      [5, 'initial-estimate', 'estimate', 'Initial Estimate of General Fund Deficit'],
      [6, 'revenue-projections', 'change', 'Additional Income from Revenue Projections'],
      [7, 'after-revenue-projections', 'subtotal', 'Revised Deficit after Revenue Projections'],
      [8, 'center-street-debt-service', 'change', 'Adjustment: 1947 Center Street Debt Service'],
      [9, 'parking-funds-stabilization', 'change', 'Adjustment: Parking Funds Stabilization'],
      [10, 'non-departmental', 'change', 'Adjustment: Non-Departmental'],
      [11, 'before-one-time-resources', 'subtotal', 'Total Deficit Before Use of One-Time Resources'],
      [12, 'one-time-resources', 'change', 'Use of One-Time Resources'],
      [13, 'final-gap', 'total', 'GF Deficit after Revenue & Expenditure Adjustments'],
    ];
    // Running sum per year: subtotals and the total are computed, never read.
    const running = { B: 0, C: 0 };
    const steps = layout.map(([r, key, kind, label]): BridgeStep => {
      if (tab.text(`A${r}`) !== label) throw new Error(`Deficit Bridge FY27-28!A${r}: expected "${label}"`);
      const value = (col: 'B' | 'C') => {
        if (kind === 'estimate' || kind === 'change') {
          const v = tab.input(`${col}${r}`);
          running[col] += v;
          return v;
        }
        check(tab, `${col}${r}`, running[col]);
        return running[col];
      };
      return { key, label, kind, years: { 2027: value('B'), 2028: value('C') }, ...ref(r) };
    });
    tab.expectText('A15', 'Reduction achieved');
    return { title: tab.text('A1'), note: tab.text('A15'), steps };
  })();

  // Dept Reductions FY27 / FY28
  const departmentReductions = [2027, 2028].map((year): DepartmentReductions => {
    const { tab, ref } = sourced(`Dept Reductions FY${String(year).slice(2)}`);
    tab.expectRow(4, [
      'Department',
      'GF Baseline',
      'Proposed Reduction',
      'Budget w/ Reduction',
      '% of Baseline',
      'Sales & Use Tax Alloc.',
      'Net Reduction w/ S&U Tax',
      '% w/ S&U Tax',
    ]);
    const [rows, totalRow] = rowsUntil(tab, 5, 'TOTAL');
    const noteRow = totalRow + 2;
    tab.expectText(`A${noteRow}`, 'Note: Charter offices (');
    const note = tab.text(`A${noteRow}`);
    const charterNames = note.match(/^Note: Charter offices \(([^)]*)\)/)![1].split(', ');

    const derive = (baseline: number, reduction: number, salesTaxAllocation: number) => ({
      baseline,
      reduction,
      salesTaxAllocation,
      budgetAfterReduction: baseline - reduction,
      reductionPct: reduction / baseline,
      netReduction: reduction - salesTaxAllocation,
      netReductionPct: (reduction - salesTaxAllocation) / baseline,
    });
    const crossCheck = (r: number, d: ReturnType<typeof derive>) => {
      check(tab, `D${r}`, d.budgetAfterReduction);
      check(tab, `E${r}`, d.reductionPct);
      check(tab, `G${r}`, d.netReduction);
      check(tab, `H${r}`, d.netReductionPct);
    };

    const departments = rows.map((r) => {
      const name = tab.text(`A${r}`);
      const d = derive(tab.input(`B${r}`), tab.input(`C${r}`), tab.input(`F${r}`));
      crossCheck(r, d);
      return {
        id: departmentId(name),
        name,
        charter: charterNames.some((c) => name === c || name.includes(c)),
        ...d,
        ...ref(r),
      };
    });
    const total = derive(tab.value(`B${totalRow}`), tab.value(`C${totalRow}`), tab.value(`F${totalRow}`));
    crossCheck(totalRow, total);
    return { year, title: tab.text('A1'), note, departments, total: { ...total, ...ref(totalRow) } };
  });

  // FTE & Positions
  const fte = ((): Fte => {
    const { tab, ref } = sourced('FTE & Positions');
    tab.expectRow(4, [
      'Scenario',
      'FY26 Adopted FTE',
      'FY26 RIF',
      'FY27 Baseline FTE',
      'FY27 Proposed FTE Reduction',
      'FY27 Total FTE (net)',
      'Cumulative RIF',
      'Cumulative % Reduction',
    ]);
    const scenarios = (
      [
        [5, 'without-sales-tax', 'Without Sales & Use Tax'],
        [6, 'with-sales-tax', 'With Sales & Use Tax'],
      ] as const
    ).map(([r, key, label]) => {
      if (tab.text(`A${r}`) !== label) throw new Error(`FTE & Positions!A${r}: expected "${label}"`);
      const adoptedFte = tab.input(`B${r}`);
      const rif = tab.input(`C${r}`);
      const baselineFte = tab.input(`D${r}`);
      const reduction = tab.input(`E${r}`);
      const s = {
        key,
        label,
        year: 2027,
        adoptedFte,
        rif,
        baselineFte,
        reduction,
        netFte: Math.round((baselineFte - reduction) * 100) / 100,
        cumulativeRif: rif + reduction,
        cumulativeReductionPct: (rif + reduction) / adoptedFte,
        ...ref(r),
      };
      check(tab, `F${r}`, s.netFte);
      check(tab, `G${r}`, s.cumulativeRif);
      check(tab, `H${r}`, s.cumulativeReductionPct);
      return s;
    });
    tab.expectRow(10, ['Scenario', 'Vacant', 'Filled', 'Total']);
    const positions = (
      [
        [11, 'without-sales-tax', 'No Sales & Use Tax'],
        [12, 'with-sales-tax', 'With Sales & Use Tax'],
      ] as const
    ).map(([r, key, label]) => {
      if (tab.text(`A${r}`) !== label) throw new Error(`FTE & Positions!A${r}: expected "${label}"`);
      const vacant = tab.input(`B${r}`);
      const filled = tab.input(`C${r}`);
      check(tab, `D${r}`, vacant + filled);
      return { key, label, vacant, filled, total: vacant + filled, ...ref(r) };
    });
    tab.expectText('A14', 'Positions allocated to Sales & Use Tax');
    return { title: tab.text('A1'), note: tab.text('A14'), scenarios, positions };
  })();

  // One-Time Resources
  const oneTimeResources = (() => {
    const { tab, ref } = sourced('One-Time Resources');
    const section = (header: number, heading: string, stop: string): [OneTimeItem[], number] => {
      tab.expectRow(header, [heading, 'Amount']);
      const [rows, totalRow] = rowsUntil(tab, header + 1, stop);
      return [rows.map((r) => ({ label: tab.text(`A${r}`), amount: tab.input(`B${r}`), ...ref(r) })), totalRow];
    };
    const sum = (items: OneTimeItem[]) => items.reduce((a, i) => a + i.amount, 0);
    const [sourcesIn, sourcesTotalRow] = section(4, 'Sources of One-Time Resources', 'Total Sources');
    const [uses, usesTotalRow] = section(9, 'Uses of One-Time Resources', 'Total Uses');
    const remainingRow = usesTotalRow + 1;
    tab.expectText(`A${remainingRow}`, 'Remaining One-Time Resources');
    const totalSources = sum(sourcesIn);
    const totalUses = sum(uses);
    check(tab, `B${sourcesTotalRow}`, totalSources);
    check(tab, `B${usesTotalRow}`, totalUses);
    check(tab, `B${remainingRow}`, totalSources - totalUses);
    return {
      title: tab.text('A1'),
      sources: sourcesIn,
      uses,
      totalSources,
      totalUses,
      remaining: totalSources - totalUses,
    };
  })();

  // Capital Program FY27-28
  const capitalProgram = (() => {
    const { tab, ref } = sourced('Capital Program FY27-28');
    tab.expectRow(4, ['Funding Source', 'Category', 'FY2027', 'FY2028', 'FY27-28 Total']);
    const [rows, totalRow] = rowsUntil(tab, 5, 'TOTAL');
    const lines = rows.map((r): CapitalLine => {
      const fy2027 = tab.input(`C${r}`);
      const fy2028 = tab.input(`D${r}`);
      check(tab, `E${r}`, fy2027 + fy2028);
      return { name: tab.text(`A${r}`), category: tab.text(`B${r}`), years: { 2027: fy2027, 2028: fy2028 }, total: fy2027 + fy2028, ...ref(r) };
    });
    const fy2027 = tab.value(`C${totalRow}`);
    const fy2028 = tab.value(`D${totalRow}`);
    check(tab, `E${totalRow}`, fy2027 + fy2028);
    return {
      title: tab.text('A1'),
      lines,
      total: { name: tab.text(`A${totalRow}`), category: '', years: { 2027: fy2027, 2028: fy2028 }, total: fy2027 + fy2028, ...ref(totalRow) },
    };
  })();

  // Personnel & Pension
  const personnelAndPension = (() => {
    const name = 'Personnel & Pension';
    const tab = wb.tab(name);
    tab.expectText('A2', PERSONNEL_SOURCE_LINE);
    const ref = (row: number): Ref => {
      const s = PERSONNEL_ROW_SOURCES[row];
      if (!s) throw new Error(`${name}: no source mapped for row ${row}`);
      return { ...s, table: name, row };
    };
    tab.expectText('A4', 'A. General Fund Cost Composition');
    tab.expectRow(5, ['Component', 'Amount', '% of GF', 'Notes']);
    const component = (r: number, amount: number): CostComponent => ({
      label: tab.text(`A${r}`),
      amount,
      note: tab.optionalText(`D${r}`),
      ...ref(r),
    });
    const composition = [6, 7, 8].map((r) => component(r, tab.input(`B${r}`)));
    tab.expectText('A9', 'Total General Fund');
    const totalAmount = composition.reduce((a, c) => a + c.amount, 0);
    check(tab, 'B9', totalAmount);
    tab.expectText('A10', 'of which Personnel (subtotal)');
    const personnelAmount = composition[0].amount + composition[1].amount;
    check(tab, 'B10', personnelAmount);

    tab.expectText('A12', 'B. Unfunded Liabilities');
    tab.expectRow(13, ['As of Fiscal Year', 'Unfunded Liability', 'Notes']);
    const unfundedLiabilities = [14, 15, 16].map(
      (r): UnfundedLiability => ({
        asOf: tab.text(`A${r}`),
        amount: tab.input(`B${r}`),
        note: tab.optionalText(`C${r}`),
        ...ref(r),
      }),
    );
    tab.expectText('A18', 'Note:');
    return {
      title: tab.text('A1'),
      note: tab.text('A18'),
      composition,
      compositionTotal: component(9, totalAmount),
      personnelSubtotal: component(10, personnelAmount),
      unfundedLiabilities,
    };
  })();

  // Glossary
  const glossary = (() => {
    const tab = wb.tab('Glossary');
    tab.expectRow(4, ['Term / Column', 'Definition']);
    const entries: GlossaryEntry[] = [];
    for (let r = 5; tab.optionalText(`A${r}`); r++) {
      entries.push({ term: tab.text(`A${r}`), definition: tab.text(`B${r}`), table: 'Glossary', row: r });
    }
    return entries;
  })();

  // README note: the accounting basis and the revision caveat for every figure in the workbook.
  const notes = (() => {
    const tab = wb.tab('README');
    tab.expectText('B40', 'Note: figures are from budget/planning documents (');
    const text = tab.text('B40');
    const basis = text.match(/\(([^)]*basis)\)/)?.[1];
    if (!basis) throw new Error(`README!B40: no "(… basis)" in "${text}"`);
    const caveat = text.replace(/^Note:\s*/, '');
    const coverage = tab.text('B1').match(/FY\d{4}\s*[–-]\s*FY\d{4}$/)?.[0];
    if (!coverage) throw new Error(`README!B1: no "FY…–FY…" range in "${tab.text('B1')}"`);
    return {
      coverage,
      basis: basis[0].toUpperCase() + basis.slice(1),
      caveat: caveat[0].toUpperCase() + caveat.slice(1),
      table: 'README',
      row: 40,
    };
  })();

  // Figures the workbook states in sentences. Each sentence is pinned and parsed strictly, and
  // its source was checked against the document's own text (quoted below).
  const citedFacts = (() => {
    const fact = (tabName: string, address: string, pattern: RegExp) => {
      const text = wb.tab(tabName).text(address).replace(/^•\s*/, '');
      const m = text.match(pattern);
      if (!m) throw new Error(`${tabName}!${address}: expected ${pattern}, found "${text}"`);
      return { text, m, row: Number(address.slice(1)) };
    };
    // S12 (Berkeley Scanner, May 19 2026): staff "had gone back 10 years … with 8% growth in
    // spending and 6.5% in revenue, on average." The Sources tab lists S12 for "8%/6.5% growth".
    wb.tab('GF Expenditure History').expectText('A2', 'Sources: Berkeley budget overview presentations');
    const g = fact('GF Expenditure History', 'A16', /^Over (\d+) years: spending grew ~([\d.]+)%\/yr vs revenue ~([\d.]+)%\/yr/);
    // S5 (City of Berkeley): "a City-specific 0.5% sales tax on the November 2026 ballot". S15 reports the same.
    const t = fact('README', 'B31', /^Proposed ([\d.]+)% sales tax \((Nov \d{4}) ballot\) would raise ~\$([\d.]+)–([\d.]+)M\/yr; would bring Berkeley rate to ([\d.]+)%/);
    // The threshold is stated on the Glossary tab; S15 and S16 both report "simple majority".
    const majority = fact('Glossary', 'B27', /Needs (simple majority)\./);
    // The capital tab's source line is S3 (Proposed FY27-FY31 CIP presentation).
    const bd = fact('Capital Program FY27-28', 'A32', /^Proposed \$(\d+)M infrastructure GO bond → (Nov \d{4}) ballot \(needs ([\d/]+) vote\)\. Funded by ([a-z ]+)\./);
    // The Sources tab lists S6 for "$1.65–2B unfunded infrastructure".
    const bl = fact('Capital Program FY27-28', 'A33', /estimated at \$([\d.]+)–([\d.]+) billion citywide \((\d+\+?) mi sidewalks, (\d+) parks, (\d+) buildings\)/);
    return {
      growth: {
        text: g.text,
        years: Number(g.m[1]),
        spendingRate: Number(g.m[2]) / 100,
        revenueRate: Number(g.m[3]) / 100,
        source: 'S12',
        table: 'GF Expenditure History',
        row: g.row,
      },
      salesTax: {
        text: t.text,
        rate: Number(t.m[1]) / 100,
        election: t.m[2],
        newRate: Number(t.m[5]) / 100,
        threshold: majority.m[1],
        source: 'S5',
        related: ['S15', 'S16'],
        table: 'README',
        row: t.row,
      },
      bond: {
        text: bd.text,
        amount: Number(bd.m[1]) * 1e6,
        election: bd.m[2],
        threshold: bd.m[3],
        repaidBy: bd.m[4],
        source: 'S3',
        related: ['S10'],
        table: 'Capital Program FY27-28',
        row: bd.row,
      },
      backlog: {
        text: bl.text,
        low: Number(bl.m[1]) * 1e9,
        high: Number(bl.m[2]) * 1e9,
        sidewalkMiles: bl.m[3],
        parks: Number(bl.m[4]),
        buildings: Number(bl.m[5]),
        source: 'S6',
        table: 'Capital Program FY27-28',
        row: bl.row,
      },
    } satisfies CityBudget['citedFacts'];
  })();

  // What every city has: each year's department baselines, and the baseline staff count.
  const generalFund = departmentReductions.map((t) => ({
    year: t.year,
    basis: 'General Fund department baseline before proposed cuts',
    note: 'planning figure',
    noun: 'department baseline',
    lines: t.departments.map((d) => ({ id: d.id, name: d.name, kind: 'department' as const, amount: d.baseline, source: d.source, table: d.table, row: d.row })),
    total: { amount: t.total.baseline, source: t.total.source, table: t.total.table, row: t.total.row },
  }));
  const baseline = fte.scenarios.find((s) => s.key === 'without-sales-tax')!;
  const staffing = { year: baseline.year, fte: baseline.baselineFte, basis: 'baseline, all funds', source: baseline.source, table: baseline.table, row: baseline.row };

  const budget: WorkbookBudget = {
    schemaVersion: SCHEMA_VERSION,
    workbook: meta,
    notes,
    sources,
    generalFund,
    staffing,
    revenue,
    deficitBridge,
    departmentReductions,
    fte,
    oneTimeResources,
    capitalProgram,
    personnelAndPension,
    glossary,
    citedFacts,
  };
  return { budget, checks };
}

function readSources(tab: Tab): Source[] {
  tab.expectRow(4, ['#', 'Document', 'Used For', 'URL']);
  const sources: Source[] = [];
  // Numbered rows run until the blank line before the disclaimer.
  for (let r = 5; isNumber(tab, `A${r}`); r++) {
    const number = tab.input(`A${r}`);
    const doc = parseSourceDocument(tab.text(`B${r}`));
    sources.push({
      id: `S${number}`,
      number,
      ...doc,
      url: tab.hyperlink(`D${r}`),
      // S1–S10 are City of Berkeley documents; S11–S19 are news reports.
      type: number <= 10 ? 'city' : 'news',
      usedFor: tab.text(`C${r}`),
      row: r,
    });
  }
  return sources;
}

function isNumber(tab: Tab, address: string) {
  try {
    tab.input(address);
    return true;
  } catch {
    return false;
  }
}
