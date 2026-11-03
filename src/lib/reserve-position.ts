/**
 * Where a City's reserve stands against its own policy (#59), ready to render: what the budget year draws from
 * (or adds to) it, the share of spending it ends at, the policy minimum, and the forecast's last year, each figure
 * its own receipt. From budget.json's reservePosition; undefined for a city whose budget doesn't state one.
 */
import type { CityBudget } from '../data/types.ts';
import type { Figure } from './receipts.ts';

export function reservePositionOf(b: CityBudget, yearLabel: (year: number) => string) {
  const r = b.reservePosition;
  if (!r) return undefined;
  const y = yearLabel(r.year);
  return {
    year: r.year,
    balance: { value: r.balance.amount, label: `Reserve at the end of ${y}`, ref: r.balance, tone: 'neutral' } satisfies Figure,
    level: { value: r.level.rate, label: `Reserve at the end of ${y}, as a share of General Fund spending`, ref: r.level, format: 'percent', tone: 'neutral' } satisfies Figure,
    policy: { value: r.policy.rate, label: 'The City’s minimum reserve, as a share of General Fund spending', ref: r.policy, format: 'percent', tone: 'neutral' } satisfies Figure,
    // A draw is shown as an amount drawn, not a shortfall: the City plans it (the notes say why), so it isn't red.
    change: r.change && {
      drawn: r.change.amount < 0,
      figure: { value: Math.abs(r.change.amount), label: `${r.change.amount < 0 ? 'Drawn from' : 'Added to'} the reserve in ${y}, in the City’s forecast`, ref: r.change, tone: 'neutral' } satisfies Figure,
    },
    outlook: r.outlook && {
      year: r.outlook.year,
      belowPolicy: r.outlook.rate < r.policy.rate,
      figure: { value: r.outlook.rate, label: `Reserve at the end of ${yearLabel(r.outlook.year)}, as a share of General Fund spending, in the City’s forecast`, ref: r.outlook, format: 'percent', tone: 'neutral' } satisfies Figure,
    },
    notes: r.notes ?? [],
  };
}
