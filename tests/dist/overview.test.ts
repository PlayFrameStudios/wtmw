import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GapBudget } from '../../src/data/types';
import { unwrapFigures } from './figures';

// The story's checks, recomputed from budget.json without the site's helpers.
const root = join(import.meta.dirname, '../..');
const b: GapBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/budget.json'), 'utf8'));
const html = readFileSync(join(root, 'dist/us/ca/berkeley/index.html'), 'utf8');
const text = unwrapFigures(html).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1');
const depts = b.departmentReductions.find((y) => y.year === 2027)!.departments;
const total = depts.reduce((a, d) => a + d.baseline, 0);

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const receiptsIn = (fragment: string) => [...fragment.matchAll(/data-receipt="([^"]*)"/g)].map((m) => JSON.parse(unescape(m[1])));
// #33: the lede is one sentence; the three sizes sit behind its ⓘ.
const lede = html.match(/<p class="sizes"[^>]*>[\s\S]*?<\/p>/)![0];
// The lede minus its glossary tooltip and the tooltip's script.
const ledeText = unwrapFigures(lede).replace(/<script[\s\S]*?<\/script>|<span class="tip"[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1');

describe('the whole budget, before the waffle (#24)', () => {
  const d = b.documentFacts!;

  it('leads with one sentence and puts the three sizes behind its ⓘ (#33)', () => {
    const one = html.match(/<p class="lede"[^>]*>([\s\S]*?)<\/p>/)![1];
    expect(one.replace(/<button[\s\S]*<\/button>|<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).toBe(
      'Each square is $1 of every $100 the City plans to spend on departments this year.',
    );
    expect(one).toMatch(/<button type="button" class="info" aria-expanded="false" aria-controls="lede-sizes"/);
    expect(html).toMatch(/<div class="info-panel" id="lede-sizes" hidden data-info-panel[^>]*>\s*<p class="sizes"/);
  });

  it("says what the whole budget is and what the waffle shows, from data", () => {
    expect(d.allFunds.amount).toBe(916_819_369);
    expect(d.generalFund.amount).toBe(313_849_211);
    // No chip labels in the sentence any more: each figure is its own receipt (#29).
    expect(ledeText).toContain("Berkeley's whole budget for fiscal year 2027 is $916.8M. Most of it is set aside for specific uses, like sewers, parking or grants.");
    expect(ledeText).toContain('The $313.8M General Fund is the part the Council can spend on anything.');
    expect(ledeText).toContain(`The chart shows the $283.8M of it planned for departments, before cuts.`);
  });

  it('chips each figure: the adoption report p.1 sentence for the two totals, S1 for the baseline', () => {
    const r = receiptsIn(lede);
    expect(r.map((x) => [x.value, x.sources[0]])).toEqual([['$916,819,369', 'S20'], ['$313,849,211', 'S20'], ['$283,764,035', 'S1']]);
    expect(r[0]).toMatchObject({ page: 1, quote: expect.stringContaining('all funds in FY27 is $916.8 million') });
    expect(r[1]).toMatchObject({ page: 1, quote: expect.stringContaining('General Fund (Fund 011) expenditures are estimated at $313.8 million') });
  });

  it("never shows a difference between the General Fund and the baseline: they're different documents and bases", () => {
    const diff = d.generalFund.amount - total;
    // Not the whole-dollar "$30M": the glossary's own "~$30M structural deficit" is unrelated.
    for (const s of [diff.toLocaleString('en-US'), `$${(diff / 1e6).toFixed(1)}M`]) expect(html, s).not.toContain(s);
  });
});

describe('the three cards, in plain language (#24)', () => {
  it('card 1 says property tax is the biggest source, not "mostly"', () => {
    expect(text).toContain("Property tax is the City's biggest source of money.");
    expect(text).toContain('About $1 of every $3 the City collects is property tax. Another 10% comes from a tax paid when a home is sold.');
    expect(text).not.toContain('mostly comes from property');
  });

  it('card 2 says costs grow faster than income', () => {
    expect(text).toContain('Costs are growing faster than income.');
    expect(text).toContain("For ten years, the City's costs grew about 8% a year and its income about 6.5%. So it starts each year short.");
  });

  it('card 3 states the fact: how deep the cuts go under each outcome (#31)', () => {
    expect(text).toContain('The sales-tax vote changes how deep the cuts go. 105 positions cut if Measure V passes, 138 if it fails. Compare both outcomes');
    expect(text).not.toContain('You get a say');
  });
});

describe('overview checks', () => {
  it('Police = 37 squares and "$37 of every $100"; the table keeps $37.42', () => {
    const police = depts.find((d) => d.id === 'police')!;
    const exact = ((police.baseline / total) * 100).toFixed(2);
    expect(exact).toBe('37.42');
    expect(html.match(/class="sq" data-item="police"/g)).toHaveLength(37);
    // #33: 100 squares can't show cents, so the chart and its sheet speak in whole dollars, one per square.
    expect(html).toContain('aria-label="Police: $37 of every $100"');
    expect(html).toMatch(/<p class="panel-figure"[^>]*>\s*<span class="num"[^>]*>\$37<\/span>/);
    expect(html).toMatch(/<th scope="row"[^>]*>Police<\/th>\s*<td[^>]*>\$106,198,574<\/td>\s*<td[^>]*>\$37\.42<\/td>/);
  });

  it("a square's sheet shows only the name, whole dollars and Department details (#33)", () => {
    const panels = [...html.matchAll(/<div class="panel" id="waffle-panel-([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/div>/g)];
    expect(panels).toHaveLength(16);
    for (const [, id, p] of panels) {
      const t = p.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      expect(t, id).toMatch(/^[A-Z][^$()]+ \$\d+ of every \$100 Department details →$/);
      expect(p, id).not.toMatch(/data-receipt|baseline|proposed cut/);
    }
    const name = (id: string) => html.match(new RegExp(`id="waffle-panel-${id}"[\\s\\S]*?</span>\\s*([^<]+?)\\s*</p>`))![1];
    expect(name('hhcs')).toBe('Health, Housing &amp; Community Services');
    expect(name('odpa')).toBe('Office of the Director of Police Accountability');
    expect(name('prw')).toBe('Parks, Recreation &amp; Waterfront');
    expect(name('cmo')).toBe("City Manager&#39;s Office");
  });

  it('the waffle has exactly 100 squares', () => {
    expect(html.match(/class="sq" data-item=/g)).toHaveLength(100);
  });

  it('families $57 / $22 / $17 / $4 in the legend', () => {
    expect(text).toMatch(/Public safety \$57 .*People & places \$22 .*Running the city \$17 .*Oversight & elected \$4/);
  });

  it('the gap shows $29.2M', () => {
    const gap = b.deficitBridge.steps.find((s) => s.key === 'final-gap')!.years[2027];
    expect(text).toContain(`gap the city must close $${(Math.abs(gap) / 1e6).toFixed(1)}M`);
  });

  it('has a text alternative: a table of every department, its dollars and its share', () => {
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
    expect(table.match(/<th scope="row"/g)).toHaveLength(depts.length);
    for (const d of depts) {
      expect(table).toContain(`$${d.baseline.toLocaleString('en-US')}`);
      expect(table).toContain(`$${((d.baseline / total) * 100).toFixed(2)}`);
    }
  });

  // #33: card 2 already says 8% vs 6.5%, and Sources stays in the nav and footer.
  it('cuts the compounding chart and the "Don\'t take our word for it" section', () => {
    expect(text).not.toContain('Small differences, compounded');
    expect(text).not.toContain("Don't take our word for it");
    expect(html).not.toContain('class="growth"');
    expect(text).toMatch(/costs grew about 8% a year and its income about 6\.5%/);
    expect(html.match(/<a [^>]*href="\/us\/ca\/berkeley\/sources\/"/g)!.length).toBeGreaterThanOrEqual(2);
  });
});
