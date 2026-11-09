/**
 * #64 on the built pages: "Over the years" on each city's fiscal-position page, a receipt on every point and every
 * table cell, solid points for actual years and hollow for the rest, Berkeley's two bases in separate panels, and
 * the City's notes beside the chart.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CityBudget } from '../../src/data/types';
import type { Receipt } from '../../src/lib/receipts';

const root = join(import.meta.dirname, '../..');
const budget = (c: string): CityBudget => JSON.parse(readFileSync(join(root, 'data/cities/us/ca', c, 'budget.json'), 'utf8'));
const page = (c: string, p: string) => readFileSync(join(root, 'dist/us/ca', c, p, 'index.html'), 'utf8');
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = (h: string) => unescape(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const receipts = (h: string): Receipt[] => [...h.matchAll(/data-receipt="([^"]*)"/g)].map((m) => JSON.parse(unescape(m[1])));
const PAGES = { berkeley: 'gap', fremont: 'reserves', lafayette: 'reserves' } as const;
const section = (c: keyof typeof PAGES) => {
  const h = page(c, PAGES[c]);
  const start = h.indexOf('<section class="history"');
  return h.slice(start, h.indexOf('</section>', start));
};
const panels = (c: keyof typeof PAGES) => {
  const s = section(c);
  return [...s.matchAll(/data-panel="([^"]+)"/g)].map((m, i, all) => ({ id: m[1], html: s.slice(m.index, all[i + 1]?.index ?? s.length) }));
};
/** A point: its receipt and whether it's drawn solid (actual) or hollow (estimate, budget). */
const points = (h: string) =>
  [...h.matchAll(/class="sourced hc-pt hc-pt--(\w+)[^"]*"[^>]*data-receipt="([^"]*)"/g)].map((m) => ({ basis: m[1], receipt: JSON.parse(unescape(m[2])) as Receipt }));

describe('"Over the years" (#64)', () => {
  for (const c of Object.keys(PAGES) as (keyof typeof PAGES)[]) {
    it(`${c}: every point in budget.json is drawn, with its receipt, solid only for actual years`, () => {
      const b = budget(c);
      for (const p of b.history!.panels) {
        const html = panels(c).find((x) => x.id === p.id)!.html;
        const drawn = points(html);
        const expected = p.lines
          .filter((l) => l.kind !== 'net')
          .flatMap((l) => l.series.flatMap((s) => Object.entries(s.years).map(([y, v]) => ({ basis: s.basis, label: l.label, y, v, s }))));
        expect(drawn, `${c} ${p.id}`).toHaveLength(expected.length);
        for (const e of expected) {
          const pt = drawn.find((d) => d.receipt.label!.startsWith(`${e.label}, `) && d.receipt.value === `$${Math.abs(e.v).toLocaleString('en-US')}` && d.receipt.page === e.s.cite.page);
          expect(pt, `${c} ${e.label} ${e.y}`).toBeDefined();
          expect(pt!.basis).toBe(e.basis);
          expect(pt!.receipt.quote).toBe(e.s.cite.quote);
        }
      }
    });

    it(`${c}: the table has every line, net lines included, each cell its receipt`, () => {
      const b = budget(c);
      for (const p of b.history!.panels) {
        const html = panels(c).find((x) => x.id === p.id)!.html;
        const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
        const cells = receipts(table);
        expect(cells).toHaveLength(p.lines.reduce((n, l) => n + l.series.reduce((m, s) => m + Object.keys(s.years).length, 0), 0));
        for (const l of p.lines) expect(strip(table)).toContain(l.label);
      }
    });
  }

  it("Berkeley: the annual report's panel draws only S39 and the budget's only S42, report first, both before the cuts", () => {
    const [results, plans] = panels('berkeley');
    expect([results.id, plans.id]).toEqual(['results', 'budget']);
    expect(new Set(receipts(results.html).filter((r) => r.kind === 'figure').map((r) => r.sources.join('+')))).toEqual(new Set(['S39']));
    expect(new Set(receipts(plans.html).filter((r) => r.kind === 'figure').map((r) => r.sources.join('+')))).toEqual(new Set(['S42']));
    const gap = page('berkeley', 'gap');
    expect(gap.indexOf('id="history"')).toBeLessThan(gap.indexOf('id="cuts"'));
    expect(strip(plans.html)).toContain('The two bases give different figures for the same year, so each has its own chart.');
  });

  it('Berkeley: the restated opening balance, as a built figure, and only the budget chart has lines that overlap', () => {
    const [results, plans] = panels('berkeley');
    const note = results.html.slice(results.html.indexOf('data-adjustment'));
    expect(strip(note.slice(note.indexOf('>') + 1, note.indexOf('</p>')))).toBe(
      'The report begins FY2025 from a fund balance "as restated", not from FY2024\'s ending balance. The difference is $276,283 .',
    );
    expect(receipts(note.slice(0, note.indexOf('</p>')))[0]).toMatchObject({ value: '$276,283', page: 53 });
    expect(results.html).not.toContain('hc-overlap');
    expect(strip(plans.html)).toContain('Revenue and expenditures are within $981K of each other in every year both are printed, so their lines overlap');
  });

  it("Fremont: the City's two notes, quoted from the same page, with their receipts", () => {
    const [p] = panels('fremont');
    const notes = [...p.html.matchAll(/<p class="hist-note"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => ({ text: strip(m[1]), r: receipts(m[1]) }));
    expect(notes.map((n) => n.text.replace(/ ?$/, ''))).toEqual([
      'The City\'s note: “The sales tax reduction in FY 2023/24 and FY 2024/25 reflects the impact of the State’s recovery of sales tax revenue misallocated to the City of Fremont in FY 2022/23.”',
      'The City\'s note: “The Maintenance Operations Department took over responsibility for building, fleet, park, and street maintenance from the Public Works and Community Services Departments in FY 2024/25. For comparability, the expenditures for those activities have been reallocated to the Maintenance Operations Department in the prior-year columns.”',
    ]);
    for (const n of notes) expect(n.r.map((r) => [r.sources[0], r.page])).toEqual([['S1', 95]]);
  });

  it('Lafayette: transfers out beside revenue and expenditures, from the reserve standard pages of both books', () => {
    const [p] = panels('lafayette');
    const transfers = points(p.html).filter((d) => d.receipt.label!.startsWith('Transfers out, '));
    expect(transfers.map((d) => [d.receipt.label, d.receipt.sources[0], d.receipt.page, d.basis])).toEqual([
      ['Transfers out, FY 2022-23 (actual)', 'S7', 11, 'actual'],
      ['Transfers out, FY 2023-24 (actual)', 'S7', 11, 'actual'],
      ['Transfers out, FY 2024-25 (actual)', 'S1', 16, 'actual'],
      ['Transfers out, FY 2025-26 (estimate)', 'S1', 16, 'estimate'],
      ['Transfers out, FY 2026-27 (adopted)', 'S1', 16, 'budget'],
    ]);
  });

  it('a point is a button with the line, year and amount as its name, and the toggle starts hidden for the script to show', () => {
    const [p] = panels('fremont');
    expect(p.html).toMatch(/aria-label="Revenue, FY 2021\/22 \(actual\): \$273\.9M, source: [^"]+"/);
    expect(p.html).toMatch(/<button type="button" class="hist-toggle"[^>]*data-history-toggle hidden/);
  });
});
