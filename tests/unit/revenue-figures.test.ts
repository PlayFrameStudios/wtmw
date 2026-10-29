import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gapPlan } from '../../src/data/types';
import { budgetFor } from '../../src/lib/budget';
import { cities } from '../../src/lib/cities';
import { pace, revenuePage, VISIBLE } from '../../src/lib/revenue';
import { revenueGroupsFor } from '../../src/lib/revenue-groups';

const city = cities[0];
const budget = gapPlan(budgetFor(city)!, 'test');
const r = revenuePage(budget, revenueGroupsFor(city, budget));
const line = (name: string) => r.lines.find((x) => x.l.name === name)!;

describe('revenue page figures', () => {
  it('property tax groups to 33%; Business License Tax 10% received; Transfers +797%', () => {
    expect(Math.round(r.property.share * 100)).toBe(33);
    expect(Math.round(line('Business License Tax').l.pctOfAdoptedReceived! * 100)).toBe(10);
    expect(Math.round(line('Transfers').l.changeVsFy2025Pct! * 100)).toBe(797);
  });

  it('buckets the mid-year pace: under 40% behind, 40-60% on pace, over 60% ahead', () => {
    expect([pace(0.39), pace(0.4), pace(0.6), pace(0.61), pace(null)]).toEqual(['behind', 'on-pace', 'on-pace', 'ahead', 'behind']);
    expect(line('Business License Tax').pace).toBe('behind');
    expect(line('Secured Property Tax').pace).toBe('on-pace');
    expect(line('Transfers').pace).toBe('ahead');
  });

  it('ranks every line for each sort, and shows 14 before "Show all"', () => {
    expect(r.lines).toHaveLength(24);
    const first = (s: 'biggest' | 'fastest' | 'az') => r.lines.find((x) => x.rank[s] === 0)!.l.name;
    expect(first('biggest')).toBe('Secured Property Tax');
    expect(first('fastest')).toBe('Transfers');
    expect(first('az')).toBe('Ambulance Fees');
    // The new tax (no FY2025 figure) sorts last for "fastest growing".
    expect(line('Residential Vacancy Tax (new FY26)').rank.fastest).toBe(23);
    expect(VISIBLE).toBe(14);
  });

  it('the transfers receipt shows how the jump is built', () => {
    const t = r.insights.transfers;
    expect(t.figure.parts.reduce((a, p) => a + p.value, 0)).toBe(t.line.values['mid-year-actual-2026']);
  });

  it('has no figure typed into the page', () => {
    const src = readFileSync(join(import.meta.dirname, '../../src/components/views/RevenuePace.astro'), 'utf8');
    for (const lit of ['311.9', '33%', '797', '18%', '36%', '10%', '2.1M', '18.8M', '95.2', ' 24 ']) expect(src, lit).not.toContain(lit);
  });
});
