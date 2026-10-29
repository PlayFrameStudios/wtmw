/**
 * Tie-out checks for Berkeley's budget.json. The build fails if any of these
 * return a message. Pinned figures come from #3's acceptance criteria and
 * the City's own documents; the rest tie each TOTAL row to its line items.
 */
import type { CrossCheck, Ref, SourceId, WorkbookBudget } from '../types.ts';

export const PINNED = {
  fy2027DepartmentCount: 16,
  fy2027Baseline: 283_764_035,
  fy2027Reductions: 29_251_348,
  fy2027NetReductionsWithSalesTax: 19_808_353,
  fy2026RevenueTotal: 311_935_259,
  fy2027FinalGap: -29_249_339,
  fy2028FinalGap: -29_532_958,
  sourceCount: 19,
} as const;

const fmt = (n: number | null) => (n === null ? 'null' : n.toLocaleString('en-US', { maximumFractionDigits: 6 }));

export function validateBerkeley(budget: WorkbookBudget, checks: CrossCheck[] = []): string[] {
  const errors: string[] = [];
  const expectEqual = (what: string, actual: number, expected: number, tolerance = 0) => {
    if (!(Math.abs(actual - expected) <= tolerance)) {
      errors.push(`${what}: expected ${fmt(expected)}${tolerance ? ` (±${tolerance})` : ''}, got ${fmt(actual)}`);
    }
  };
  const sum = <T>(items: T[], pick: (t: T) => number) => items.reduce((a, t) => a + pick(t), 0);

  // Departments
  const [fy27, fy28] = budget.departmentReductions;
  expectEqual('FY27 department count', fy27.departments.length, PINNED.fy2027DepartmentCount);
  expectEqual('FY27 sum of department baselines', sum(fy27.departments, (d) => d.baseline), PINNED.fy2027Baseline);
  expectEqual('FY27 sum of proposed reductions', sum(fy27.departments, (d) => d.reduction), PINNED.fy2027Reductions);
  expectEqual(
    'FY27 sum of net reductions with the sales tax',
    sum(fy27.departments, (d) => d.netReduction),
    PINNED.fy2027NetReductionsWithSalesTax,
  );
  for (const year of [fy27, fy28]) {
    expectEqual(`FY${year.year} TOTAL row baseline (expected = sum of department rows)`, year.total.baseline, sum(year.departments, (d) => d.baseline));
    expectEqual(`FY${year.year} TOTAL row reduction (expected = sum of department rows)`, year.total.reduction, sum(year.departments, (d) => d.reduction));
    expectEqual(
      `FY${year.year} TOTAL row sales-tax allocation (expected = sum of department rows)`,
      year.total.salesTaxAllocation,
      sum(year.departments, (d) => d.salesTaxAllocation),
    );
    const charter = year.departments.filter((d) => d.charter).map((d) => d.id);
    if (charter.length !== 4) errors.push(`FY${year.year}: expected 4 charter offices, found [${charter.join(', ')}]`);
    const ids = year.departments.map((d) => d.id);
    if (new Set(ids).size !== ids.length) errors.push(`FY${year.year}: duplicate department ids [${ids.join(', ')}]`);
  }
  if (fy28.departments.map((d) => d.id).join() !== fy27.departments.map((d) => d.id).join()) {
    errors.push('FY27 and FY28 list different departments');
  }

  // Revenue
  const rev = budget.revenue;
  expectEqual('FY26 revenue TOTAL row', rev.total.fy2026Adopted, PINNED.fy2026RevenueTotal);
  expectEqual('FY26 adopted revenue lines vs TOTAL row', sum(rev.lines, (l) => l.fy2026Adopted), rev.total.fy2026Adopted, 2);
  expectEqual(
    'FY26 mid-year actual lines vs TOTAL row',
    sum(rev.lines, (l) => l.fy2026MidYearActual),
    rev.total.fy2026MidYearActual,
    2,
  );
  expectEqual(
    'FY25 mid-year actual lines vs TOTAL row',
    sum(rev.lines, (l) => l.fy2025MidYearActual),
    rev.total.fy2025MidYearActual,
    2,
  );

  // Deficit bridge: each subtotal is everything above it; the inputs alone must reach the final gap.
  const steps = budget.deficitBridge.steps;
  const final = steps.find((s) => s.key === 'final-gap');
  if (!final) errors.push('deficit bridge has no final-gap step');
  for (const year of [2027, 2028]) {
    const inputs = sum(
      steps.filter((s) => s.kind === 'estimate' || s.kind === 'change'),
      (s) => s.years[year],
    );
    if (final) expectEqual(`FY${year} bridge: initial + revenue + adjustments + one-time = final gap`, inputs, final.years[year]);
  }
  if (final) {
    expectEqual('FY27 final gap', final.years[2027], PINNED.fy2027FinalGap);
    expectEqual('FY28 final gap', final.years[2028], PINNED.fy2028FinalGap);
  }

  // One-time resources, capital, personnel
  const ot = budget.oneTimeResources;
  expectEqual('one-time remaining = sources - uses', ot.remaining, ot.totalSources - ot.totalUses);
  const cap = budget.capitalProgram;
  for (const year of [2027, 2028]) expectEqual(`CIP FY${year} lines vs TOTAL row`, sum(cap.lines, (l) => l.years[year]), cap.total.years[year]);
  expectEqual(
    'GF cost composition total vs FY26 revenue total',
    budget.personnelAndPension.compositionTotal.amount,
    rev.total.fy2026Adopted,
  );

  // Cited facts parse to sensible values.
  const { growth, salesTax, bond } = budget.citedFacts;
  if (!(growth.spendingRate > growth.revenueRate && growth.revenueRate > 0 && growth.years > 0)) {
    errors.push(`cited growth rates look wrong: spending ${growth.spendingRate}, revenue ${growth.revenueRate}, ${growth.years} years`);
  }
  if (!(salesTax.rate > 0 && salesTax.rate < 0.05)) errors.push(`cited sales-tax rate looks wrong: ${salesTax.rate}`);
  if (!(bond.amount >= 1e6)) errors.push(`cited bond amount looks wrong: ${bond.amount}`);
  if (!(salesTax.newRate > salesTax.rate)) errors.push(`cited new sales-tax rate looks wrong: ${salesTax.newRate}`);
  const { backlog } = budget.citedFacts;
  if (!(backlog.low > 0 && backlog.low <= backlog.high)) errors.push('cited infrastructure backlog range looks wrong');

  // Our arithmetic matches Excel's wherever Excel stored a result.
  for (const c of checks) {
    if (c.computed === null || Math.abs(c.computed - c.cached) > 1e-6 * Math.max(1, Math.abs(c.cached))) {
      errors.push(`${c.what}: computed ${fmt(c.computed)} but the workbook says ${fmt(c.cached)}`);
    }
  }

  // Sources: S1..S19 in order, and every record's source resolves.
  const ids = budget.sources.map((s) => s.id);
  const expectedIds = Array.from({ length: PINNED.sourceCount }, (_, i) => `S${i + 1}`);
  if (ids.join() !== expectedIds.join()) errors.push(`sources: expected ${expectedIds.join(',')}, got ${ids.join(',')}`);
  for (const s of budget.sources) {
    if ((s.type === 'city') !== (s.publisher === 'City of Berkeley')) {
      errors.push(`${s.id}: type "${s.type}" but publisher "${s.publisher}"`);
    }
  }
  const known = new Set<SourceId>(ids);
  for (const ref of allRefs(budget)) {
    for (const id of [ref.source, ...(ref.related ?? [])]) {
      if (!known.has(id)) errors.push(`${ref.table} row ${ref.row}: source ${id} is not in Sources & Links`);
    }
  }

  return errors;
}

/** Every record that carries a source, for checks that must cover all of them. */
export function allRefs(b: WorkbookBudget): Ref[] {
  return [
    ...b.revenue.lines,
    b.revenue.total,
    ...b.deficitBridge.steps,
    ...b.departmentReductions.flatMap((y) => [...y.departments, y.total]),
    ...b.fte.scenarios,
    ...b.fte.positions,
    ...b.oneTimeResources.sources,
    ...b.oneTimeResources.uses,
    ...b.capitalProgram.lines,
    b.capitalProgram.total,
    ...b.personnelAndPension.composition,
    b.personnelAndPension.compositionTotal,
    b.personnelAndPension.personnelSubtotal,
    ...b.personnelAndPension.unfundedLiabilities,
    b.citedFacts.growth,
    b.citedFacts.salesTax,
    b.citedFacts.bond,
    b.citedFacts.backlog,
  ];
}
