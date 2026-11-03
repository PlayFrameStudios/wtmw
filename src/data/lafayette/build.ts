/**
 * Lafayette's budget.json, from City documents alone (documents.json + source/excerpts), like Fremont's (#59): the
 * FY 2026-27 budget's General Fund program summary, revenue estimate, reserve standard and position list, the Police
 * Services program page, sentences from the audited financial report (ACFR), and two pages printed as images with no
 * text (the five-year forecast and the capital program summary), read as scanned tables.
 *
 * Every text table is tied to its own subtotal and total rows, figures two tables both print must agree, and a
 * scanned table's rows must add up to its own totals, so a misread figure fails the build. Where a text page prints a
 * figure, that page is the receipt; a scanned page is the receipt only for figures no text page has.
 */
import { checkNote, checkQuote, normalize, type Excerpts } from '../documents.ts';
import { factFrom } from '../fremont/build.ts';
import { readTable, splitRow, tieOut, type TableRow, type TableSpec } from '../tables.ts';
import type { BudgetColumn, CityBudget, DocRef, Fact, Pension, RevenueLine, ReservePosition, Source, SourceId, StepNote } from '../types.ts';
import { SCHEMA_VERSION } from '../types.ts';

/** A table printed as an image (#59): our reading of its rows, line by line, which the build ties to the table's own totals. */
export interface ScannedTableSpec extends TableSpec {
  /** The rendered page the site serves, linked from each receipt. */
  image: string;
  /** Each row as printed, label then figures: our reading, which no text check can confirm. */
  rows: string[];
}

export interface LafayetteDocuments {
  notes: CityBudget['notes'];
  sources: Omit<Source, 'number'>[];
  tables: Record<'programs' | 'expenditures' | 'revenue' | 'positions' | 'reserve' | 'police', TableSpec>;
  scans: Record<'forecast' | 'capital', ScannedTableSpec>;
  quotes: Record<string, DocRef>;
  /** Sentences about the reserve, for the Balance & Reserves page: every number in one must be in a quote it cites. */
  reserveNotes: StepNote[];
  /** What the staffing count leaves out (#60), in the City's words: for the departments page. */
  staffingScope?: StepNote;
  /** Terms the City's documents define, in the City's words: `quote` is on the page and the definition holds it verbatim. */
  glossary: { term: string; source: SourceId; page: number; definition: string; quote: string }[];
}

/** The budget year: FY 2026-27, by the year it ends in. */
const YEAR = 2027;
const BUDGET = `adopted-${YEAR}`;

/**
 * The program summary's sections (S1 PDF 25), each closed by a Subtotal row, and their programs: the printed label,
 * then the name the site shows (the table abbreviates). Programs budgeted at $0 this year stay in the tie-out but get
 * no line: General Plan Advisory Committee ended, and Traffic Enforcement was folded into Police Services.
 */
export const SECTIONS: { id: string; label: string; programs: [label: string, name: string][] }[] = [
  {
    id: 'council',
    label: 'Council, Commissions, and Community Support',
    programs: [
      ['110 City Council', 'City Council'],
      ['115 Public Art', 'Public Art'],
      ['120 Trans/Circ Commission', 'Transportation & Circulation Commission'],
      ['130 Crime Prevention Com.', 'Crime Prevention Commission'],
      ['140 Parks, Trails & RecCommission', 'Parks, Trails & Recreation Commission'],
      ['141 Senior Services', 'Senior Services'],
      ['142 Youth Commission', 'Youth Commission'],
      ['150 Planning Commission', 'Planning Commission'],
      ['151 Design Rev. Commission', 'Design Review Commission'],
      ['152 General Plan Advisory Committee (GPAC)', 'General Plan Advisory Committee'],
      ['153 Environmental Task Force', 'Environmental Task Force'],
    ],
  },
  {
    id: 'police',
    label: 'Police Services',
    programs: [
      ['210 Police Services', 'Police Services'],
      ['215 Traffic Enforcement', 'Traffic Enforcement'],
      ['220 Emergency Prep. Comm.', 'Emergency Preparedness Commission'],
      ['230 Crossing Guards', 'Crossing Guards'],
    ],
  },
  {
    id: 'public-works',
    label: 'Public Works',
    programs: [
      ['310 Road & Drain Maintenance', 'Road & Drain Maintenance'],
      ['320 Traffic Maintenance', 'Traffic Maintenance'],
      ['340 Parks & Trails Maint.', 'Parks & Trails Maintenance'],
      ['350 Comm. Ctr. Maint.', 'Community Center Maintenance'],
      ['360 Emergency Response', 'Emergency Response'],
    ],
  },
  {
    id: 'planning',
    label: 'Planning and Engineering',
    programs: [
      ['410 Planning Services', 'Planning Services'],
      ['415 Code Enforcement', 'Code Enforcement'],
      ['420 Engineering Services', 'Engineering Services'],
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    programs: [
      ['510 City Manager', 'City Manager'],
      ['520 Legal Services', 'Legal Services'],
      ['530 City Clerk', 'City Clerk'],
      ['540 Administrative Services', 'Administrative Services'],
      ['545 Communications', 'Communications'],
      ['550 Rent and Expenses', 'Rent and Expenses'],
      ['560 Technology Services', 'Technology Services'],
    ],
  },
];

/** The revenue estimate's lines (S1 PDF 37): Measure H, the taxes, then each other category's subtotal, as printed and as shown. */
const MEASURE_H: [string, string] = ['401.1 Measure H', 'Measure H sales tax'];
const TAXES: [string, string][] = [
  ['401 Sales and Use Tax', 'Sales tax'],
  ['402 Property Taxes and Subventions', 'Property tax'],
  ['411 State Motor Vehicle In-Lieu Tax', 'Vehicle license fee (from the State)'],
  ['403.1 Franchise Tax-PG&E', 'Franchise fee: PG&E'],
  ['403.2 Franchise Tax-Cable Television', 'Franchise fee: cable television'],
  ['403.3 Franchise Tax-Waste Disposal', 'Franchise fee: waste disposal'],
  ['404 Real Property Transfer Tax', 'Property transfer tax'],
  ['405 Transient Occupancy Tax', 'Hotel tax'],
];
/** Each category: its subtotal row, the name shown, and the lines it adds up. */
const CATEGORIES: [subtotal: string, name: string, lines: string[]][] = [
  ['GOVERNMENT REVENUE', 'Other governments', ['415 Reimbursements for Emergency Response', '418 Intergovernmental', '419 Federal & State Grants']],
  ['FEES FOR SERVICE', 'Fees for service', ['421 Administrative Fees', '422 Police Fees', '423 Engineering Fees', '424 Planning Fees', '425 Public Works Fees', '426 Other Fees for Service']],
  ['INVESTMENT REVENUE', 'Interest and rents', ['431 Investment Earnings', '430 RDA Earnings', '432 Rental of Property']],
  ['FINES AND FORFEITURES', 'Fines', ['441 Vehicle Code Fines']],
  ['OTHER REVENUE', 'Other revenue', ['451 Reimbursements', '453.5 Senior Services Revenue', '454 Revenue from Sale of Property', '458 Youth Activity Revenue', '459 Other Revenue']],
];

/** The core operating funds whose cash is the City's reserve (S1 PDF 16). */
const CORE_FUNDS = ['10 Measure H', '11 General Fund', '31 Recreation Programs', '76 Insurance'];

/**
 * The City's tables print each figure rounded to the dollar from its spreadsheet's cents, so a sum of n printed
 * figures can differ from its printed total by up to n × 50 cents (the summary's Council section is $1 over).
 */
const rounding = (n: number) => n * 0.5;

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * A scanned table (#59): its page must have no text to quote (checkQuote's scanned rule), and its rows are read
 * the way a text table's are, from our reading of the image. Every receipt it gives is marked scanned.
 */
export function readScannedTable(spec: ScannedTableSpec, excerpts: Excerpts) {
  const where = `${spec.source} p.${spec.page} "${spec.title}" (scanned)`;
  checkQuote({ source: spec.source, page: spec.page, quote: spec.title, scanned: { image: spec.image } }, excerpts, where);
  const text = [spec.title, ...spec.headings.flat(), ...spec.rows].join('\n');
  const table = readTable(spec, { [spec.source]: { [String(spec.page)]: text } } as Excerpts);
  const mark = (r: TableRow): TableRow => ({
    ...r,
    ref: { ...r.ref, scanned: { image: spec.image } },
    at: (column) => ({ ...r.at(column), scanned: { image: spec.image } }),
  });
  return {
    where,
    row: (label: string, columns?: string[]) => mark(table.row(label, columns)),
    rows: (label: string, columns?: string[]) => table.rows(label, columns).map(mark),
  };
}

export function buildLafayette(file: LafayetteDocuments, excerpts: Excerpts): { budget: CityBudget; errors: string[] } {
  const errors: string[] = [];
  const sources: Source[] = file.sources.map((s, i) => ({ ...s, number: i + 1 }));
  sources.forEach((s, i) => {
    if (s.id !== `S${i + 1}`) errors.push(`documents.json: source ${i + 1} is ${s.id}, expected S${i + 1}`);
    if ((s.type === 'city') !== (s.publisher === 'City of Lafayette')) errors.push(`${s.id}: type "${s.type}" but publisher "${s.publisher}"`);
  });
  const known = new Set<SourceId>(sources.map((s) => s.id));
  for (const [name, spec] of [...Object.entries(file.tables), ...Object.entries(file.scans)]) {
    if (!known.has(spec.source)) errors.push(`documents.json ${name}: unknown source ${spec.source}`);
  }
  const quote = (key: string): DocRef => {
    const ref = file.quotes[key];
    if (!ref) throw new Error(`documents.json: no quote "${key}"`);
    for (const id of [ref.source, ...(ref.related ?? [])]) if (!known.has(id)) throw new Error(`documents.json quotes.${key}: unknown source ${id}`);
    checkQuote(ref, excerpts, `documents.json quotes.${key}`);
    return ref;
  };
  const check = (what: string, ok: boolean, detail: string) => {
    if (!ok) errors.push(`${what}: ${detail}`);
  };

  // The General Fund program summary (PDF 25): each section's programs add up to its Subtotal, the Subtotals to the
  // General Fund's, and that is the expenditure summary's (PDF 23) TOTAL G.F. EXPENDITURES.
  const programs = readTable(file.tables.programs, excerpts);
  const subtotals = programs.rows('Subtotal');
  check(programs.where, subtotals.length === SECTIONS.length, `expected ${SECTIONS.length} Subtotal rows, found ${subtotals.length}`);
  const columns = file.tables.programs.columns.filter((c) => c !== 'change');
  const sections = SECTIONS.map((section, i) => {
    const rows = section.programs.map(([label]) => programs.row(label));
    for (const c of columns) tieOut(rows, subtotals[i], c, `${programs.where} ${section.label}`, rounding(rows.length + 1));
    return { ...section, rows, subtotal: subtotals[i] };
  });
  const generalFundTotal = programs.row('Subtotal General Fund');
  for (const c of columns) tieOut(subtotals, generalFundTotal, c, programs.where, rounding(subtotals.length + 1));
  const expenditures = readTable(file.tables.expenditures, excerpts);
  const totalExpenditures = expenditures.row('TOTAL G.F. EXPENDITURES');
  for (const c of columns) check(expenditures.where, totalExpenditures.values[c] === generalFundTotal.values[c], `TOTAL G.F. EXPENDITURES ${c} is ${totalExpenditures.values[c]}, but the program summary's is ${generalFundTotal.values[c]}`);

  // Police Services (PDF 76): its program total is the summary's line, and its Sheriff contract line is the
  // expenditure summary's (PDF 23) and the contract detail's subtotal (PDF 77). The program page's line is the receipt.
  const police = readTable(file.tables.police, excerpts);
  const policeTotal = police.row('TOTAL PROGRAM COST');
  const policeLine = sections[1].rows[0];
  for (const c of columns) check(police.where, policeTotal.values[c] === policeLine.values[c], `TOTAL PROGRAM COST ${c} is ${policeTotal.values[c]}, but the summary says ${policeLine.values[c]}`);
  const contract = quote('sheriffContract');
  const contractCells = splitRow(contract.quote).cells;
  const contractAmount = contractCells.at(-2)!;
  const contractRise = contractCells.at(-1)!;
  const contractSummary = expenditures.row('862 Contract Sheriff Services');
  check('Sheriff contract', contractAmount === contractSummary.values[BUDGET], `the program page says ${contractAmount}, the expenditure summary ${contractSummary.values[BUDGET]}`);
  const contractDetail = splitRow(quote('sheriffContractDetail').quote).cells.at(-2);
  check('Sheriff contract', contractAmount === contractDetail, `the program page says ${contractAmount}, the contract detail ${contractDetail}`);

  // General Fund uses: one line per program with money this year, in the City's sections.
  const generalFund = [
    {
      year: YEAR,
      basis: 'General Fund program budgets',
      noun: 'program budgets',
      unit: 'program',
      lines: sections.flatMap((s) =>
        s.rows
          .map((r, i) => ({ r, name: s.programs[i][1] }))
          .filter(({ r }) => r.values[BUDGET] > 0)
          .map(({ r, name }) => ({ id: slug(name), name, kind: 'department' as const, amount: r.values[BUDGET], ...r.at(BUDGET) })),
      ),
      total: { amount: generalFundTotal.values[BUDGET], ...generalFundTotal.at(BUDGET) },
    },
  ];
  for (const s of sections) {
    for (const [i, r] of s.rows.entries()) if (r.values[BUDGET] < 0) errors.push(`${programs.where}: "${s.programs[i][0]}" is negative`);
  }

  // Revenue (PDF 37): the taxes add up to TAXES, each category's lines to its subtotal, and Measure H, TAXES and the
  // categories to TOTAL GENERAL FUND REVENUE (Measure H is printed above TAXES, outside it). Not the FY 2025-26
  // estimate column: its lines add up to $24,858,849 against a printed total of $24,803,461, and its GOVERNMENT
  // REVENUE subtotal leaves out a $110,776 line, so it doesn't tie and isn't shown.
  const revenueTable = readTable(file.tables.revenue, excerpts);
  const revenueTied = columns.filter((c) => c !== 'estimate-2026');
  const measureH = revenueTable.row(MEASURE_H[0]);
  const taxRows = TAXES.map(([label]) => revenueTable.row(label));
  const taxes = revenueTable.row('TAXES');
  const categories = CATEGORIES.map(([subtotal, , lines]) => {
    const total = revenueTable.row(subtotal);
    const rows = lines.map((l) => revenueTable.row(l));
    for (const c of revenueTied) tieOut(rows, total, c, `${revenueTable.where} ${subtotal}`, rounding(rows.length + 1));
    return total;
  });
  const totalRevenue = revenueTable.row('TOTAL GENERAL FUND REVENUE');
  for (const c of revenueTied) {
    tieOut(taxRows, taxes, c, revenueTable.where, rounding(taxRows.length + 1));
    tieOut([measureH, taxes, ...categories], totalRevenue, c, revenueTable.where, rounding(categories.length + 3));
  }
  const revenueColumns: BudgetColumn[] = [
    { key: 'actual-2024', year: 2024, basis: 'actual' },
    { key: 'actual-2025', year: 2025, basis: 'actual' },
    { key: 'revised-2026', year: 2026, basis: 'revised' },
    { key: BUDGET, year: YEAR, basis: 'adopted' },
  ];
  const revenueLine = (name: string, row: TableRow): RevenueLine => ({
    name,
    values: Object.fromEntries(revenueColumns.map((c) => [c.key, row.values[c.key]])),
    cites: Object.fromEntries(revenueColumns.map((c) => [c.key, row.at(c.key)])),
    ...row.at(BUDGET),
  });
  const revenue = {
    title: 'General Fund revenues',
    note: 'FY 2023-24 and FY 2024-25 are actual, FY 2025-26 is the Final Budget the Council adopted in January 2026, and FY 2026-27 is the budget it adopted in June 2026. Measure H is a half-cent sales tax voters approved in November 2024; the City records it in the General Fund.',
    columns: revenueColumns,
    primary: BUDGET,
    totalName: 'General Fund revenue',
    lines: [
      revenueLine(MEASURE_H[1], measureH),
      ...TAXES.map(([, name], i) => revenueLine(name, taxRows[i])),
      ...CATEGORIES.map(([, name], i) => revenueLine(name, categories[i])),
    ],
    total: revenueLine('Total General Fund revenue', totalRevenue),
  };

  // Positions (PDF 32): every position's count adds up to the TOTAL row. Sworn officers are the Sheriff's, not on it.
  const positions = readTable(file.tables.positions, excerpts);
  const positionRows = positions.all();
  const positionTotal = positions.row('TOTAL:', ['employees']);
  tieOut(positionRows, positionTotal, 'employees', positions.where, 0.005);
  const staffing = {
    year: YEAR,
    fte: positionTotal.values.employees,
    basis: 'budgeted City positions',
    ...positionTotal.at('employees'),
    ...(file.staffingScope && { scope: file.staffingScope }),
  };
  if (file.staffingScope) errors.push(...checkNote(file.staffingScope, excerpts, known, 'documents.json staffingScope'));

  // The reserve standard (PDF 16): the core funds' cash adds up to the core cash position; the target is 60% of
  // expenditures and transfers; the printed share is that cash over the same base; and the excess is cash over target.
  const reserve = readTable(file.tables.reserve, excerpts);
  const coreRows = CORE_FUNDS.map((f) => reserve.row(f));
  const coreCash = reserve.row('Total Core Cash Position');
  const base = reserve.row('TOTAL EXPENDITURES + TRANSFERS');
  const target = reserve.row('TARGET RESERVE:');
  const level = reserve.row('% of General Fund Expenditures');
  const excess = reserve.row('Excess Total Cash Position Over GF Reserve Target:');
  const policy = factFrom('reservePolicy', quote('reservePolicy'), 'percent');
  for (const c of file.tables.reserve.columns) {
    tieOut(coreRows, coreCash, c, reserve.where, rounding(coreRows.length + 1));
    check(reserve.where, Math.abs(base.values[c] * policy.value - target.values[c]) <= 1, `60% of ${base.values[c]} isn't the target ${target.values[c]}`);
    check(reserve.where, Math.round((coreCash.values[c] / base.values[c]) * 100) / 100 === level.values[c], `core cash over expenditures and transfers isn't the printed ${level.values[c]}`);
    check(reserve.where, Math.abs(coreCash.values[c] - target.values[c] - excess.values[c]) <= 1, `core cash less the target isn't the printed excess ${excess.values[c]}`);
  }
  check(reserve.where, expenditures.row('TOTAL G.F. EXPENDITURES').values[BUDGET] === reserve.row('General Fund Expenditures').values[`june-${YEAR}`], 'its General Fund Expenditures are not the budget’s');

  // The five-year forecast (PDF 17, an image): its FY 2026-27 ending balance and reserve share are the reserve
  // standard's text figures, so the reading is tied to text; its deficit and its last year's share have no text page.
  const forecast = readScannedTable(file.scans.forecast, excerpts);
  const ending = forecast.row('Projected Ending Fund Balance', file.scans.forecast.columns);
  const forecastYears = file.scans.forecast.columns.filter((c) => !c.startsWith('change'));
  const deficit = forecast.row('Surplus or (Deficit)?:', forecastYears);
  const forecastLevel = forecast.row('% of General Fund Expenditures', forecastYears);
  check(forecast.where, ending.values[BUDGET] === coreCash.values[`june-${YEAR}`], `the FY 2026-27 ending balance ${ending.values[BUDGET]} isn't the core cash position ${coreCash.values[`june-${YEAR}`]}`);
  check(forecast.where, ending.values['estimate-2026'] === coreCash.values['june-2026'], `the FY 2025-26 ending balance ${ending.values['estimate-2026']} isn't the core cash position ${coreCash.values['june-2026']}`);
  check(forecast.where, forecastLevel.values[BUDGET] === level.values[`june-${YEAR}`], `FY 2026-27's share ${forecastLevel.values[BUDGET]} isn't the reserve standard's ${level.values[`june-${YEAR}`]}`);
  check(forecast.where, forecastLevel.values['estimate-2026'] === level.values['june-2026'], `FY 2025-26's share ${forecastLevel.values['estimate-2026']} isn't the reserve standard's ${level.values['june-2026']}`);
  const lastYear = forecastYears.at(-1)!;
  const reservePosition: ReservePosition = {
    year: YEAR,
    balance: { amount: coreCash.values[`june-${YEAR}`], ...coreCash.at(`june-${YEAR}`) },
    level: { rate: level.values[`june-${YEAR}`], ...level.at(`june-${YEAR}`) },
    policy: { rate: policy.value, ...file.quotes.reservePolicy },
    change: { amount: deficit.values[BUDGET], ...deficit.at(BUDGET) },
    outlook: { rate: forecastLevel.values[lastYear], year: Number(lastYear.slice(-4)), ...forecastLevel.at(lastYear) },
    notes: file.reserveNotes.map((n, i) => {
      errors.push(...checkNote(n, excerpts, known, `documents.json reserveNotes[${i}]`));
      return n;
    }),
  };

  // The capital program (PDF 21, an image): each project's funding sources add up to its Total, and the projects to
  // the GRAND TOTAL, which its sources also add up to. One year: the City adopts its capital program yearly.
  const capital = file.scans.capital;
  checkQuote({ source: capital.source, page: capital.page, quote: capital.title, scanned: { image: capital.image } }, excerpts, `${capital.source} p.${capital.page} (scanned)`);
  const projects = capital.rows.map((line) => {
    const [name, printed] = line.split(' | ');
    const { cells } = splitRow(printed);
    const total = cells.at(-1)!;
    check(`capital program "${name}"`, Math.abs(cells.slice(0, -1).reduce((a, x) => a + x, 0) - total) < 0.5, `its sources add up to ${cells.slice(0, -1).reduce((a, x) => a + x, 0)}, not its Total ${total}`);
    return { name, total, ref: { source: capital.source, page: capital.page, quote: normalize(printed), column: [capital.headings.at(-1)!].flat().join(' '), scanned: { image: capital.image } } satisfies DocRef };
  });
  const grand = projects.pop()!;
  check('capital program', grand.name === 'Total', `the last row must be the GRAND TOTAL, named "Total"; got "${grand.name}"`);
  check('capital program', projects.reduce((a, p) => a + p.total, 0) === grand.total, `the projects add up to ${projects.reduce((a, p) => a + p.total, 0)}, not ${grand.total}`);
  const capitalPlan = {
    title: `Capital Improvement Program, FY 2026-27, by project`,
    unit: 'project',
    years: [YEAR],
    lines: projects.map((p) => ({ name: p.name, years: { [YEAR]: p.total }, total: p.total, ...p.ref })),
    total: { years: { [YEAR]: grand.total }, total: grand.total, ...grand.ref },
  };

  // Size: the General Fund only. The City's two all-funds totals differ and nothing yet explains it (#58), so none is shown.
  const size = { generalFund: { amount: totalExpenditures.values[BUDGET], note: 'expenditures, before transfers to other funds', ...totalExpenditures.at(BUDGET) } };

  // Pension: no defined-benefit plan. The City pays a share of base pay into each employee's 401(a) account.
  const rate = factFrom('pensionRate', quote('pensionRate'), 'percent');
  const paid = factFrom('pensionContribution', quote('pensionContribution'), 'money');
  const opebRow = quote('opeb');
  const opeb = splitRow(opebRow.quote).cells;
  check('OPEB', opeb.length === 3 && opeb[0] + opeb[1] === opeb[2], `"${opebRow.quote}" isn't governmental, business-type and total`);
  const pension: Pension = {
    plan: 'defined-contribution',
    noDefinedBenefit: quote('noDefinedBenefit'),
    rate: { rate: rate.value, ...file.quotes.pensionRate },
    contribution: { amount: paid.value, year: 2025, ...file.quotes.pensionContribution },
    opeb: { amount: opeb[0], asOf: 'June 30, 2025', ...opebRow, column: 'Governmental Activities' },
  };

  const facts: Record<string, Fact> = {
    sheriffContract: { ...contract, column: 'Proposed 2026-2027 Budget', value: contractAmount, format: 'money' },
    sheriffContractRise: { ...contract, column: 'Increase Over Budget', value: contractRise, format: 'percent' },
    sworn: factFrom('sworn', quote('sworn'), 'number'),
    animalControl: factFrom('animalControl', quote('animalControl'), 'money'),
    reserveTarget: { ...target.at(`june-${YEAR}`), value: target.values[`june-${YEAR}`], format: 'money' },
  };
  const statements = {
    limitedService: quote('limitedService'),
    adopted: quote('adopted'),
    consolidation: quote('consolidation'),
    strategic: quote('strategic'),
    deferredMaintenance: quote('deferredMaintenance'),
    communityCenterSinking: quote('communityCenterSinking'),
  };

  const glossary = file.glossary.map((g) => {
    const where = `documents.json glossary "${g.term}"`;
    check(where, normalize(g.definition).includes(normalize(g.quote)), 'the definition must hold its quote, word for word');
    checkQuote({ source: g.source, page: g.page, quote: g.quote }, excerpts, where);
    return g;
  });

  const budget: CityBudget = {
    schemaVersion: SCHEMA_VERSION,
    notes: file.notes,
    sources,
    generalFund,
    revenue,
    staffing,
    size,
    glossary,
    facts,
    statements,
    capitalPlan,
    pension,
    reservePosition,
  };
  return { budget, errors };
}
