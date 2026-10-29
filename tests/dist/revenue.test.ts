import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GapBudget } from '../../src/data/types';
import { unwrapFigures } from './figures';

const root = join(import.meta.dirname, '../..');
const b: GapBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/budget.json'), 'utf8'));
const groups = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/revenue-groups.json'), 'utf8')).groups as { id: string; name: string; lines: string[] }[];
const html = readFileSync(join(root, 'dist/us/ca/berkeley/revenue/index.html'), 'utf8');
const text = unwrapFigures(html).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const line = (n: string) => b.revenue.lines.find((l) => l.name === n)!;

describe('revenue page (built)', () => {
  // #35: the chart is the first thing on the page, 100 squares, each group's count its rounded share.
  const squares = [...html.matchAll(/class="sq" data-item="([^"]+)"/g)].map((m) => m[1]);
  const share = (g: (typeof groups)[number]) => g.lines.reduce((a, n) => a + line(n).values['adopted-2026'], 0) / b.revenue.total.values['adopted-2026'];

  it('the $100 chart has 100 squares, each group as many as its rounded share', () => {
    expect(squares).toHaveLength(100);
    for (const g of groups) expect(squares.filter((id) => id === g.id), g.name).toHaveLength(Math.round(share(g) * 100));
    // Every group is drawn: the smallest (hotel, about $2.53) still gets squares.
    expect(new Set(squares)).toEqual(new Set(groups.map((g) => g.id)));
  });

  it('property tax is $33 of every $100, in the chart and its list', () => {
    const g = groups.find((x) => x.id === 'property-tax')!;
    expect(Math.round(share(g) * 100)).toBe(33);
    expect(html).toContain('aria-label="Property tax: $33 of every $100"');
    expect(text).toMatch(/Property tax \$33 /);
  });

  it('the chart comes before anything else on the page after the lede', () => {
    const main = html.slice(html.indexOf('<h1'));
    const chart = main.indexOf('data-waffle');
    expect(chart).toBeGreaterThan(0);
    for (const later of ['class="lines-section"', 'class="insights', '<h2 id="lines-title"']) {
      const at = main.indexOf(later);
      if (at >= 0) expect(at, later).toBeGreaterThan(chart);
    }
    expect(main.slice(0, chart)).not.toMatch(/<h2(?![^>]*visually-hidden)/);
  });

  it("each group's line items are listed under it", () => {
    for (const g of groups) {
      const li = html.match(new RegExp(`<li id="rev-${g.id}"[^>]*>[\\s\\S]*?</details>`))?.[0];
      expect(li, g.id).toBeTruthy();
      if (g.lines.length > 1) for (const n of g.lines) expect(li!.replace(/&amp;/g, '&')).toContain(n);
    }
  });

  it('Business License Tax 10% received; Transfers +797%', () => {
    const blt = line('Business License Tax');
    const tr = line('Transfers');
    expect(text).toMatch(new RegExp(`Business License Tax \\$[\\d.]+M .*?${Math.round((blt.values['mid-year-actual-2026'] / blt.values['adopted-2026']) * 100)}%`));
    const change = Math.round(((tr.values['mid-year-actual-2026'] - tr.values['mid-year-actual-2025']) / tr.values['mid-year-actual-2025']) * 100);
    expect(change).toBe(797);
    expect(text).toContain(`+${change}%`);
  });

  it('has all 24 line items, each budget figure its own receipt (#29)', () => {
    const lines = [...html.matchAll(/<li class="line"[\s\S]*?<\/li>/g)].map((m) => m[0]);
    expect(lines).toHaveLength(b.revenue.lines.length);
    for (const l of lines) expect(l).toMatch(/<span class="l-budget"[^>]*>\s*<span class="num"[^>]*><button[^>]*class="sourced/);
  });

  it('the insight cards quote the data', () => {
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const tt = line('Property Transfer Tax');
    const mp = line('Property Transfer Tax — Measure P');
    expect(text).toContain(`receipts were up ${pct((tt.values['mid-year-actual-2026'] - tt.values['mid-year-actual-2025']) / tt.values['mid-year-actual-2025'])} on last year`);
    expect(text).toContain(`Measure P share was up ${pct((mp.values['mid-year-actual-2026'] - mp.values['mid-year-actual-2025']) / mp.values['mid-year-actual-2025'])}`);
    const tr = line('Transfers');
    expect(text).toContain(`rose from $${(tr.values['mid-year-actual-2025'] / 1e6).toFixed(1)}M to $${(tr.values['mid-year-actual-2026'] / 1e6).toFixed(1)}M at mid-year`);
  });
});
