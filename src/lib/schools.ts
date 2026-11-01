/**
 * The school district's budget page (#52), ready to render: every paragraph of schools.json as segments,
 * every figure with its receipt, the revenue as a $100 waffle, and spending with shares derived from its
 * own dollars. Nothing here is typed in: schools.json reads each figure from its quote, and the build
 * has already checked that the parts reconcile to the totals.
 */
import type { CityBudget, CoverageParagraph, DocRef, SchoolsAmount } from '../data/types.ts';
import type { City } from './cities.ts';
import { fy } from './city-settings.ts';
import { paragraphSegments, type Segment } from './coverage.ts';
import { shortMoney } from './format.ts';
import type { Figure } from './receipts.ts';
import { per100, type WaffleItem } from './waffle.ts';

export interface SchoolsParagraph {
  segments: Segment[];
  cites: DocRef[];
}

const dollars = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;

export function schoolsFor(city: City, budget: CityBudget) {
  const s = budget.schools;
  if (!s) return undefined;
  const year = fy(city.budget.labels, budget.generalFund[0].year);
  const figure = (a: SchoolsAmount, label: string): Figure => ({ value: a.value, label: `${s.short} ${label}, ${s.fiscalYear}`, ref: a, tone: 'neutral' });
  const exact = (a: SchoolsAmount, label: string): Segment => ({ kind: 'figure', text: dollars(a.value), figure: figure(a, label) });
  const tokens: Record<string, Segment> = {
    year: { kind: 'text', text: year },
    revenueExact: exact(s.revenue.exact, 'General Fund revenue, State budget form'),
    parcelForm: exact(s.revenue.parcelForm, 'parcel taxes, State budget form'),
    spendingExact: exact(s.spending.exact, 'General Fund spending, State budget form'),
  };
  const paragraph = (p: CoverageParagraph): SchoolsParagraph => ({ segments: paragraphSegments(city, p.text, tokens), cites: p.cites ?? [] });

  const revenueTotal = figure(s.revenue.total, 'General Fund revenue');
  const shares = per100(s.revenue.parts, (p) => p.amount.value);
  const waffle: WaffleItem[] = shares.map(({ item: p, squares, exact }) => ({
    id: p.id,
    name: p.name,
    color: p.color!,
    value: p.amount.value,
    squares,
    exact,
    href: `#rev-${p.id}`,
    details: 'What this is',
  }));
  const spendingTotal = s.spending.exact.value;

  return {
    district: s.district,
    short: s.short,
    fiscalYear: s.fiscalYear,
    banner: paragraph(s.banner),
    year: paragraph(s.year),
    revenue: {
      total: revenueTotal,
      totalText: shortMoney(revenueTotal.value),
      waffle,
      parts: shares.map(({ item: p, exact: per }) => ({
        id: p.id,
        name: p.name,
        color: p.color!,
        figure: figure(p.amount, p.name.toLowerCase()),
        text: shortMoney(p.amount.value),
        per,
        about: p.about && paragraph(p.about),
      })),
      notes: s.revenue.notes.map(paragraph),
    },
    spending: {
      total: figure(s.spending.total, 'General Fund spending'),
      totalText: shortMoney(s.spending.total.value),
      // Shares of the State form's total, from its own dollars; the credit row has none.
      rows: s.spending.rows.map((r) => ({
        id: r.id,
        name: r.name,
        figure: { ...figure(r.amount, r.name.toLowerCase()), parts: undefined },
        text: shortMoney(r.amount.value),
        share: r.amount.value > 0 ? r.amount.value / spendingTotal : undefined,
        about: r.about && paragraph(r.about),
      })),
      notes: s.spending.notes.map(paragraph),
    },
    balance: { paragraphs: s.balance.paragraphs.map(paragraph), quotes: s.balance.quotes },
    parcelTaxes: s.parcelTaxes.map((t) => ({
      id: t.id,
      name: t.name,
      measure: paragraph(t.measure),
      figure: figure(t.amount, t.name),
      text: shortMoney(t.amount.value),
      pays: paragraph(t.pays),
    })),
    links: s.links.map((id) => budget.sources.find((src) => src.id === id)!),
  };
}
