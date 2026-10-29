/**
 * Figures for a city's overview page, all computed from budget.json and the
 * city's editorial groupings (families, revenue groups). Pages render these;
 * nothing numeric is typed into the page. cityOverview() is what every city
 * has; gapOverview() adds a deficit plan's bridge, growth and ballot (#43).
 */
import type { CityBudget, GapBudget } from '../data/types.ts';
import type { Families } from './families.ts';
import type { Figure } from './receipts.ts';
import type { RevenueGroup } from './revenue-groups.ts';
import { per100 } from './waffle.ts';

/** `yearLabel` names a fiscal year in the city's style ("FY2027", "FY 2026/27"). */
export function cityOverview(b: CityBudget, families: Families, revenueGroups: RevenueGroup[], yearLabel: (year: number) => string) {
  const uses = b.generalFund[0];
  const departments = uses.lines.filter((l) => l.kind === 'department');
  const shares = per100(departments, (d) => d.amount);
  const familyTotals = families.list.map((f) => {
    const members = shares.filter((s) => families.of(s.item.id).id === f.id);
    return { family: f, dollars: members.reduce((a, s) => a + s.squares, 0), exact: members.reduce((a, s) => a + s.exact, 0) };
  });
  const y = yearLabel(uses.year);
  const deptLabel = `${uses.basis}, ${y}${uses.note ? ` (${uses.note})` : ''}`;
  // The departments' total is the table's total when every line is a department (Berkeley's baseline);
  // otherwise it is their sum, built on the receipt from each line.
  const baseline: Figure =
    departments.length === uses.lines.length
      ? { value: uses.total.amount, label: deptLabel, ref: uses.total }
      : {
          value: departments.reduce((a, d) => a + d.amount, 0),
          label: deptLabel,
          ref: departments[0],
          tone: 'neutral',
          parts: departments.map((d) => ({ label: d.name, value: d.amount })),
        };

  // Revenue mix, biggest group first, "Everything else" last.
  const mix = [...revenueGroups].sort((a, b2) => (a.id === 'other' ? 1 : b2.id === 'other' ? -1 : b2.adopted - a.adopted));
  const byShare = mix.filter((g) => g.id !== 'other');
  const property = revenueGroups.find((g) => g.id === 'property-tax')!;
  const primary = b.revenue.columns.find((c) => c.key === b.revenue.primary)!;
  const sourceCounts = { city: b.sources.filter((s) => s.type === 'city').length, news: b.sources.filter((s) => s.type === 'news').length };
  const size = b.size;

  return {
    shares,
    familyTotals,
    departments,
    /** The departments' chart noun ("department baseline") and year. */
    uses: { noun: uses.noun, year: uses.year },
    /** The whole budget, and its General Fund. For Berkeley a different document and basis from the
     *  baseline below (S1's planning figure), so the page never shows a difference between them. */
    size: {
      allFunds: { value: size.allFunds.amount, label: `Citywide spending, all funds, ${y}${size.allFunds.note ? ` (${size.allFunds.note})` : ''}`, ref: size.allFunds, tone: 'neutral' } satisfies Figure,
      generalFund: { value: size.generalFund.amount, label: `General Fund spending, ${y}${size.generalFund.note ? ` (${size.generalFund.note})` : ''}`, ref: size.generalFund, tone: 'neutral' } satisfies Figure,
    },
    baseline,
    fte: {
      value: b.staffing.fte,
      label: `Staff positions (FTE), ${yearLabel(b.staffing.year)} ${b.staffing.basis}`,
      ref: b.staffing,
      format: 'number',
      tone: 'neutral',
    } satisfies Figure,
    revenue: {
      mix,
      /** The year the revenue figures are for (Berkeley reports the year in progress). */
      year: primary.year,
      total: { value: b.revenue.total.values[b.revenue.primary], label: `${b.revenue.totalName}, ${yearLabel(primary.year)} ${primary.basis}`, ref: b.revenue.total } satisfies Figure,
      property,
      /** The biggest group after property tax. */
      second: byShare.find((g) => g.id !== 'property-tax')!,
      transfer: revenueGroups.find((g) => g.id === 'transfer-tax'),
      /** "About $1 of every $3 the City collects is property tax." */
      oneIn: Math.round(1 / property.share),
    },
    sourceCounts,
    sourceIds: b.sources.map((s) => s.id),
  };
}

/** A deficit plan's overview figures: the gap, the mini waterfall, cost growth and the ballot. */
export function gapOverview(b: GapBudget) {
  const step = (key: string) => b.deficitBridge.steps.find((s) => s.key === key)!;
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

  return {
    gap: { value: step('final-gap').years[2027], label: 'FY2027 General Fund gap, after adjustments', ref: step('final-gap') } satisfies Figure,
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
  };
}

/** Berkeley's overview: the city's figures and its deficit plan's. */
export function overview(b: GapBudget, families: Families, revenueGroups: RevenueGroup[], yearLabel: (year: number) => string = (y) => `FY${y}`) {
  return { ...cityOverview(b, families, revenueGroups, yearLabel), ...gapOverview(b) };
}
