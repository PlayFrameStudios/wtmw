import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { budgetFor } from '../../src/lib/budget';
import { cities } from '../../src/lib/cities';
import { fy } from '../../src/lib/city-settings';
import { gapPage } from '../../src/lib/gap';
import { figureReceipt } from '../../src/lib/receipts';

const city = cities[0];
const budget = budgetFor(city)!;
const label = (y: number) => fy(city.budget.labels, y);
const g = gapPage(budget, city.budget.years, label);
const page = new URL('https://wherethemoneywent.com/us/ca/berkeley/gap/');

describe('the waterfall', () => {
  it('has the 8 mocked steps for each year, ending at the final gap', () => {
    for (const y of g.years) {
      expect(y.steps.map((s) => s.label)).toEqual([
        'Initial estimate',
        'Revenue came in higher',
        '1947 Center St. debt service',
        'Support for parking funds',
        'Non-departmental costs',
        'Before one-time money',
        'One-time money',
        'Gap to close',
      ]);
    }
    expect(g.years.map((y) => y.final.value)).toEqual([-29_249_339, -29_532_958]);
  });

  it('adds up: each total follows from the steps before it, for both years', () => {
    for (const y of g.years) {
      let running = 0;
      for (const s of y.steps) {
        if (s.kind === 'total') running = s.value;
        else if (s.kind === 'subtotal' || s.kind === 'final') expect(s.value, `${y.year} ${s.key}`).toBe(running);
        else running += s.value;
      }
      expect(running).toBe(y.final.value);
    }
  });

  it('encodes each step by kind', () => {
    expect(g.years[0].steps.map((s) => s.kind)).toEqual(['total', 'up', 'cost', 'cost', 'cost', 'subtotal', 'one-time', 'final']);
  });

  it('gives the subtotal and the final gap receipts that show how they are built', () => {
    const [before, , final] = g.years[0].steps.slice(-3);
    // figureReceipt throws if the parts don't add up to the figure.
    expect(figureReceipt(budget, city, before.figure, page).parts?.map((p) => p.label)).toEqual([
      'Initial estimate',
      'Revenue came in higher',
      '1947 Center St. debt service',
      'Support for parking funds',
      'Non-departmental costs',
    ]);
    const finalReceipt = figureReceipt(budget, city, final.figure, page);
    expect(finalReceipt.parts?.map((p) => `${p.sign} ${p.value}`)).toEqual(['− $31,349,339', '+ $2,100,000']);
    expect(finalReceipt.total).toBe('−$29,249,339');
  });

  it('refuses a bridge whose totals do not follow from its steps', () => {
    const b = structuredClone(budget);
    b.deficitBridge.steps.find((s) => s.key === 'revenue-projections')!.years[2027] += 1;
    expect(() => gapPage(b, city.budget.years, label)).toThrow("FY2027 before-one-time-resources: -31349339 doesn't follow from the steps before it (-31349338)");
  });
});

describe('closing the gap and one-time money', () => {
  it('fails: $29.3M of cuts, 10.3%; passes: $19.8M and 7.0%, plus $9.4M softened', () => {
    expect(g.close.fails.cuts.value).toBe(29_251_348);
    expect((g.close.fails.pct * 100).toFixed(1)).toBe('10.3');
    expect(g.close.passes.cuts.value).toBe(19_808_353);
    expect((g.close.passes.pct * 100).toFixed(1)).toBe('7.0');
    expect(g.close.passes.softened.value + g.close.passes.cuts.value).toBe(g.close.fails.cuts.value);
  });

  it('one-time money: sources less uses leaves $12,113', () => {
    expect(g.oneTime.remaining).toBe(12_113);
    expect(figureReceipt(budget, city, g.oneTime.remainingFigure, page).value).toBe('$12,113');
  });

  it('has no figure typed into the page', () => {
    const src = readFileSync(join(import.meta.dirname, '../../src/pages/[country]/[state]/[city]/gap.astro'), 'utf8');
    for (const literal of ['29.2', '29,249', '29.5', '32.3', '5.1M', '1.6M', '31.3', '2.1M', '19.8', '10.3', '9.4M', '4.18', '7.88', '12K']) {
      expect(src, literal).not.toContain(literal);
    }
  });
});
