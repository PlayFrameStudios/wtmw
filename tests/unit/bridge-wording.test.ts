import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gapPlan } from '../../src/data/types';
import { budgetFor } from '../../src/lib/budget';
import { cities } from '../../src/lib/cities';

/*
 * The FY27 "bridge" is one-time money (reserves and a Successor Agency transfer) used to hold
 * off cuts until the vote. It is not tax revenue: the tax would start April 1, 2027.
 */
const root = join(import.meta.dirname, '../..');
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.(astro|ts|css|json)$/.test(e.name) ? [join(dir, e.name)] : []));

describe('the one-time bridge is never called tax money', () => {
  const sources = [...files(join(root, 'src')), join(root, 'data/cities/us/ca/berkeley/ballot.json'), join(root, 'README.md')];

  it('scans the site source', () => {
    expect(sources.length).toBeGreaterThan(30);
  });

  it('no "tax money", "sales-tax money", "softened by (the) sales tax" or "first year of tax"', () => {
    const banned = /\btax money\b|sales[- ]tax money|softened by (the )?(one-time )?sales[- ]tax\b|first year of (the )?tax|before (the )?sales[- ]tax money/i;
    for (const f of sources) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((l, i) => expect(l, `${f.replace(root, '')}:${i + 1}`).not.toMatch(banned));
    }
  });

  it('the pool really is reserves and a Successor Agency transfer, as the pages say', () => {
    const b = gapPlan(budgetFor(cities[0])!, 'test');
    expect(b.oneTimeResources.sources.map((s) => s.label)).toEqual(['Operating Reserve (2025 AAO #1)', 'Dissolution of Successor Agency — Transfer to City']);
    expect(b.oneTimeResources.uses.find((u) => /sales & use tax/i.test(u.label))!.amount).toBe(9_443_000);
  });
});
