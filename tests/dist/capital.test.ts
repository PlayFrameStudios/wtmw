import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CityBudget } from '../../src/data/types';
import { unwrapFigures } from './figures';

const root = join(import.meta.dirname, '../..');
const b: CityBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/budget.json'), 'utf8'));
const html = readFileSync(join(root, 'dist/us/ca/berkeley/capital/index.html'), 'utf8');
const text = unwrapFigures(html).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const program = b.documentFacts.capitalProgram;
const groups: { names?: Record<string, string> } = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/capital-groups.json'), 'utf8'));
const lines = program.lines;
const m = (v: number) => `$${(v / 1e6).toFixed(1)}M`;
// The City's own subtotals, read straight from the page text: the lines must add up to them.
const page = JSON.parse(readFileSync(join(root, `data/cities/us/ca/berkeley/source/excerpts/${program.source}.json`), 'utf8'))[String(program.page)] as string;
const subtotals = [...page.matchAll(/^(.+ Funds) Total\s+\$\s+([\d,]+|-)\s+\$\s+([\d,]+|-)/gm)].map((r) => ({
  type: r[1],
  fy2027: Number(r[2].replace(/\D/g, '')),
  fy2028: Number(r[3].replace(/\D/g, '')),
}));

describe('capital page (built)', () => {
  it("the lines add up to the City's own fund-type subtotals on p.170, and the page shows that total", () => {
    // "General Fund Total" is all dashes: its capital money is the Capital Improvements fund, under Capital Projects Funds.
    expect(subtotals.map((t) => t.type)).toEqual(['Capital Projects Funds', 'Enterprise Funds', 'Grants Funds', 'Internal Service Funds', 'Special Revenue Funds']);
    for (const y of ['fy2027', 'fy2028'] as const) {
      expect(lines.reduce((a, l) => a + l.years[y === 'fy2027' ? 2027 : 2028], 0), y).toBe(subtotals.reduce((a, t) => a + t[y], 0));
    }
    const total = lines.reduce((a, l) => a + l.total, 0);
    expect(program.total.total).toBe(total);
    expect(text).toContain(`${m(total)} planned FY27-28`);
    const gf = lines.find((l) => l.name === program.generalFund)!;
    expect(m(gf.total)).toBe('$24.0M');
    expect(text).toContain(`General Fund (${gf.parts!.length} programs) ${m(gf.total)}`);
    expect(text).toContain(`Only the red block comes from the General Fund (${m(gf.total)})`);
  });

  it('draws each block with an area matching its value (wide layout)', () => {
    const blocks = [...html.matchAll(/<li class="tb"[^>]*style="([^"]*)"[^>]*>\s*<span class="tb-name"[^>]*>([^<]*)<\/span>\s*<span class="tb-value[^>]*>([^<]*)</g)];
    expect(blocks.length).toBeGreaterThan(10);
    let area = 0;
    for (const [, style, name, value] of blocks) {
      const v = (k: string) => Number(style.match(new RegExp(`--wide-${k}:([\\d.]+)%`))![1]);
      area += v('w') * v('h');
      const line = lines.find((l) => (groups.names?.[l.name] ?? l.name) === name.replace(/&amp;/g, '&'));
      if (line) {
        expect(value.trim()).toBe(m(line.total));
        expect((v('w') * v('h')) / 1e4).toBeCloseTo(line.total / program.total.total, 4);
      }
    }
    expect(area / 1e4).toBeCloseTo(1, 4);
  });

  it('shows the FY27-31 CIP need first, then the earlier estimate and its inventory', () => {
    const need = b.documentFacts.capitalNeed.amount;
    const bl = b.citedFacts.backlog;
    expect(text).toContain(`$${+(need / 1e9).toFixed(2)}B unfunded capital and maintenance need`);
    expect(text).toContain(
      `An earlier City estimate was $${+(bl.low / 1e9).toFixed(2)}–${+(bl.high / 1e9).toFixed(2)}B, counting ${bl.sidewalkMiles} miles of sidewalk, ${bl.parks} parks and ${bl.buildings} buildings.`,
    );
    expect(text.indexOf('unfunded capital and maintenance need')).toBeLessThan(text.indexOf('An earlier City estimate'));
  });
});
