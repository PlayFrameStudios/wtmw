/**
 * Figures for a city's Departments page: each department's baseline, cut,
 * softened amount and net cut for both years, the row order for every
 * year × tax × sort view, and the receipts behind each number.
 */
import type { CityBudget, DepartmentReduction } from '../data/types.ts';
import type { Families } from './families.ts';
import { dataDirOf } from './cities.ts';
import type { Figure } from './receipts.ts';
import { per100, type Share, type WaffleItem } from './waffle.ts';

const displayFiles = import.meta.glob<{ shortNames: Record<string, string>; fullNames?: Record<string, string> }>('/data/cities/*/*/*/departments.json', {
  eager: true,
  import: 'default',
});

function names(cityPath: string, b: CityBudget, key: 'shortNames' | 'fullNames'): Record<string, string> {
  const names = displayFiles[`${dataDirOf(cityPath)}departments.json`]?.[key] ?? {};
  const ids = new Set(b.departmentReductions[0].departments.map((d) => d.id));
  for (const id of Object.keys(names)) if (!ids.has(id)) throw new Error(`${cityPath}departments.json: "${id}" isn't a department`);
  return names;
}

/** Short display names (e.g. "Police Accountability"); every key must be a department in the budget. */
export function shortNames(cityPath: string, b: CityBudget): Record<string, string> {
  return names(cityPath, b, 'shortNames');
}

/**
 * Every department's name spelled out (#33): "Health, Housing & Community Services", not the budget's
 * "Health, Housing & Community Svcs (HHCS)". Throws if a name would still carry an abbreviation.
 */
export function fullNames(cityPath: string, b: CityBudget): Record<string, string> {
  const spelled = names(cityPath, b, 'fullNames');
  const out = Object.fromEntries(b.departmentReductions[0].departments.map((d) => [d.id, spelled[d.id] ?? d.name]));
  for (const [id, n] of Object.entries(out))
    if (/\(|\b(Dir|Svcs|Rec|Dept)\.?\b/.test(n)) throw new Error(`${cityPath}departments.json: "${id}" needs a fullNames entry; "${n}" is abbreviated`);
  return out;
}

/** The department waffle's squares: each department's full name and family color, linking to its details. */
export function departmentItems(cityPath: string, b: CityBudget, shares: Share<DepartmentReduction>[], families: Families): WaffleItem[] {
  const name = fullNames(cityPath, b);
  return shares.map((s) => ({
    id: s.item.id,
    name: name[s.item.id],
    color: families.color(s.item.id),
    value: s.item.baseline,
    squares: s.squares,
    exact: s.exact,
    href: `${cityPath}departments/#${s.item.id}`,
    details: 'Department details',
  }));
}

/**
 * The Ballot page's passes/fails switch (#36): a year's departments whose cut
 * depends on the vote, biggest difference first, and the ones cut the same either
 * way, deepest cut first. Rows are departmentsPage()'s, so both pages show the
 * same figures and receipts.
 */
export function byOutcome<R extends { years: Record<Year, YearView> }>(rows: R[], y: Year) {
  const gap = (r: R) => r.years[y].netIf.fails.value - r.years[y].netIf.passes.value;
  const differs = rows.filter((r) => gap(r) !== 0).sort((a, c) => gap(c) - gap(a));
  const same = rows
    .filter((r) => gap(r) === 0)
    .sort((a, c) => c.years[y].netIf.fails.value - a.years[y].netIf.fails.value)
    .map((r) => {
      const f = r.years[y].figures.net.fails;
      // One figure for both outcomes, and its receipt says so (each outcome's figure needs its twin, #23).
      return { r, figure: { ...f, label: f.label.replace(/if the sales tax fails \(the full proposed cut\)$/, 'if the sales tax passes or fails (the same either way)') } satisfies Figure };
    });
  for (const s of same) if (!/passes or fails/.test(s.figure.label)) throw new Error(`byOutcome: unexpected label "${s.figure.label}"`);
  const max = Math.max(...differs.map((r) => r.years[y].netIf.fails.value));
  return { differs, same, max };
}

export const TAXES = ['passes', 'fails'] as const;
export const SORTS = ['budget', 'cut'] as const;
/** A budget year's key in the page's radios, ids and URL: "fy2027". */
export type Year = `fy${number}`;
export const yearKey = (year: number): Year => `fy${year}`;
export type Tax = (typeof TAXES)[number];
export type Sort = (typeof SORTS)[number];

/** Not drawn: an accounting line, cut to zero (see the page's footnote). */
export const EXCLUDED = ['it-cost-allocation-plan'];


export interface YearView {
  d: DepartmentReduction;
  /** Exact dollars per $100 of that year's department baseline. */
  per100: number;
  netIf: Record<Tax, { value: number; pct: number }>;
  figures: {
    baseline: Figure;
    cut: Figure;
    softened: Figure;
    net: Record<Tax, Figure>;
  };
}

/**
 * `years` are the city's budget years (city.json) and `yearLabel` names one in the city's style ("FY2027"):
 * every table, label and view is per year, in that order, and the first year is the default view.
 */
export function departmentsPage(b: CityBudget, families: Families, names: Record<string, string>, years: number[], yearLabel: (year: number) => string) {
  const YEARS = years.map(yearKey);
  const labelOf = Object.fromEntries(years.map((y) => [yearKey(y), yearLabel(y)])) as Record<Year, string>;
  const byYear = Object.fromEntries(
    years.map((year) => {
      const table = b.departmentReductions.find((t) => t.year === year);
      if (!table) throw new Error(`departments: no department table for ${yearLabel(year)}`);
      const shares = new Map(per100(table.departments, (d) => d.baseline).map((s) => [s.item.id, s.exact]));
      return [yearKey(year), { table, shares }];
    }),
  ) as Record<Year, { table: CityBudget['departmentReductions'][number]; shares: Map<string, number> }>;
  const [first] = YEARS;

  const view = (y: Year, d: DepartmentReduction): YearView => {
    const L = `${d.name}, ${labelOf[y]}`;
    return {
      d,
      per100: byYear[y].shares.get(d.id)!,
      netIf: { passes: { value: d.netReduction, pct: d.netReductionPct }, fails: { value: d.reduction, pct: d.reductionPct } },
      figures: {
        baseline: { value: d.baseline, label: `${L}: General Fund baseline`, ref: d },
        cut: { value: d.reduction, label: `${L}: proposed cut`, ref: d, tone: 'short' },
        softened: { value: d.salesTaxAllocation, label: `${L}: cut softened by one-time bridge money`, ref: d, tone: 'one-time' },
        net: {
          passes: {
            value: d.netReduction,
            label: `${L}: net cut if the sales tax passes`,
            ref: d,
            tone: 'short',
            parts: [
              { label: 'Proposed cut', value: d.reduction },
              { label: 'Softened by bridge money', value: -d.salesTaxAllocation },
            ],
          },
          fails: { value: d.reduction, label: `${L}: net cut if the sales tax fails (the full proposed cut)`, ref: d, tone: 'short' },
        },
      },
    };
  };

  const ids = byYear[first].table.departments.map((d) => d.id).filter((id) => !EXCLUDED.includes(id));
  const rows = ids.map((id) => {
    const views = Object.fromEntries(YEARS.map((y) => [y, view(y, byYear[y].table.departments.find((d) => d.id === id)!)])) as Record<Year, YearView>;
    const name = views[first].d.name;
    return { id, name, display: names[id] ?? name, charter: views[first].d.charter, family: families.of(id), color: families.color(id), years: views };
  });

  // Row order for every view: biggest baseline first, or deepest net cut % first.
  const order: Record<string, Record<string, number>> = {};
  for (const y of YEARS) {
    for (const t of TAXES) {
      for (const s of SORTS) {
        const sorted = [...rows].sort((a, c) =>
          s === 'budget' ? c.years[y].d.baseline - a.years[y].d.baseline : c.years[y].netIf[t].pct - a.years[y].netIf[t].pct || c.years[y].d.baseline - a.years[y].d.baseline,
        );
        sorted.forEach((r, i) => ((order[r.id] ??= {})[`${y}-${t}-${s}`] = i));
      }
    }
  }

  const max = Object.fromEntries(YEARS.map((y) => [y, Math.max(...rows.map((r) => r.years[y].d.baseline))])) as Record<Year, number>;
  const excluded = EXCLUDED.map((id) => {
    const d = byYear[first].table.departments.find((x) => x.id === id)!;
    return { d, figure: { value: d.baseline, label: `${d.name}, ${labelOf[first]}: baseline (cut entirely)`, ref: d } satisfies Figure };
  });
  const total = byYear[first].table.total;
  const safety = rows.filter((r) => r.family.id === 'safety').sort((a, c) => c.years[first].d.baseline - a.years[first].d.baseline);
  const safetyShare = safety.reduce((a, r) => a + r.years[first].per100, 0) / 100;

  return {
    /** The year keys, in order; the first is the default view. */
    years: YEARS,
    rows,
    order,
    /** Shown before anything is selected: the first row in the default view. */
    defaultId: rows.find((r) => order[r.id][`${first}-passes-budget`] === 0)!.id,
    max,
    excluded,
    note: byYear[first].table.note.replace(/^Note:\s*/, ''),
    total: {
      cut: { value: total.reduction, label: `${labelOf[first]} proposed department cuts, citywide`, ref: total, tone: 'short' } satisfies Figure,
      pct: total.reductionPct,
      baseline: total.baseline,
    },
    /** For the panel's note on the biggest family, when it's over half the baseline. */
    safety: { ids: safety.map((r) => r.id), names: safety.map((r) => r.name), share: safetyShare },
  };
}
