/**
 * Figures for the Revenue page of a city whose budget reports revenue by year rather than
 * by mid-year pace (#43): the adopted year's $100 chart by group, and each line's last
 * actual year, the current year's estimate, the adopted budget and the City's forecast.
 */
import type { BudgetColumn, CityBudget, RevenueLine } from '../data/types.ts';
import type { Figure } from './receipts.ts';
import type { RevenueGroup } from './revenue-groups.ts';
import { per100, type WaffleItem } from './waffle.ts';

const BASIS: Record<BudgetColumn['basis'], string> = {
  adopted: 'adopted',
  revised: 'revised',
  estimate: 'estimate',
  actual: 'actual',
  'mid-year-actual': 'mid-year actual',
  projected: 'forecast',
};

export function revenueOutlook(b: CityBudget, groups: RevenueGroup[], yearLabel: (year: number) => string) {
  const rev = b.revenue;
  const primary = rev.columns.find((c) => c.key === rev.primary)!;
  // One column per year: actuals, the year in progress's estimate, the adopted budget, the forecast.
  const shown = rev.columns.filter((c) => c.key === rev.primary || ['actual', 'estimate', 'projected'].includes(c.basis));
  const before = shown.filter((c) => c.year === primary.year - 1)[0];
  const colLabel = (c: BudgetColumn) => `${yearLabel(c.year)} ${BASIS[c.basis]}`;
  const cell = (l: RevenueLine, c: BudgetColumn): Figure => ({
    value: l.values[c.key],
    label: `${l.name}: ${colLabel(c)}`,
    ref: l.cites?.[c.key] ?? l,
    tone: 'neutral',
  });
  const change = (l: RevenueLine) => (before && l.values[before.key] ? l.values[rev.primary] / l.values[before.key] - 1 : null);
  const row = (l: RevenueLine) => ({ name: l.name, cells: shown.map((c) => ({ key: c.key, figure: cell(l, c) })), change: change(l) });

  const shares = per100(groups, (g) => g.adopted).sort((a, c) => Number(a.item.id === 'other') - Number(c.item.id === 'other'));
  const chart = shares.map((s) => ({
    item: {
      id: s.item.id,
      name: s.item.name,
      color: s.item.color,
      value: s.item.adopted,
      squares: s.squares,
      exact: s.exact,
      href: `#rev-${s.item.id}`,
      details: 'Line items',
    } satisfies WaffleItem,
    group: s.item,
  }));

  return {
    year: primary.year,
    columns: shown.map((c) => ({ key: c.key, label: colLabel(c), primary: c.key === rev.primary, year: c.year, basis: c.basis })),
    /** The column the change is measured from: the year before the adopted one. */
    before: before && colLabel(before),
    chart,
    lines: [...rev.lines].sort((a, c) => c.values[rev.primary] - a.values[rev.primary]).map(row),
    total: row(rev.total),
    totalFigure: { value: rev.total.values[rev.primary], label: `${rev.totalName}, ${colLabel(primary)}`, ref: rev.total, tone: 'neutral' } satisfies Figure,
  };
}
