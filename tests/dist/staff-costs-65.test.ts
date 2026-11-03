/**
 * #65 on the built pages: "What staff cost" on each city's Departments page, after Staff positions. Every figure
 * is a receipt citing that city's own documents; no block, and no page, sets two cities' figures together; each
 * block names its basis; and the site FAQ explains why, in terms that match each city's data.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CityBudget } from '../../src/data/types';
import type { Receipt } from '../../src/lib/receipts';

const root = join(import.meta.dirname, '../..');
const CITIES = { berkeley: 'Berkeley', fremont: 'Fremont', lafayette: 'Lafayette' } as const;
type CityId = keyof typeof CITIES;
const budget = (c: CityId): CityBudget => JSON.parse(readFileSync(join(root, 'data/cities/us/ca', c, 'budget.json'), 'utf8'));
const page = (p: string) => readFileSync(join(root, 'dist', p, 'index.html'), 'utf8');
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = (h: string) => unescape(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const receipts = (h: string): Receipt[] => [...h.matchAll(/data-receipt="([^"]*)"/g)].map((m) => JSON.parse(unescape(m[1])));
const departments = (c: CityId) => page(`us/ca/${c}/departments`);
const section = (c: CityId) => {
  const h = departments(c);
  const start = h.indexOf('<section class="db-section sc');
  return h.slice(start, h.indexOf('</section>', start));
};
const blocks = (c: CityId) => {
  const s = section(c);
  return [...s.matchAll(/data-staff-section="([^"]+)"/g)].map((m, i, all) => ({ id: m[1], html: s.slice(m.index, all[i + 1]?.index ?? s.length) }));
};

describe('"What staff cost" (#65)', () => {
  for (const c of Object.keys(CITIES) as CityId[]) {
    it(`${c}: after Staff positions, every block in budget.json, in order`, () => {
      const h = departments(c);
      expect(h.indexOf('id="db-costs"')).toBeGreaterThan(h.indexOf('id="db-staff"'));
      expect(blocks(c).map((b) => b.id)).toEqual(budget(c).staffCosts!.sections.map((s) => s.id));
    });

    it(`${c}: every figure in budget.json is a receipt with its quote and page, and no receipt is another city's`, () => {
      const b = budget(c);
      const own = new Set(b.sources.map((s) => s.id));
      const html = section(c);
      const all = receipts(html);
      expect(html).not.toContain('data-receipt-city');
      for (const r of all) for (const s of r.sources) expect(own.has(s), `${c} ${r.label}`).toBe(true);
      const figures = b.staffCosts!.sections.flatMap((s) => [...s.figures, ...(s.bars?.periods ?? []).flatMap((p) => [...p.parts, ...(p.total ? [p.total] : [])])]);
      for (const f of figures) {
        const r = all.find((x) => x.quote === f.cite.quote && x.page === f.cite.page && (f.percent ? x.value === `${(f.value * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%` : x.value === `$${f.value.toLocaleString('en-US')}`));
        expect(r, `${c} ${f.label} ${f.value}`).toBeDefined();
      }
    });

    it(`${c}: no other city is named in the section, and it links the FAQ on why`, () => {
      const text = strip(section(c));
      for (const [other, name] of Object.entries(CITIES)) if (other !== c) expect(text).not.toContain(name);
      expect(section(c)).toMatch(/<a href="\/faq\/#why-not-compare-staff-costs" data-staff-faq-link[ >]/);
    });

    it(`${c}: a bar is solid only for an actual year`, () => {
      for (const b of budget(c).staffCosts!.sections)
        for (const p of b.bars?.periods ?? []) {
          const html = blocks(c).find((x) => x.id === b.id)!.html;
          expect(html, `${c} ${b.id} ${p.year}`).toContain(`class="sc-row sc-row--${p.basis}" data-year="${p.year}"`);
        }
    });
  }

  it("each block names its basis: Berkeley's pension split is the General Fund's, its liabilities all City activities; Fremont's are citywide", () => {
    const basis = (c: CityId, id: string) => strip(blocks(c).find((b) => b.id === id)!.html.match(/<p class="sc-basis"[\s\S]*?<\/p>/)![0]);
    expect(basis('berkeley', 'pay')).toMatch(/^General Fund spending/);
    expect(basis('berkeley', 'pension')).toMatch(/^General Fund pension costs/);
    expect(basis('berkeley', 'liabilities')).toContain('for all City activities (governmental and business-type)');
    expect(basis('fremont', 'pension')).toMatch(/^Citywide/);
    expect(basis('fremont', 'opeb')).toMatch(/^Citywide/);
    expect(basis('lafayette', 'pay')).toMatch(/^General Fund spending\. Lafayette's police service is a contract with the Contra Costa County Sheriff/);
    expect(basis('lafayette', 'retirement')).toMatch(/^Lafayette has no defined-benefit pension plan, so it has no pension debt\./);
  });

  it("Fremont says its budget doesn't publish a General Fund total for pay, and Berkeley's OPEB drop is in the report's words", () => {
    expect(strip(section('fremont'))).toContain("Fremont's budget doesn't publish a General Fund total for salaries and benefits.");
    expect(strip(blocks('berkeley').find((b) => b.id === 'liabilities')!.html)).toContain(
      'The report\'s words: “Net OPEB liability decreased by $38.8 million or 50.0% during FY 2025 to $38.7 million from $77.5 million for governmental activities',
    );
  });

  it('Lafayette shows the contribution and OPEB to the dollar, and quotes the rate rather than computing one', () => {
    const [, retirement] = blocks('lafayette');
    expect(strip(retirement.html)).toMatch(/City contributions to the retirement plan FY 2024-25 \$842,472/);
    expect(strip(retirement.html)).toMatch(/governmental activities June 30, 2025 \$758,015/);
    expect(strip(retirement.html)).toContain('equal 10% of base earnings');
    expect(strip(retirement.html)).not.toMatch(/14\.9|15%/);
  });
});

describe('the site FAQ: why the cities can\'t be compared (#65)', () => {
  const faq = page('faq');
  const answer = () => {
    const start = faq.indexOf('id="why-not-compare-staff-costs"');
    expect(start).toBeGreaterThan(-1);
    return strip(faq.slice(start, faq.indexOf('</details>', start) > 0 ? faq.indexOf('</details>', start) : faq.indexOf('</section>', start)));
  };

  it('answers the question, after "comparing cities"', () => {
    expect(faq.indexOf('id="why-not-compare-staff-costs"')).toBeGreaterThan(faq.indexOf('id="comparing-cities"'));
    expect(answer()).toContain("Why can't I compare one city's pension or staff costs with another's?");
  });

  it("names each city's basis as that city's data has it", () => {
    const text = answer();
    expect(text).toContain("Berkeley's pension split is for its General Fund only");
    expect(budget('berkeley').staffCosts!.sections.find((s) => s.id === 'pension')!.basis.text).toMatch(/^General Fund pension costs/);
    expect(text).toContain("Fremont's pension and retiree-health figures are citywide, across all funds, and its budget doesn't publish a General Fund total for salaries and benefits");
    expect(budget('fremont').staffCosts!.sections.every((s) => s.basis.text.startsWith('Citywide'))).toBe(true);
    expect(budget('fremont').staffCosts!.unpublished).toEqual(["Fremont's budget doesn't publish a General Fund total for salaries and benefits."]);
    expect(text).toContain('Lafayette has no defined-benefit pension plan, and contracts its police to the Contra Costa County Sheriff');
    const lafayette = budget('lafayette').staffCosts!.sections.map((s) => s.basis.text).join(' ');
    expect(lafayette).toContain('has no defined-benefit pension plan');
    expect(lafayette).toContain('a contract with the Contra Costa County Sheriff');
  });
});
