/**
 * Figures for a city's overview page, all computed from budget.json and the
 * city's editorial groupings (families, revenue groups). Pages render these;
 * nothing numeric is typed into the page.
 */
import type { CityBudget } from '../data/types.ts';
import type { Families } from './families.ts';
import type { Figure } from './receipts.ts';
import type { RevenueGroup } from './revenue-groups.ts';
import { per100 } from './waffle.ts';

export function overview(b: CityBudget, families: Families, revenueGroups: RevenueGroup[]) {
  const fy27 = b.departmentReductions.find((y) => y.year === 2027)!;
  const step = (key: string) => b.deficitBridge.steps.find((s) => s.key === key)!;
  const fte = b.fte.scenarios.find((s) => s.key === 'without-sales-tax')!;
  const shares = per100(fy27.departments, (d) => d.baseline);
  const familyTotals = families.list.map((f) => {
    const members = shares.filter((s) => families.of(s.item.id).id === f.id);
    return { family: f, dollars: members.reduce((a, s) => a + s.squares, 0), exact: members.reduce((a, s) => a + s.exact, 0) };
  });

  // Revenue mix, biggest group first, "Everything else" last.
  const mix = [...revenueGroups].sort((a, b2) => (a.id === 'other' ? 1 : b2.id === 'other' ? -1 : b2.adopted - a.adopted));
  const property = revenueGroups.find((g) => g.id === 'property-tax')!;
  const transfer = revenueGroups.find((g) => g.id === 'transfer-tax')!;

  const adjustments = ['center-street-debt-service', 'parking-funds-stabilization', 'non-departmental'].map(step);
  // `short` labels the mini chart's bars (#25); `note` is the step's "what is this?" (src/data/documents.ts checks its quotes).
  const notes = b.documentFacts.stepNotes;
  const waterfall = [
    { key: 'initial', label: 'Initial estimate', short: 'First estimate', note: notes['initial-estimate'], value: step('initial-estimate').years[2027], kind: 'total' as const },
    { key: 'revenue', label: 'Revenue came in higher', short: 'Higher revenue', note: notes['revenue-projections'], value: step('revenue-projections').years[2027], kind: 'up' as const },
    { key: 'adjustments', label: 'Three adjustments', short: `${adjustments.length} adjustments`, note: notes.adjustments, value: adjustments.reduce((a, s) => a + s.years[2027], 0), kind: 'cost' as const },
    { key: 'one-time', label: 'One-time money', short: 'One-time money', note: notes['one-time-resources'], value: step('one-time-resources').years[2027], kind: 'one-time' as const },
    { key: 'final', label: 'The gap', short: 'Gap left', note: notes['final-gap'], value: step('final-gap').years[2027], kind: 'total' as const },
  ];

  const g = b.citedFacts.growth;
  const growth = Array.from({ length: g.years + 1 }, (_, year) => ({
    year,
    spending: 100 * (1 + g.spendingRate) ** year,
    revenue: 100 * (1 + g.revenueRate) ** year,
  }));

  const withTax = b.fte.positions.find((p) => p.key === 'with-sales-tax')!;
  const withoutTax = b.fte.positions.find((p) => p.key === 'without-sales-tax')!;
  const sourceCounts = { city: b.sources.filter((s) => s.type === 'city').length, news: b.sources.filter((s) => s.type === 'news').length };

  return {
    shares,
    familyTotals,
    departments: fy27.departments,
    /** The whole budget, and its General Fund (adoption report). A different document and basis from the
     *  baseline below (S1's planning figure), so the page never shows a difference between them. */
    size: {
      allFunds: { value: b.documentFacts.allFunds.amount, label: 'Citywide spending, all funds, FY2027 (gross appropriations)', ref: b.documentFacts.allFunds, tone: 'neutral' } satisfies Figure,
      generalFund: { value: b.documentFacts.generalFund.amount, label: 'General Fund spending, FY2027', ref: b.documentFacts.generalFund, tone: 'neutral' } satisfies Figure,
    },
    baseline: {
      value: fy27.total.baseline,
      label: 'General Fund department baseline before proposed cuts, FY2027 (planning figure)',
      ref: fy27.total,
    } satisfies Figure,
    fte: {
      value: fte.baselineFte,
      label: 'Staff positions (FTE), FY2027 baseline, all funds',
      ref: fte,
      format: 'number',
      tone: 'neutral',
    } satisfies Figure,
    gap: { value: step('final-gap').years[2027], label: 'FY2027 General Fund gap, after adjustments', ref: step('final-gap') } satisfies Figure,
    revenue: {
      mix,
      total: { value: b.revenue.total.fy2026Adopted, label: 'General Fund revenue and transfers, FY2026 adopted', ref: b.revenue.total } satisfies Figure,
      property,
      transfer,
      /** "About $1 of every $3 the City collects is property tax." */
      oneIn: Math.round(1 / property.share),
    },
    waterfall: waterfall.map((w) => ({
      ...w,
      figure: {
        value: w.value,
        label: `FY2027 deficit bridge: ${w.label.toLowerCase()}`,
        ref: w.key === 'adjustments' ? adjustments[0] : step(
          { initial: 'initial-estimate', revenue: 'revenue-projections', 'one-time': 'one-time-resources', final: 'final-gap' }[w.key as 'initial']),
        ...(w.key === 'adjustments'
          ? { parts: adjustments.map((s) => ({ label: `${s.label.replace(/^Adjustment:\s*/, '')} (row ${s.row})`, value: s.years[2027] })) }
          : {}),
        tone: w.kind === 'one-time' ? 'one-time' : undefined,
      } satisfies Figure,
    })),
    ballot: {
      withTax: { value: withTax.total, label: 'Positions cut if the sales tax passes', ref: withTax, format: 'number', tone: 'neutral' } satisfies Figure,
      withoutTax: { value: withoutTax.total, label: 'Positions cut if the sales tax fails', ref: withoutTax, format: 'number', tone: 'neutral' } satisfies Figure,
      salesTaxLetter: b.documentFacts.salesTaxMeasure.letter,
    },
    growth: {
      series: growth,
      cited: g,
      figure: { value: g.spendingRate, label: `Average yearly growth in General Fund spending over ${g.years} years (revenue: ${(g.revenueRate * 100).toLocaleString('en-US')}%)`, ref: g, format: 'percent', tone: 'neutral' } satisfies Figure,
    },
    sourceCounts,
    sourceIds: b.sources.map((s) => s.id),
  };
}
