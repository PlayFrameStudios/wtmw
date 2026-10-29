/**
 * The headline figures the landing page quotes for a city, each computed from
 * budget.json (the same derivations as the approved mockups) and carrying the
 * record it came from, so its chip can open a receipt.
 */
import type { CityBudget } from '../data/types.ts';
import type { Families } from './families.ts';
import type { Figure } from './receipts.ts';
import { per100 } from './waffle.ts';

export function headlines(b: CityBudget, families: Families) {
  const fy27 = b.departmentReductions.find((y) => y.year === 2027)!;
  const gap = b.deficitBridge.steps.find((s) => s.key === 'final-gap')!;
  const withTax = b.fte.positions.find((p) => p.key === 'with-sales-tax')!;
  const withoutTax = b.fte.positions.find((p) => p.key === 'without-sales-tax')!;
  const shares = per100(fy27.departments, (d) => d.baseline);
  const safety = shares.filter((s) => families.of(s.item.id).id === 'safety');
  const police = fy27.departments.find((d) => d.id === 'police')!;
  const fire = fy27.departments.find((d) => d.id === 'fire')!;

  return {
    shares,
    baseline: {
      value: fy27.total.baseline,
      label: 'General Fund department baseline before proposed cuts, FY2027 (planning figure)',
      ref: fy27.total,
    } satisfies Figure,
    sourceCount: b.sources.length,
    /** Whole dollars of every $100 that go to Public safety (Police and Fire). */
    safetyPer100: safety.reduce((a, s) => a + s.squares, 0),
    safetyNames: safety.map((s) => s.item.name),
    safety: {
      value: police.baseline + fire.baseline,
      label: 'Police and Fire department baselines, FY2027',
      ref: police,
      parts: [
        { label: `Police (row ${police.row})`, value: police.baseline },
        { label: `Fire (row ${fire.row})`, value: fire.baseline },
      ],
    } satisfies Figure,
    gap: { value: gap.years[2027], label: 'FY2027 General Fund gap, after adjustments', ref: gap } satisfies Figure,
    positionsWithTax: {
      value: withTax.total,
      label: `Positions cut if the sales tax passes (${withoutTax.total} if it fails)`,
      ref: withTax,
      format: 'number',
      tone: 'neutral',
    } satisfies Figure,
    positionsWithoutTax: withoutTax.total,
    cuts: {
      value: fy27.total.reduction,
      label: 'Proposed General Fund department cuts, FY2027, before the one-time bridge',
      ref: fy27.total,
      tone: 'short',
    } satisfies Figure,
    departmentsCut: fy27.departments.filter((d) => d.reduction > 0).length,
  };
}
