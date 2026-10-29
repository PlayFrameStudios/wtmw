import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GapBudget } from '../../src/data/types';
import { unwrapFigures } from './figures';

// Reads the rendered Gap page: every waterfall step's chip carries its exact figure.
const root = join(import.meta.dirname, '../..');
const b: GapBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/budget.json'), 'utf8'));
const html = readFileSync(join(root, 'dist/us/ca/berkeley/gap/index.html'), 'utf8');
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
const parse = (v: string) => Number(v.replace(/[$,]/g, '').replace('−', '-'));

function steps(year: 'fy2027' | 'fy2028') {
  const start = html.indexOf(`data-year="${year}"`);
  const section = html.slice(start, html.indexOf('</section>', start));
  return [...section.matchAll(/<li class="step step--([a-z-]+)"[\s\S]*?data-receipt="([^"]*)"/g)].map((m) => {
    const r = JSON.parse(unescape(m[2]));
    return { kind: m[1], value: parse(r.value), table: r.table, row: r.row };
  });
}

describe('the Gap page waterfall', () => {
  for (const [year, final] of [
    ['fy2027', -29_249_339],
    ['fy2028', -29_532_958],
  ] as const) {
    it(`${year}: 8 steps from the Deficit Bridge that add up to ${final.toLocaleString('en-US')}`, () => {
      const s = steps(year);
      expect(s).toHaveLength(8);
      expect(s.every((x) => x.table === 'Deficit Bridge FY27-28')).toBe(true);
      let running = 0;
      for (const x of s) {
        if (x.kind === 'total') running = x.value;
        else if (x.kind === 'subtotal' || x.kind === 'final') expect(x.value).toBe(running);
        else running += x.value;
      }
      expect(s.at(-1)).toMatchObject({ kind: 'final', value: final, row: 13 });
      // …and the same numbers as budget.json, independently.
      expect(b.deficitBridge.steps.find((x) => x.key === 'final-gap')!.years[Number(year.slice(2))]).toBe(final);
    });
  }

  it('shows how the city plans to close FY2027', () => {
    const t = b.departmentReductions[0].total;
    const text = unwrapFigures(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain(`$${(t.reduction / 1e6).toFixed(1)}M in department cuts (${(t.reductionPct * 100).toFixed(1)}%)`);
    expect(text).toContain(`$${(t.netReduction / 1e6).toFixed(1)}M in cuts (${(t.netReductionPct * 100).toFixed(1)}%)`);
    expect(text).toContain(`$${(t.salesTaxAllocation / 1e6).toFixed(1)}M softened`);
    expect(text).toContain(`Left over: $${Math.round(b.oneTimeResources.remaining / 1e3)}K`);
  });

  it('the bridge note calls it one-time money until the vote', () => {
    const t = readFileSync(join(import.meta.dirname, '../../dist/us/ca/berkeley/gap/index.html'), 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(t).toContain('In FY27 the plan uses one-time money (reserves and a Successor Agency transfer) to soften cuts until the vote. The tax itself would start April 1, 2027.');
  });
});
