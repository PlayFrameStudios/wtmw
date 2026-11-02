/**
 * #55: every city's chart and list headings come from its own budget.json, so a city that's missing the
 * fields fails here and at build time rather than shipping a chart that doesn't say what it counts.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { CityBudget } from '../../src/data/types';
import { generalFundNoun } from '../../src/lib/departments';

const root = join(import.meta.dirname, '../../data/cities');
const budgets = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (!e.isDirectory()) return [];
    const here = join(dir, e.name);
    return [...(existsSync(join(here, 'budget.json')) ? [here] : []), ...budgets(here)];
  });
const read = (dir: string): CityBudget => JSON.parse(readFileSync(join(dir, 'budget.json'), 'utf8'));

describe('chart headings (#55)', () => {
  const cities = budgets(root);

  test('finds every city with a budget', () => {
    expect(cities.map((c) => c.slice(root.length + 1)).sort()).toEqual(expect.arrayContaining(['us/ca/berkeley', 'us/ca/fremont']));
  });

  test.each(cities.map((c) => [c.slice(root.length + 1), c]))('%s: every General Fund table names what it counts', (_, dir) => {
    const b = read(dir);
    expect(b.generalFund.length).toBeGreaterThan(0);
    for (const t of b.generalFund) expect(generalFundNoun(b, t.year)).toMatch(/^General Fund \S/);
  });

  test("the wording is each city's own", () => {
    expect(generalFundNoun(read(join(root, 'us/ca/berkeley')))).toBe('General Fund department baseline');
    expect(generalFundNoun(read(join(root, 'us/ca/fremont')))).toBe('General Fund department budgets');
  });

  test('a budget.json without the noun fails, naming the field', () => {
    const b = read(join(root, 'us/ca/fremont'));
    const missing = structuredClone(b);
    for (const t of missing.generalFund) delete (t as Partial<typeof t>).noun;
    expect(() => generalFundNoun(missing)).toThrow(/has no "noun"/);
    const blank = { ...b, generalFund: b.generalFund.map((t) => ({ ...t, noun: '  ' })) };
    expect(() => generalFundNoun(blank)).toThrow(/has no "noun"/);
  });

  test('a budget.json without a General Fund table for the year fails', () => {
    const b = read(join(root, 'us/ca/fremont'));
    expect(() => generalFundNoun({ ...b, generalFund: [] })).toThrow(/no General Fund table/);
    expect(() => generalFundNoun(b, 1999)).toThrow(/no General Fund table for 1999/);
  });

  test('a noun that already says General Fund is not doubled', () => {
    const b = read(join(root, 'us/ca/fremont'));
    expect(generalFundNoun({ ...b, generalFund: b.generalFund.map((t) => ({ ...t, noun: 'General Fund spending' })) })).toBe('General Fund spending');
  });
});
