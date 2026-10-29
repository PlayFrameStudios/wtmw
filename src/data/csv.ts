/**
 * The per-table CSV downloads offered on each city's Sources page. Each row
 * keeps its receipt columns (source, related, table, row) so a spreadsheet
 * user can trace any figure the same way the site does.
 */
import type { CityBudget } from './types.ts';

export interface CsvTable {
  /** File name without extension, e.g. "deficit-bridge". */
  name: string;
  columns: string[];
  rows: readonly object[];
}

const REF_COLUMNS = ['source', 'related', 'table', 'row'];

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join(';') : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv({ columns, rows }: CsvTable): string {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell((r as Record<string, unknown>)[c])).join(','))].join('\r\n') + '\r\n';
}

const withRef = (columns: string[]) => [...columns, ...REF_COLUMNS];

/** One `fy{year}` column per year in a record's `years` (the downloads keep their flat columns). */
const flatYears = <T extends { years: Record<number, number> }>(r: T) => ({ ...r, ...Object.fromEntries(Object.entries(r.years).map(([y, v]) => [`fy${y}`, v])) });
const yearColumns = (rows: { years: Record<number, number> }[]) => [...new Set(rows.flatMap((r) => Object.keys(r.years)))].map((y) => `fy${y}`);

/** FTE scenario fields, and their download columns named for the years they're in (the prior year's adopted FTE and RIF). */
const FTE_FIELDS = ['adoptedFte', 'rif', 'baselineFte', 'reduction', 'netFte'] as const;
const fteColumns = (year: number) => [`fy${year - 1}AdoptedFte`, `fy${year - 1}Rif`, `fy${year}BaselineFte`, `fy${year}Reduction`, `fy${year}NetFte`];

export function csvTables(b: CityBudget): CsvTable[] {
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
      rows: [...b.revenue.lines, b.revenue.total],
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
