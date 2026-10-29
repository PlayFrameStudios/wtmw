/**
 * Fremont's budget.json, from City documents alone (documents.json + source/excerpts): the FY 2026/27
 * adopted budget's General Fund summary, forecast and history tables, its position, pension and
 * capital tables, and sentences from the mid-year report and the proposed-budget presentation.
 *
 * Every table is tied to its own total rows, figures that two tables both print must agree, and
 * every sentence-stated number is parsed from its quote. The build fails on any mismatch.
 */
import { checkQuote, normalize, type Excerpts } from '../documents.ts';
import { readTable, tieOut, type TableRow, type TableSpec } from '../tables.ts';
import type { BudgetColumn, CityBudget, DocRef, Fact, RevenueLine, Source, SourceId } from '../types.ts';
import { SCHEMA_VERSION } from '../types.ts';

export interface FremontDocuments {
  notes: CityBudget['notes'];
  sources: Omit<Source, 'number'>[];
  tables: Record<'generalFund' | 'forecast' | 'history' | 'allFunds' | 'positions' | 'pension' | 'capitalPlan', TableSpec>;
  quotes: Record<string, DocRef>;
  /** Terms quoted from the adopted budget's glossary: the term's line and its definition, as printed. */
  glossary: { term: string; source: SourceId; page: number; definition: string }[];
}

/** The budget year: FY 2026/27, by the year it ends in. */
const YEAR = 2027;
const ADOPTED = `adopted-${YEAR}`;

/** The General Fund summary's departmental rows, and the citywide lines below them, as printed. */
const DEPARTMENTS = [
  'City Council',
  'Community Development',
  'Community Services',
  'Economic Development',
  'Fire',
  'Human Services',
  'Maintenance Operations',
  'Police',
  'Public Works',
  'Administrative Departments',
];
const CITYWIDE: [label: string, name: string][] = [
  ['Non-departmental Expenditures', 'Non-departmental'],
  ['Debt Service', 'Debt service'],
  ['Less: Citywide Savings', 'Citywide savings'],
];
const REVENUES = [
  'Property Tax',
  'Sales Tax',
  'Business Tax',
  'Hotel/Motel Tax',
  'Property Transfer Tax',
  'Paramedic Tax',
  'Franchise Fees',
  'Charges for Services',
  'Fines',
  'Use of Money and Property',
  'Intergovernmental',
  'Other Revenues',
];
/** The position table's rows, in its three sections, each closed by a TOTAL row; then CITYWIDE TOTAL. */
const POSITION_SECTIONS = [
  ['Fire', 'Police'],
  ['Community Development', 'Community Services', 'Economic Development', 'Human Services', 'Maintenance Operations', 'Public Works'],
  ['City Council', 'City Manager’s Office', 'City Attorney', 'City Clerk', 'Finance', 'Human Resources', 'Information Technology Services'],
];
const CAPITAL = ['Capital Maintenance', 'Transportation Improvements', 'Parks & Recreation', 'General Government'];

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A quote's one figure of the given format: "$19.9 million", "16.7%", "233,974". Throws if it has none or several. */
export function factFrom(key: string, ref: DocRef, format: Fact['format']): Fact {
  const text = normalize(ref.quote);
  const re = format === 'money' ? /\$([\d,]*\.?\d+)( million)?/g : format === 'percent' ? /([\d.]+)%/g : /(?<![\d,.$])(\d{1,3}(?:,\d{3})+|\d+)(?![\d,.%])/g;
  const found = [...text.matchAll(re)];
  if (found.length !== 1) throw new Error(`documents.json quotes.${key}: expected one ${format} figure in "${ref.quote}", found ${found.length}`);
  const n = Number(found[0][1].replace(/,/g, ''));
  const value = format === 'money' ? Math.round(n * (found[0][2] ? 1e6 : 1)) : format === 'percent' ? Math.round(n * 10) / 1000 : n;
  return { ...ref, value, format };
}

export function buildFremont(file: FremontDocuments, excerpts: Excerpts): { budget: CityBudget; errors: string[] } {
  const errors: string[] = [];
  const sources: Source[] = file.sources.map((s, i) => ({ ...s, number: i + 1 }));
  sources.forEach((s, i) => {
    if (s.id !== `S${i + 1}`) errors.push(`documents.json: source ${i + 1} is ${s.id}, expected S${i + 1}`);
    if ((s.type === 'city') !== (s.publisher === 'City of Fremont')) errors.push(`${s.id}: type "${s.type}" but publisher "${s.publisher}"`);
  });
  const known = new Set<SourceId>(sources.map((s) => s.id));
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
  for (const [name, spec] of Object.entries(file.tables)) if (!known.has(spec.source)) errors.push(`documents.json tables.${name}: unknown source ${spec.source}`);

  // The General Fund summary (p.66): revenues, departments, citywide lines and reserves, each tied to its totals.
  const gf = readTable(file.tables.generalFund, excerpts);
  const revenueRows = REVENUES.map((r) => gf.row(r));
  const totalRevenues = gf.row('Total Revenues');
  const transfersIn = gf.row('Transfers In');
  const beginning = gf.row('Beginning Unreserved Fund Balance');
  const totalSources = gf.row('Total Sources');
  const departmentRows = DEPARTMENTS.map((d) => gf.row(d));
  const citywideRows = CITYWIDE.map(([label]) => gf.row(label));
  const totalExpenditures = gf.row('Total Expenditures');
  const transfersOut = gf.row('Transfers Out');
  const totalUses = gf.row('Total Uses');
  const reserveRows = ['Contingency Reserve', 'Budget Uncertainty Reserve'].map((r) => gf.row(r));
  const reserved = gf.row('Reserved Fund Balance');
  const unreserved = gf.row('Unreserved Fund Balance');
  const ending = gf.row('Total Ending Fund Balance');
  for (const c of file.tables.generalFund.columns) {
    tieOut(revenueRows, totalRevenues, c, gf.where);
    tieOut([beginning, totalRevenues, transfersIn], totalSources, c, gf.where);
    tieOut([...departmentRows, ...citywideRows], totalExpenditures, c, gf.where);
    tieOut([totalExpenditures, transfersOut], totalUses, c, gf.where);
    tieOut(reserveRows, reserved, c, gf.where);
    tieOut([reserved, unreserved], ending, c, gf.where);
  }

  // The forecast (p.87) and the history (p.89) repeat the summary's columns; they must print the same figures.
  const forecast = readTable(file.tables.forecast, excerpts);
  const history = readTable(file.tables.history, excerpts);
  const sameAs = (t: ReturnType<typeof readTable>, label: string, columns: string[], row: TableRow) => {
    const other = t.row(label, label === 'Less: Citywide Savings' && t === forecast ? ['adopted-2027', 'projected-2028', 'projected-2029'] : undefined);
    for (const c of columns) if (c in other.values) check(t.where, other.values[c] === row.values[c], `"${label}" ${c} is ${other.values[c]}, but the summary says ${row.values[c]}`);
    return other;
  };
  for (const [label, row] of [...REVENUES.map((r, i) => [r, revenueRows[i]] as const), ['Total Revenues', totalRevenues] as const]) {
    sameAs(forecast, label, ['estimate-2026', ADOPTED], row);
    sameAs(history, label, ['estimate-2026', ADOPTED], row);
  }
  for (const [label, row] of [...DEPARTMENTS.map((d, i) => [d, departmentRows[i]] as const), ['Total Expenditures', totalExpenditures] as const]) {
    sameAs(forecast, label, ['estimate-2026', ADOPTED], row);
    sameAs(history, label, ['estimate-2026', ADOPTED], row);
  }
  for (const c of ['projected-2028', 'projected-2029']) {
    tieOut(REVENUES.map((r) => forecast.row(r)), forecast.row('Total Revenues'), c, forecast.where);
  }
  tieOut(REVENUES.map((r) => history.row(r)), history.row('Total Revenues'), 'actual-2025', history.where);

  // Revenue: each category's actual (FY 2024/25), adopted, revised and estimate (FY 2025/26), adopted
  // (FY 2026/27) and projected (FY 2027/28-2028/29) figures, each cited to the page that prints it.
  const columns: BudgetColumn[] = [
    { key: 'actual-2025', year: 2025, basis: 'actual' },
    { key: 'adopted-2026', year: 2026, basis: 'adopted' },
    { key: 'revised-2026', year: 2026, basis: 'revised' },
    { key: 'estimate-2026', year: 2026, basis: 'estimate' },
    { key: ADOPTED, year: YEAR, basis: 'adopted' },
    { key: 'projected-2028', year: 2028, basis: 'projected' },
    { key: 'projected-2029', year: 2029, basis: 'projected' },
  ];
  const revenueLine = (label: string, name: string, row: TableRow): RevenueLine => {
    const past = history.row(label);
    const ahead = forecast.row(label);
    return {
      name,
      values: {
        'actual-2025': past.values['actual-2025'],
        'adopted-2026': row.values['adopted-2026'],
        'revised-2026': row.values['revised-2026'],
        'estimate-2026': row.values['estimate-2026'],
        [ADOPTED]: row.values[ADOPTED],
        'projected-2028': ahead.values['projected-2028'],
        'projected-2029': ahead.values['projected-2029'],
      },
      cites: { 'actual-2025': past.ref, 'projected-2028': ahead.ref, 'projected-2029': ahead.ref },
      ...row.ref,
    };
  };
  const revenue = {
    title: 'General Fund revenues',
    note: 'The adopted budget prints figures in thousands of dollars; they are shown here in dollars. FY 2024/25 is actual, FY 2025/26 is the City’s estimate as of the adopted budget, and FY 2027/28 onward is its forecast.',
    columns,
    primary: ADOPTED,
    totalName: 'General Fund revenue, before transfers in',
    lines: REVENUES.map((r, i) => revenueLine(r, r, revenueRows[i])),
    total: revenueLine('Total Revenues', 'Total Revenues', totalRevenues),
  };

  // General Fund uses by department, FY 2026/27 adopted: the ten departments, then the citywide lines.
  const generalFund = [
    {
      year: YEAR,
      basis: 'General Fund department budgets, before non-departmental spending, debt service and the citywide savings assumption',
      note: 'adopted',
      noun: 'department budgets',
      lines: [
        ...departmentRows.map((r) => ({ id: slug(r.label), name: r.label, kind: 'department' as const, amount: r.values[ADOPTED], ...r.ref })),
        ...citywideRows.map((r, i) => ({ id: slug(CITYWIDE[i][1]), name: CITYWIDE[i][1], kind: 'citywide' as const, amount: r.values[ADOPTED], ...r.ref })),
      ],
      total: { amount: totalExpenditures.values[ADOPTED], ...totalExpenditures.ref },
    },
  ];

  // Positions (all funds): each section adds up to its TOTAL row, and the sections to CITYWIDE TOTAL.
  const positions = readTable(file.tables.positions, excerpts);
  const sectionTotals = positions.rows('TOTAL');
  check(positions.where, sectionTotals.length === POSITION_SECTIONS.length, `expected ${POSITION_SECTIONS.length} TOTAL rows, found ${sectionTotals.length}`);
  const byDepartment = POSITION_SECTIONS.flatMap((section, i) => {
    const rows = section.map((d) => positions.row(d));
    for (const c of file.tables.positions.columns) tieOut(rows, sectionTotals[i], c, positions.where, 0.005);
    return rows;
  });
  const citywide = positions.row('CITYWIDE TOTAL');
  for (const c of file.tables.positions.columns) tieOut(sectionTotals, citywide, c, positions.where, 0.005);
  const staffing = {
    year: YEAR,
    fte: citywide.values[String(YEAR)],
    basis: 'adopted, all funds',
    byDepartment: byDepartment.map((r) => ({ name: r.label, fte: r.values[String(YEAR)], ...r.ref })),
    ...citywide.ref,
  };

  // Size: all funds (p.32) and the General Fund (p.66), total uses; the all-funds table's General Funds column must match.
  const allFunds = readTable(file.tables.allFunds, excerpts);
  const allUses = allFunds.row('Total Uses');
  check(allFunds.where, allUses.values.general === totalUses.values[ADOPTED], `General Funds total uses ${allUses.values.general} isn't the summary's ${totalUses.values[ADOPTED]}`);
  tieOut(['general', 'cost-center', 'special-revenue', 'capital'].map((c) => ({ label: c, values: { v: allUses.values[c] }, ref: allUses.ref })), { label: 'Total', values: { v: allUses.values.total }, ref: allUses.ref }, 'v', allFunds.where);
  const size = {
    allFunds: { amount: allUses.values.total, note: 'total uses, including transfers between funds', ...allUses.ref },
    generalFund: { amount: totalUses.values[ADOPTED], note: 'total uses, including transfers out', ...totalUses.ref },
  };

  // Capital plan by program category (p.120), in millions to the thousand: each row's years add up to its five-year total.
  const cip = readTable(file.tables.capitalPlan, excerpts);
  const years = [2026, 2027, 2028, 2029, 2030];
  const capitalRows = CAPITAL.map((c) => cip.row(c));
  const cipTotal = cip.row('Total');
  // Each printed figure is rounded to $1,000, so a sum of n figures can be off by n × $500.
  const rounding = (n: number) => n * 500;
  for (const r of [...capitalRows, cipTotal]) {
    const sum = years.reduce((a, y) => a + r.values[String(y)], 0);
    check(cip.where, Math.abs(sum - r.values.total) <= rounding(years.length + 1), `"${r.label}": the five years add up to ${sum}, not ${r.values.total}`);
  }
  for (const c of [...years.map(String), 'total']) tieOut(capitalRows, cipTotal, c, cip.where, rounding(capitalRows.length + 1));
  const byYear = (r: TableRow) => Object.fromEntries(years.map((y) => [y, r.values[String(y)]]));
  const capitalPlan = {
    title: 'Capital Improvement Program, FY 2025/26–2029/30, by program category',
    years,
    lines: capitalRows.map((r) => ({ name: r.label, years: byYear(r), total: r.values.total, ...r.ref })),
    total: { years: byYear(cipTotal), total: cipTotal.values.total, ...cipTotal.ref },
  };

  // Pension (p.39): the combined column.
  const pensionTable = readTable(file.tables.pension, excerpts);
  const ual = pensionTable.row('Unfunded Accrued Liability (UAL)');
  const ratio = pensionTable.row('Funded Ratio');
  const contribution = pensionTable.row('Total Employer Contribution');
  const valuation = quote('pensionValuation');
  const pension = {
    asOf: normalize(valuation.quote).replace(/^Valuation Date: /, ''),
    unfunded: { amount: ual.values.combined, ...ual.ref },
    fundedRatio: { rate: ratio.values.combined, ...ratio.ref },
    contribution: { amount: contribution.values.combined, year: YEAR, ...contribution.ref },
  };
  for (const r of [ual, contribution]) check(pensionTable.where, Math.abs(r.values.miscellaneous + r.values.safety - r.values.combined) < 1, `"${r.label}" doesn't add up`);

  // Facts quoted in sentences, and the summary's sources-and-uses lines the Balance & Reserves page reads.
  const facts: Record<string, Fact> = {
    population: factFrom('population', quote('population'), 'number'),
    maintenanceNotRestored: factFrom('maintenanceNotRestored', quote('maintenanceNotRestored'), 'money'),
    salaryPlaceholder: factFrom('salaryPlaceholder', quote('salaryPlaceholder'), 'percent'),
    citywideSavings: factFrom('citywideSavings', quote('citywideSavings'), 'money'),
    contingencyPolicy: factFrom('contingencyPolicy', quote('contingencyPolicy'), 'percent'),
    salesTaxRecovery: factFrom('salesTaxRecovery', quote('salesTaxRecovery'), 'money'),
    uncertaintyReserveDraw: factFrom('uncertaintyReserveDraw', quote('uncertaintyReserveDraw'), 'money'),
  };
  const row = (r: TableRow, column = ADOPTED): Fact => ({ ...r.ref, value: r.values[column], format: 'money' });
  Object.assign(facts, {
    beginningBalance: row(beginning),
    totalRevenues: row(totalRevenues),
    transfersIn: row(transfersIn),
    totalSources: row(totalSources),
    totalExpenditures: row(totalExpenditures),
    transfersOut: row(transfersOut),
    totalUses: row(totalUses),
    contingencyReserve: row(reserveRows[0]),
    uncertaintyReserve: row(reserveRows[1]),
    reservedBalance: row(reserved),
    endingBalance: row(ending),
    // FY 2024/25: the reserve before and after the draw (the history table).
    uncertaintyReserve2024: row(history.row('Budget Uncertainty Reserve'), 'actual-2024'),
    uncertaintyReserve2025: row(history.row('Budget Uncertainty Reserve'), 'actual-2025'),
  });
  const statements = { adopted: quote('adopted'), contextYears: quote('contextYears'), proposedBalanced: quote('proposedBalanced') };
  // The sentences agree with the tables: the savings assumption is the summary's Citywide Savings line, and
  // the Contingency Reserve is 16.7% of expenditures and transfers out.
  const savings = citywideRows[2].values[ADOPTED];
  check('citywide savings', facts.citywideSavings.value === -savings, `the sentence says $${facts.citywideSavings.value}, the table ${savings}`);
  const policy = facts.contingencyPolicy.value * (totalExpenditures.values[ADOPTED] + transfersOut.values[ADOPTED]);
  check('contingency reserve', Math.abs(policy - reserveRows[0].values[ADOPTED]) < 1_000, `16.7% of expenditures and transfers out is ${Math.round(policy)}, but the reserve is ${reserveRows[0].values[ADOPTED]}`);

  // The glossary: each term's line and its definition, together on the page as printed.
  const glossary = file.glossary.map((g) => {
    const ref: DocRef = { source: g.source, page: g.page, quote: `${g.term} ${g.definition}` };
    checkQuote(ref, excerpts, `documents.json glossary "${g.term}"`);
    return { term: g.term, definition: g.definition, source: g.source, page: g.page, quote: g.definition };
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
  };
  return { budget, errors };
}
