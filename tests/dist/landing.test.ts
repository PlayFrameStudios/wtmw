import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CityBudget } from '../../src/data/types';
import { unwrapFigures } from './figures';

// Recomputes every figure on the landing page straight from budget.json, without the
// site's helpers, and checks the built page shows it.
const root = join(import.meta.dirname, '../..');
const b: CityBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/budget.json'), 'utf8'));
const html = readFileSync(join(root, 'dist/index.html'), 'utf8');
// Text only: markup can split a phrase, which would make a missing-text check pass by accident.
const text = unwrapFigures(html).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1');
const millions = (n: number) => `$${(Math.abs(n) / 1e6).toFixed(1)}M`;

describe('landing page numbers trace to the data', () => {
  const depts = b.departmentReductions.find((y) => y.year === 2027)!.departments;

  it('department dollars mapped', () => {
    expect(text).toContain(`${millions(depts.reduce((a, d) => a + d.baseline, 0))} of Berkeley department spending, mapped`);
  });

  it('source count', () => {
    expect(text).toMatch(new RegExp(`\\b${b.sources.length} public sources, each one linked`));
  });

  it('Police and Fire per $100, by largest remainder', () => {
    const total = depts.reduce((a, d) => a + d.baseline, 0);
    const exact = depts.map((d) => ({ id: d.id, v: (d.baseline / total) * 100 }));
    const whole = new Map(exact.map((e) => [e.id, Math.floor(e.v)]));
    let left = 100 - [...whole.values()].reduce((a, n) => a + n, 0);
    for (const e of [...exact].sort((x, y) => (y.v % 1) - (x.v % 1))) if (left-- > 0) whole.set(e.id, whole.get(e.id)! + 1);
    expect(text).toContain(`Police and Fire are $${whole.get('police')! + whole.get('fire')!} of every $100.`);
  });

  it('the gap', () => {
    const gap = b.deficitBridge.steps.find((s) => s.key === 'final-gap')!.years[2027];
    expect(text).toContain(`A ${millions(gap)} gap after adjustments.`);
    expect(text).toContain(`−$${Math.abs(gap).toLocaleString('en-US')}`);
  });

  it('positions cut with and without the sales tax', () => {
    const p = Object.fromEntries(b.fte.positions.map((x) => [x.key, x.vacant + x.filled]));
    expect(text).toContain(`${p['with-sales-tax']} positions cut instead of ${p['without-sales-tax']}.`);
  });

  it('who is cutting what', () => {
    const cut = depts.filter((d) => d.reduction > 0);
    expect(text).toContain(`${millions(cut.reduce((a, d) => a + d.reduction, 0))} across ${cut.length} departments.`);
  });

  it('every one of those figures opens its receipt', () => {
    const figures = [...html.matchAll(/<button type="button" class="sourced[^"]*"[^>]*data-receipt[^>]*>([^<]*)</g)].map((m) => m[1].trim());
    // The floating receipt card's gap, the mapped baseline, then the four answers: Police and Fire per $100, the gap, positions, cuts.
    expect(figures).toEqual(['−$29,249,339', '$283.8M', '$57', '$29.2M', '105', '$29.3M']);
  });
});

describe('landing page sharing and requests', () => {
  const meta = (prop: string) => html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`))?.[1];

  it('has the title, canonical URL and link-preview tags', () => {
    expect(html).toContain('<title>Where the Money Went</title>');
    expect(html).toContain('<link rel="canonical" href="https://wherethemoneywent.com/">');
    expect(meta('og:url')).toBe('https://wherethemoneywent.com/');
    expect(meta('og:image')).toBe('https://wherethemoneywent.com/og/wherethemoneywent.png');
    expect(meta('twitter:card')).toBe('summary_large_image');
    expect(meta('description')).toMatch(/^Your city's budget, finally readable\./);
  });

  it('ships a 1200×630 link-preview image', () => {
    const png = readFileSync(join(root, 'dist/og/wherethemoneywent.png'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it('"Request your city" opens the request-a-city issue form', () => {
    expect(html).toMatch(/<form[^>]*action="https:\/\/github\.com\/PlayFrameStudios\/wtmw\/issues\/new"[^>]*method="get"/);
    expect(html).toContain('name="template" value="request-a-city.yml"');
  });
});

// #28, re-scoped: main's homepage, minus one eyebrow, with the chart card linking to the city.
describe('landing page, as re-scoped by Jeremy (#28)', () => {
  it('drops the "Free · Independent · Every number sourced" eyebrow and keeps the rest of the hero', () => {
    expect(text).not.toContain('Every number sourced');
    expect(text).toContain("Your city's budget, finally readable.");
    expect(text).toContain('numbers without a receipt');
  });

  it('the "Where every $100 goes" card links to the city overview, and its chart stays static', () => {
    const card = html.match(/<div class="card city-card"[^>]*>([\s\S]*?)<div class="card receipt-card"/)![1];
    expect(card).toMatch(/<a class="card-link"[^>]*href="\/us\/ca\/berkeley\/"[^>]*>Where every \$100 goes<\/a>/);
    expect(card).not.toMatch(/<button/);
    // Nothing on this page invites a tap on squares that can't be tapped (#33).
    expect(text).not.toMatch(/Tap a square|Click a square/);
  });
});
