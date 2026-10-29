import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gapPlan } from '../../src/data/types';
import { budgetFor } from '../../src/lib/budget';
import { capitalGroupsFor, capitalPage, contrast, LAYOUTS, squarify } from '../../src/lib/capital';
import { cities } from '../../src/lib/cities';

const city = cities[0];
const budget = gapPlan(budgetFor(city)!, 'test');
const groups = capitalGroupsFor(city.path);
const c = capitalPage(budget, groups);

describe('capital page figures', () => {
  it('the total is $183,623,376 (adoption report p.170); the General Fund block is $24.0M in 5 programs', () => {
    expect(c.total.value).toBe(183_623_376);
    expect([c.total.fy2027, c.total.fy2028]).toEqual([100_066_068, 83_557_308]);
    expect(c.generalFund.name).toBe('General Fund (5 programs)');
    expect(c.generalFund.value).toBe(24_025_016);
    expect(c.generalFund.figure.parts!.map((p) => p.label)).toEqual(['Streets', 'Facilities', 'Camps', 'Sidewalks', 'Parks']);
    expect(c.generalFund.figure.parts!.reduce((a, p) => a + p.value, 0)).toBe(c.generalFund.value);
  });

  it('the General Fund block is the only red', () => {
    const red = c.blocks.filter((b) => b.color === c.generalFund.color);
    expect(red.map((b) => b.id)).toEqual(['general-fund']);
  });

  it('"Other sources (n)" counts what it rolled up: every source under 1% of the total', () => {
    const program = budget.documentFacts.capitalProgram;
    const small = program.lines.filter((l) => l.name !== program.generalFund && l.total / c.total.value < 0.01);
    const other = c.blocks.at(-1)!;
    expect(other.name).toBe(`Other sources (${small.length})`);
    expect(small.length).toBe(14);
    expect(other.value).toBe(small.reduce((a, l) => a + l.total, 0));
  });

  it('every dollar is in exactly one block', () => {
    expect(c.blocks.reduce((a, b) => a + b.value, 0)).toBe(c.total.value);
    // The General Fund block lists its programs instead of its one fund.
    const names = c.blocks.flatMap((b) => (b.id === 'general-fund' ? ['general-fund'] : b.lines.map((l) => l.name)));
    expect(new Set(names).size).toBe(budget.documentFacts.capitalProgram.lines.length);
  });

  for (const k of ['wide', 'tall'] as const) {
    it(`the ${k} treemap tiles its box exactly, with area proportional to value`, () => {
      const area = c.blocks.reduce((a, b) => a + b.rect[k].w * b.rect[k].h, 0);
      expect(area).toBeCloseTo(100 * 100, 6);
      for (const b of c.blocks) {
        expect((b.rect[k].w * b.rect[k].h) / 1e4).toBeCloseTo(b.value / c.total.value, 9);
        expect(b.rect[k].x + b.rect[k].w).toBeLessThanOrEqual(100 + 1e-9);
        expect(b.rect[k].y + b.rect[k].h).toBeLessThanOrEqual(100 + 1e-9);
      }
      for (const [i, a] of c.blocks.entries())
        for (const b of c.blocks.slice(i + 1)) {
          const ra = a.rect[k];
          const rb = b.rect[k];
          const overlap = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x) > 1e-6 && Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y) > 1e-6;
          expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
        }
    });
  }

  it('squarify keeps blocks squarish (worst aspect under 4:1 here)', () => {
    const rects = squarify(c.blocks.map((b) => b.value), LAYOUTS.wide.w, LAYOUTS.wide.h);
    for (const r of rects.slice(0, -1)) expect(Math.max(r.w / r.h, r.h / r.w)).toBeLessThan(4);
  });

  it('every block label meets 4.5:1 on its color', () => {
    for (const b of c.blocks) expect(contrast(b.text, b.color), b.id).toBeGreaterThanOrEqual(4.5);
  });

  it('a fund with no legend group, or a group naming a fund the table lacks, fails the build', () => {
    const missing = { ...groups, groups: groups.groups.filter((g) => g.id !== 'grants') };
    expect(() => capitalPage(budget, missing)).toThrow(/no group for .*Capital Grants-State/);
    const stale = { ...groups, groups: groups.groups.map((g) => (g.id === 'grants' ? { ...g, funds: [...g.funds, 'FEMA'] } : g)) };
    expect(() => capitalPage(budget, stale)).toThrow(/no fund named FEMA/);
  });

  it('the scale: the FY27-31 CIP need is the axis; the earlier estimate and inventory are kept', () => {
    expect(c.need.value).toBe(2_115_819_772);
    expect(c.need.growth).toBe(0.04);
    expect(c.scale.need).toBe(1);
    expect(c.scale.program).toBeCloseTo(183_623_376 / 2_115_819_772, 9);
    expect(c.backlog.fact).toMatchObject({ low: 1_650_000_000, high: 2_000_000_000, sidewalkMiles: '300+', parks: 54, buildings: 95 });
  });

  it('has no figure typed into the page', () => {
    const src = readFileSync(join(import.meta.dirname, '../../src/components/views/CapitalProgram.astro'), 'utf8');
    for (const lit of ['183', '24.0', '2.12', '1.65', '300+', ' 54 ', ' 95 ', '4%', '$29M', '48.1', 'Sanitary']) expect(src, lit).not.toContain(lit);
  });
});
