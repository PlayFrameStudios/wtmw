/**
 * #66 on the built pages: "Money voters set aside", last on each city's Revenue page. The groups and taxes are
 * budget.json's, in order; every amount is a receipt quoting the line it was read from; a cell no City document fills
 * says so and carries no figure; Berkeley's sum is labeled as ours; the voice is neutral; and the Sources page shows
 * the two Safe Streets rates.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CityBudget } from '../../src/data/types';
import type { Receipt } from '../../src/lib/receipts';
import { GROUP_TITLES, NOT_IN_SOURCES } from '../../src/lib/voter-taxes';

const root = join(import.meta.dirname, '../..');
const CITIES = ['berkeley', 'fremont', 'lafayette'] as const;
type CityId = (typeof CITIES)[number];
const budget = (c: CityId): CityBudget => JSON.parse(readFileSync(join(root, 'data/cities/us/ca', c, 'budget.json'), 'utf8'));
const page = (p: string) => readFileSync(join(root, 'dist', p, 'index.html'), 'utf8');
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// Tags become nothing, not spaces, so "$99.7M</button>: our sum" reads as printed.
const strip = (h: string) => unescape(h.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const receipts = (h: string): Receipt[] => [...h.matchAll(/data-receipt="([^"]*)"/g)].map((m) => JSON.parse(unescape(m[1])));
const section = (c: CityId) => {
  const h = page(`us/ca/${c}/revenue`);
  const start = h.indexOf('<section class="vt"');
  expect(start, c).toBeGreaterThan(0);
  return h.slice(start, h.indexOf('</section>', start));
};
const cards = (c: CityId) => {
  const s = section(c);
  return [...s.matchAll(/<li class="vt-tax"[^>]*data-voter-tax="([^"]+)"/g)].map((m, i, all) => ({ id: m[1], html: s.slice(m.index, all[i + 1]?.index ?? s.length) }));
};
const cell = (html: string, name: string) => {
  const start = html.indexOf(`data-cell="${name}"`);
  return html.slice(start, html.indexOf('</dd>', start));
};

describe('"Money voters set aside" (#66)', () => {
  for (const c of CITIES) {
    it(`${c}: last on the Revenue page, each group and tax in budget.json, in order`, () => {
      const h = page(`us/ca/${c}/revenue`);
      expect(h.indexOf('id="voter-taxes"')).toBeGreaterThan(h.lastIndexOf('</table>'));
      const taxes = budget(c).voterTaxes!.taxes;
      const groups = [...section(c).matchAll(/data-voter-group="(\w+)"/g)].map((m) => m[1]);
      expect(groups).toEqual(['special', 'general', 'bonds'].filter((g) => taxes.some((t) => t.group === g)));
      for (const g of groups) expect(strip(section(c))).toContain(GROUP_TITLES[g as keyof typeof GROUP_TITLES]);
      const order = groups.flatMap((g) => taxes.filter((t) => t.group === g).map((t) => t.id));
      expect(cards(c).map((k) => k.id)).toEqual(order);
    });

    it(`${c}: every amount is a receipt quoting its line, on its page; every quote shown is the cited one`, () => {
      for (const t of budget(c).voterTaxes!.taxes) {
        const card = cards(c).find((k) => k.id === t.id)!.html;
        const amount = receipts(cell(card, 'amount'));
        if (!t.amount) {
          expect(amount, t.id).toEqual([]);
          expect(strip(cell(card, 'amount'))).toContain(NOT_IN_SOURCES);
          continue;
        }
        expect(amount).toHaveLength(1);
        expect(amount[0]).toMatchObject({ kind: 'figure', value: `$${t.amount.value.toLocaleString('en-US')}`, sources: [t.amount.cite.source], quote: t.amount.cite.quote });
        if (t.amount.cite.page) expect(amount[0].page).toBe(t.amount.cite.page);
        for (const [name, ref] of [['purpose', t.purpose], ['kind', t.kind]] as const) {
          if (!ref) continue;
          expect(strip(cell(card, name))).toContain(`“${ref.quote}”`);
          expect(receipts(cell(card, name))[0]).toMatchObject({ sources: [ref.source], quote: ref.quote });
        }
      }
    });

    it(`${c}: a cell no City document fills says so, and holds no figure or receipt`, () => {
      for (const t of budget(c).voterTaxes!.taxes)
        for (const name of ['purpose', 'approved', 'rate', 'amount'] as const) {
          const html = cell(cards(c).find((k) => k.id === t.id)!.html, name);
          if (t[name]) expect(html, `${t.id} ${name}`).not.toContain('data-unsourced');
          else {
            expect(strip(html.replace(/^[^>]*>/, ''))).toBe(NOT_IN_SOURCES);
            expect(html).not.toContain('data-receipt');
          }
        }
    });

    it(`${c}: neutral voice, no adjectives on taxes`, () => {
      const words = strip(section(c)).toLowerCase();
      for (const w of ['hefty', 'huge', 'massive', 'burden', 'modest', 'steep', 'generous', 'just ', 'merely', 'whopping', 'significant', 'sharply', 'exceeded', 'windfall', 'costly', 'cheap', 'only $'])
        expect(words, w).not.toContain(w);
    });
  }

  it("Berkeley: the $99.7M is our sum of the City's eight estimates, its parts in its receipt", () => {
    const s = section('berkeley');
    const sum = s.slice(s.indexOf('data-voter-sum'), s.indexOf('</p>', s.indexOf('data-voter-sum')));
    expect(strip(sum.replace(/^[^>]*>/, ''))).toBe(
      "$99.7M: our sum of the City's eight estimates (FY2027 estimate). It leaves out City Street Lighting, whose amount is not in the City's documents we use.",
    );
    const r = receipts(sum)[0] as Receipt & { parts: { label: string }[] };
    expect(r).toMatchObject({ value: '$99,718,096', label: "Our sum of the City's eight estimates, FY2027 estimate" });
    expect(r.sources.sort()).toEqual(['S46', 'S47', 'S48', 'S49', 'S50', 'S51', 'S52', 'S53']);
    expect(r.parts).toHaveLength(8);
    // No other city prints a sum: each has one special tax or none.
    expect(section('fremont')).not.toContain('data-voter-sum');
    expect(section('lafayette')).not.toContain('data-voter-sum');
  });

  it('Berkeley: Safe Streets shows the ordinance rate; the Sources page cites both', () => {
    const card = cards('berkeley').find((k) => k.id === 'safe-streets')!.html;
    expect(strip(cell(card, 'rate'))).toContain('$0.17842 per sq ft (dwelling units)');
    const h = page('us/ca/berkeley/sources');
    const start = h.indexOf('data-gap="safe-streets-rate"');
    const gap = h.slice(start, h.indexOf('</li>', start));
    expect(strip(gap.slice(gap.indexOf('<h3')))).toBe(
      "Two Safe Streets rates" + "The City's property-tax page prints the residential rate as 0.17482. The FY 2027 tax-rate ordinance sets $0.17842, and the Revenue page uses the ordinance.",
    );
    const r = receipts(gap);
    expect(r.map((x) => x.sources[0])).toEqual(['S45', 'S53']);
    expect(r[0].quote).toContain('0.17482');
    expect(r[1].quote).toContain('$0.17842');
    // Only Berkeley has the card.
    expect(page('us/ca/fremont/sources')).not.toContain('safe-streets-rate');
  });

  it('the Sources pages list the new documents and the pages cited', () => {
    const t = strip(page('us/ca/berkeley/sources'));
    expect(t).toContain('S52FY 2027 Tax Rate: Maintenance of Parks, City Trees and Landscaping (Item 13)City of Berkeley · June 16, 2026 · Parks tax: FY2027 estimated collections · pp. 2, 3Used on: Revenue');
    expect(t).toContain('Property Taxes: City of Berkeley property tax assessments and fees for tax year 2026-2027');
    expect(strip(page('us/ca/fremont/sources'))).toContain('Paramedic Tax');
    expect(strip(page('us/ca/lafayette/sources'))).toContain('Measure H Sales Tax');
  });
});
