/**
 * Figures for the Capital page of a city whose budget gives its capital plan by program
 * category and year (#43): each category's spending per year and over the plan, as printed.
 */
import type { CapitalPlan } from '../data/types.ts';
import type { Figure } from './receipts.ts';

export function capitalPlanPage(plan: CapitalPlan, yearLabel: (year: number) => string) {
  // A one-year program (Lafayette's, #59) is its year; a multi-year plan, its first year to its last.
  const span = plan.years.length === 1 ? yearLabel(plan.years[0]) : `${yearLabel(plan.years[0])}–${yearLabel(plan.years[plan.years.length - 1]).replace(/^FY ?/, '')}`;
  const row = (l: CapitalPlan['lines'][number] | (CapitalPlan['total'] & { name: string })) => ({
    name: l.name,
    years: plan.years.map((y) => ({ year: y, figure: { value: l.years[y], label: `${l.name}, ${yearLabel(y)}: capital plan`, ref: l.cites?.[y] ?? l, tone: 'neutral' } satisfies Figure })),
    total: { value: l.total, label: `${l.name}: capital plan, ${span}`, ref: l, tone: 'neutral' } satisfies Figure,
    share: l.total / plan.total.total,
  });
  return {
    title: plan.title,
    span,
    unit: plan.unit ?? 'program',
    /** Read from a page the City printed as an image (#59): every figure's receipt says so. */
    scanned: Boolean(plan.total.scanned),
    years: plan.years.map((y) => ({ year: y, label: yearLabel(y) })),
    lines: [...plan.lines].sort((a, c) => c.total - a.total).map(row),
    total: row({ ...plan.total, name: 'Total' }),
  };
}
