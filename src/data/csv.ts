/**
 * The per-table CSV downloads offered on each city's Sources page. Each row
 * keeps its receipt columns (source, related, table, row) so a spreadsheet
 * user can trace any figure the same way the site does.
 */
import { REVENUE } from './berkeley/columns.ts';
import { hasGapPlan, type CityBudget, type GapBudget } from './types.ts';

export interface CsvTable {
  /** File name without extension, e.g. "deficit-bridge". */
  name: string;
  columns: string[];
  rows: readonly object[];
}

const REF_COLUMNS = ['source', 'related', 'table', 'row'];
/** A row read from a City document: its page and the line quoted from it. */
const DOC_COLUMNS = ['source', 'related', 'page', 'quote'];

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join(';') : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv({ columns, rows }: CsvTable): string {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell((r as Record<string, unknown>)[c])).join(','))].join('\r\n') + '\r\n';
}

const withRef = (columns: string[]) => [...columns, ...REF_COLUMNS];
const withDoc = (columns: string[]) => [...columns, ...DOC_COLUMNS];

/** One `fy{year}` column per year in a record's `years` (the downloads keep their flat columns). */
const flatYears = <T extends { years: Record<number, number> }>(r: T) => ({ ...r, ...Object.fromEntries(Object.entries(r.years).map(([y, v]) => [`fy${y}`, v])) });
const yearColumns = (rows: { years: Record<number, number> }[]) => [...new Set(rows.flatMap((r) => Object.keys(r.years)))].map((y) => `fy${y}`);

/** FTE scenario fields, and their download columns named for the years they're in (the prior year's adopted FTE and RIF). */
const FTE_FIELDS = ['adoptedFte', 'rif', 'baselineFte', 'reduction', 'netFte'] as const;
const fteColumns = (year: number) => [`fy${year - 1}AdoptedFte`, `fy${year - 1}Rif`, `fy${year}BaselineFte`, `fy${year}Reduction`, `fy${year}NetFte`];

export function csvTables(b: CityBudget): CsvTable[] {
  return hasGapPlan(b) ? workbookTables(b) : documentTables(b);
}

/** A city built from documents: its core tables, each row with the page and line it was read from. */
function documentTables(b: CityBudget): CsvTable[] {
  const rev = b.revenue;
  const flat = <T extends { years: Record<number, number> }>(r: T) => flatYears(r);
  return [
    {
      name: 'revenue',
      columns: withDoc(['name', ...rev.columns.map((c) => c.key)]),
      rows: [...rev.lines, rev.total].map((l) => ({ ...l, ...l.values })),
    },
    ...b.generalFund.map((g) => ({
      name: `general-fund-fy${g.year}`,
      columns: withDoc(['id', 'name', 'kind', 'amount']),
      rows: [...g.lines, { ...g.total, id: 'total', name: 'Total', kind: '' }],
    })),
    {
      name: 'positions',
      columns: withDoc(['name', 'fte']),
      rows: [...(b.staffing.byDepartment ?? []), { ...b.staffing, name: 'Citywide total' }],
    },
    ...(b.capitalPlan
      ? [
          {
            name: 'capital-plan',
            columns: withDoc(['name', ...yearColumns(b.capitalPlan.lines), 'total']),
            rows: [...b.capitalPlan.lines, { ...b.capitalPlan.total, name: 'Total' }].map(flat),
          },
        ]
      : []),
    {
      name: 'sources',
      columns: ['id', 'number', 'type', 'publisher', 'title', 'committee', 'date', 'url', 'pageOffset', 'usedFor'],
      rows: b.sources,
    },
  ];
}

/** Berkeley's workbook tables (the downloads keep the workbook's flat columns). */
function workbookTables(b: GapBudget): CsvTable[] {
  const revenueColumns = [
    'name',
    'fy2026Adopted',
    'fy2026MidYearActual',
    'pctOfAdoptedReceived',
    'fy2025MidYearActual',
    'changeVsFy2025',
    'changeVsFy2025Pct',
  ];
  const deptColumns = [
    'id',
    'name',
    'charter',
    'baseline',
    'reduction',
    'budgetAfterReduction',
    'reductionPct',
    'salesTaxAllocation',
    'netReduction',
    'netReductionPct',
  ];
  const ot = b.oneTimeResources;

  return [
    {
      name: 'revenue-fy2026',
      columns: withRef(revenueColumns),
      rows: [...b.revenue.lines, b.revenue.total].map((l) => ({
        ...l,
        fy2026Adopted: l.values[REVENUE.adopted],
        fy2026MidYearActual: l.values[REVENUE.midYear],
        fy2025MidYearActual: l.values[REVENUE.priorMidYear],
      })),
    },
    {
      name: 'deficit-bridge',
      columns: withRef(['key', 'label', 'kind', ...yearColumns(b.deficitBridge.steps)]),
      rows: b.deficitBridge.steps.map(flatYears),
    },
    ...b.departmentReductions.map((y) => ({
      name: `department-reductions-fy${y.year}`,
      columns: withRef(deptColumns),
      rows: [...y.departments, { ...y.total, id: 'total', name: 'TOTAL Citywide' }],
    })),
    {
      name: 'fte-scenarios',
      columns: withRef(['key', 'label', ...fteColumns(b.fte.scenarios[0].year), 'cumulativeRif', 'cumulativeReductionPct']),
      rows: b.fte.scenarios.map((s) => ({ ...s, ...Object.fromEntries(fteColumns(s.year).map((c, i) => [c, s[FTE_FIELDS[i]]])) })),
    },
    {
      name: 'position-reductions',
      columns: withRef(['key', 'label', 'vacant', 'filled', 'total']),
      rows: b.fte.positions,
    },
    {
      name: 'one-time-resources',
      columns: withRef(['side', 'label', 'amount']),
      rows: [...ot.sources.map((i) => ({ side: 'source', ...i })), ...ot.uses.map((i) => ({ side: 'use', ...i }))],
    },
    {
      name: 'capital-program',
      columns: withRef(['name', 'category', ...yearColumns(b.capitalProgram.lines), 'total']),
      rows: [...b.capitalProgram.lines, b.capitalProgram.total].map(flatYears),
    },
    {
      name: 'personnel-cost-composition',
      columns: withRef(['label', 'amount', 'note']),
      rows: [
        ...b.personnelAndPension.composition,
        b.personnelAndPension.compositionTotal,
        b.personnelAndPension.personnelSubtotal,
      ],
    },
    {
      name: 'unfunded-liabilities',
      columns: withRef(['asOf', 'amount', 'note']),
      rows: b.personnelAndPension.unfundedLiabilities,
    },
    {
      name: 'sources',
      columns: ['id', 'number', 'type', 'publisher', 'title', 'committee', 'date', 'dateLabel', 'url', 'usedFor', 'row'],
      rows: b.sources,
    },
    {
      name: 'glossary',
      columns: ['term', 'definition', 'table', 'row'],
      rows: b.glossary,
    },
  ];
}
