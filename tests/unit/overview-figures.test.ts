import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { budgetFor } from '../../src/lib/budget';
import { cities } from '../../src/lib/cities';
import { familiesFor } from '../../src/lib/families';
import { overview } from '../../src/lib/overview';
import { groupRevenue, revenueGroupsFor } from '../../src/lib/revenue-groups';

const city = cities[0];
const budget = budgetFor(city)!;
const families = familiesFor(city, budget);
const groups = revenueGroupsFor(city, budget);
const o = overview(budget, families, groups);
const defs = JSON.parse(readFileSync(join(import.meta.dirname, '../../data/cities/us/ca/berkeley/revenue-groups.json'), 'utf8')).groups;

describe('revenue groups', () => {
  it('cover every revenue line once and add up to the TOTAL row (±2)', () => {
    expect(groups).toHaveLength(11);
    expect(Math.abs(groups.reduce((a, g) => a + g.adopted, 0) - budget.revenue.total.fy2026Adopted)).toBeLessThanOrEqual(2);
  });

  it('refuse a line in two groups, a missing line, or an unknown one', () => {
    const twice = structuredClone(defs);
    twice[1].lines.push('Secured Property Tax');
    expect(() => groupRevenue(twice, budget.revenue, 'x')).toThrow('"Secured Property Tax" is in both property-tax and transfer-tax');
    const missing = structuredClone(defs);
    missing.at(-1).lines.pop();
    expect(() => groupRevenue(missing, budget.revenue, 'x')).toThrow('not in any group: Other Revenue');
    const unknown = structuredClone(defs);
    unknown[0].lines.push('Lottery');
    expect(() => groupRevenue(unknown, budget.revenue, 'x')).toThrow('"Lottery" (in property-tax) isn\'t a revenue line');
  });

  it('make property tax about 1 in 3, and home-sale taxes about 10%', () => {
    expect(Math.round(o.revenue.property.share * 100)).toBe(33);
    expect(o.revenue.oneIn).toBe(3);
    expect(Math.round(o.revenue.transfer.share * 100)).toBe(10);
  });
});

describe('cited facts', () => {
  it('parse the sentences the workbook states them in', () => {
    expect(budget.citedFacts.growth).toMatchObject({ years: 10, spendingRate: 0.08, revenueRate: 0.065, source: 'S12' });
    expect(budget.citedFacts.salesTax).toMatchObject({ rate: 0.005, election: 'Nov 2026', source: 'S5', related: ['S15', 'S16'], newRate: 0.1075, threshold: 'simple majority' });
    expect(budget.citedFacts.bond).toMatchObject({ amount: 300_000_000, election: 'Nov 2026', source: 'S3', threshold: '2/3', repaidBy: 'property tax' });
    expect(budget.citedFacts.backlog).toMatchObject({ low: 1_650_000_000, high: 2_000_000_000, sidewalkMiles: '300+', parks: 54, buildings: 95, source: 'S6' });
  });
});

describe('overview figures', () => {
  it('stat row: baseline, FTE, gap', () => {
    expect(o.baseline.value).toBe(283_764_035);
    expect(Math.round(o.fte.value)).toBe(1560);
    expect(o.gap.value).toBe(-29_249_339);
  });

  it('families: $57 / $22 / $17 / $4', () => {
    expect(o.familyTotals.map((f) => f.dollars)).toEqual([57, 22, 17, 4]);
  });

  it('the mini waterfall adds up to the gap, one-time money included', () => {
    expect(o.waterfall.map((w) => w.key)).toEqual(['initial', 'revenue', 'adjustments', 'one-time', 'final']);
    const [initial, ...rest] = o.waterfall;
    const steps = rest.slice(0, -1).reduce((a, w) => a + w.value, initial.value);
    expect(steps).toBe(o.waterfall.at(-1)!.value);
  });

  it('compounds the cited rates from 100 to 216 and 188 over ten years', () => {
    const end = o.growth.series.at(-1)!;
    expect([end.year, Math.round(end.spending), Math.round(end.revenue)]).toEqual([10, 216, 188]);
  });

  it('follows the data when it changes', () => {
    const b = structuredClone(budget);
    b.citedFacts.growth.spendingRate = 0.09;
    b.fte.scenarios.find((s) => s.key === 'without-sales-tax')!.baselineFte = 1500;
    const changed = overview(b, families, groups);
    expect(Math.round(changed.growth.series.at(-1)!.spending)).toBe(237);
    expect(changed.fte.value).toBe(1500);
  });

  it('has no figure typed into the page', () => {
    const page = readFileSync(join(import.meta.dirname, '../../src/pages/[country]/[state]/[city]/index.astro'), 'utf8');
    for (const literal of ['283.8', '1,560', '29.2', '37.42', '$57', '$22', '105', '138', '0.5%', '300M', '216', '188', '311.9', '33%']) {
      expect(page, literal).not.toContain(literal);
    }
  });
});
