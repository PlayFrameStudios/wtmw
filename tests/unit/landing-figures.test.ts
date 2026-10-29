import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gapPlan } from '../../src/data/types';
import { budgetFor } from '../../src/lib/budget';
import { cities } from '../../src/lib/cities';
import { familiesFor, loadFamilies } from '../../src/lib/families';
import { headlines } from '../../src/lib/headlines';
import { per100, squares } from '../../src/lib/waffle';

const city = cities[0];
const budget = gapPlan(budgetFor(city)!, 'test');
const families = familiesFor(city, budget);
const fy27 = budget.departmentReductions[0].departments;

describe('per100 (largest remainder)', () => {
  it('always hands out exactly 100 squares', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let trial = 0; trial < 200; trial++) {
      const items = Array.from({ length: 1 + Math.floor(rand() * 20) }, () => rand() * 1e8);
      expect(per100(items, (x) => x).reduce((a, s) => a + s.squares, 0)).toBe(100);
    }
  });

  it('gives Police 37 squares and $37.42 of every $100, biggest first', () => {
    const shares = per100(fy27, (d) => d.baseline);
    expect(shares[0].item.id).toBe('police');
    expect(shares[0].squares).toBe(37);
    expect(shares[0].exact.toFixed(2)).toBe('37.42');
    expect(squares(shares)).toHaveLength(100);
  });

  it('adds up to $57 / $22 / $17 / $4 by family', () => {
    const shares = per100(fy27, (d) => d.baseline);
    const byFamily = families.list.map((f) => shares.filter((s) => families.of(s.item.id).id === f.id).reduce((a, s) => a + s.squares, 0));
    expect(byFamily).toEqual([57, 22, 17, 4]);
  });
});

describe('families', () => {
  const file = JSON.parse(readFileSync(join(import.meta.dirname, '../../data/cities/us/ca/berkeley/families.json'), 'utf8'));

  it('refuses a department with no family', () => {
    const { police: _drop, ...members } = file.members;
    void _drop;
    expect(() => loadFamilies({ ...file, members }, fy27, 'x')).toThrow('department "police" has no family');
  });

  it('refuses a family member that is not a department', () => {
    expect(() => loadFamilies({ ...file, members: { ...file.members, library: 'people' } }, fy27, 'x')).toThrow('"library" isn\'t a department');
  });

  it('gives bigger departments the darker shade within a family', () => {
    expect(families.color('police')).toBe('#23395B');
    expect(families.color('fire')).toBe('#3F5E96');
  });
});

describe('landing headlines follow the data', () => {
  it('reads every figure from budget.json', () => {
    const h = headlines(budget, families);
    expect(h).toMatchObject({ safetyPer100: 57, positionsWithoutTax: 138, departmentsCut: 15, sourceCount: 27 });
    expect(h.positionsWithTax.value).toBe(105);
    expect(h.baseline.value).toBe(283_764_035);
    expect(h.gap.value).toBe(-29_249_339);
    expect(h.cuts.value).toBe(29_251_348);
  });

  it('changes when the data changes', () => {
    const b = structuredClone(budget);
    b.fte.positions.find((p) => p.key === 'with-sales-tax')!.total = 99;
    b.departmentReductions[0].departments.find((d) => d.id === 'city-attorney')!.reduction = 1;
    const h = headlines(b, families);
    expect(h.positionsWithTax.value).toBe(99);
    expect(h.departmentsCut).toBe(16);
  });

  it('none of them is typed into the page', () => {
    const page = readFileSync(join(import.meta.dirname, '../../src/pages/index.astro'), 'utf8');
    for (const literal of ['283.8', '283,764', '29.2M', '29.3M', '29,249', '105', '138', '$57', '37.42', 'FY2025–FY2028']) {
      expect(page, literal).not.toContain(literal);
    }
  });
});
