import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GapBudget } from '../../src/data/types';
import { unwrapFigures } from './figures';

const root = join(import.meta.dirname, '../..');
const b: GapBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/budget.json'), 'utf8'));
const html = readFileSync(join(root, 'dist/us/ca/berkeley/ballot/index.html'), 'utf8');
const strip = (h: string) => unwrapFigures(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const cards = [...html.matchAll(/<li class="card scenario"[^>]*data-outcome="(passes|fails)"[^>]*>([\s\S]*?)<\/li>\s*(?=<li class="card scenario"|<\/ul>)/g)].map((m) => ({
  outcome: m[1],
  html: m[2],
  text: strip(m[2]),
}));

describe('ballot page (built)', () => {
  it('has exactly two scenario cards, passes then fails', () => {
    expect(cards.map((c) => c.outcome)).toEqual(['passes', 'fails']);
  });

  it('passes 105 positions (85 vacant, 20 filled), FTE 1,455; fails 138 (100 / 38), FTE 1,422', () => {
    const pos = (k: string) => b.fte.positions.find((p) => p.key === k)!;
    const fte = (k: string) => Math.round(b.fte.scenarios.find((s) => s.key === k)!.netFte).toLocaleString('en-US');
    const [passes, fails] = cards;
    const w = pos('with-sales-tax');
    const wo = pos('without-sales-tax');
    expect([w.total, w.vacant, w.filled, fte('with-sales-tax')]).toEqual([105, 85, 20, '1,455']);
    expect([wo.total, wo.vacant, wo.filled, fte('without-sales-tax')]).toEqual([138, 100, 38, '1,422']);
    // #31: the story's words: "105 positions cut, 20 people laid off".
    expect(passes.text).toContain(`${w.total} positions cut ${w.vacant} vacant, ${w.filled} filled ${w.filled} people laid off`);
    expect(passes.text).toContain(`${fte('with-sales-tax')} FTE`);
    expect(fails.text).toContain(`${wo.total} positions cut ${wo.vacant} vacant, ${wo.filled} filled ${wo.filled} people laid off`);
    expect(fails.text).toContain(`${fte('without-sales-tax')} FTE`);
  });

  it('the pictograms are drawn to one scale, filled to the layoff counts', () => {
    const count = (h: string, re: RegExp) => (h.match(re) ?? []).length;
    for (const c of cards) expect(count(c.html, /class="person[ "]/g)).toBe(40);
    expect(count(cards[0].html, /class="person on/g)).toBe(20);
    expect(count(cards[1].html, /class="person on/g)).toBe(38);
  });

  it('both cards have the same markup apart from their numbers and words', () => {
    const skeleton = (h: string) =>
      h
        .replace(/data-receipt="[^"]*"/g, '')
        .replace(/aria-label="[^"]*"/g, '')
        .replace(/>[^<]*</g, '><')
        .replace(/class="person on/g, 'class="person')
        // Chips keep their source ids: both outcomes cite the same documents, in the same places.
        .replace(/data-source-chip="([S\d ]+)"/g, 'chip-$1');
    expect(skeleton(cards[0].html)).toBe(skeleton(cards[1].html));
  });

  it('each card quotes the adoption report on Fire Station 4 and the 21 police positions', () => {
    const [passes, fails] = cards;
    expect(passes.text).toContain('Fire Station 4 Tax revenue proposed to keep it open');
    expect(fails.text).toContain('Fire Station 4 Closure reconsidered for FY2028');
    expect(passes.text).toContain('21 police positions Tax revenue proposed to keep them');
    expect(fails.text).toContain('21 police positions Funded only until the vote result');
    for (const c of cards) {
      const receipts = [...c.html.matchAll(/data-receipt="([^"]*)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')));
      expect(receipts.filter((r) => r.sources[0] === 'S20').map((r) => r.page)).toEqual([55, 96]);
    }
  });

  it('the nine-fire-positions caveat is said once, under both cards, since it applies to both alike (#31)', () => {
    const caveat = 'At adoption, the Council was reported to have restored nine fire positions; the counts shown are from the April 16 plan.';
    for (const c of cards) expect(c.text).not.toContain('nine fire positions');
    const t = strip(html);
    expect(t.split(caveat)).toHaveLength(2);
    const after = html.slice(html.lastIndexOf('<li class="card scenario"'));
    expect(strip(after.slice(after.indexOf('</ul>'), after.indexOf('The two measures')))).toContain(caveat);
  });

  it('leads with the outcomes: both cards come before the measures (#31)', () => {
    expect(html.indexOf('class="card scenario"')).toBeLessThan(html.indexOf('class="card measure"'));
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('class="card scenario"'));
  });

  it("each measure is one heading and one line, and every mechanic sits behind its Details (#31)", () => {
    const section = html.slice(html.indexOf('<section class="measures-section"'), html.indexOf('</section>', html.indexOf('<section class="measures-section"')));
    const measures = section.split('<li class="card measure"').slice(1).map((m) => m.slice(m.indexOf('>') + 1));
    expect(measures).toHaveLength(2);
    const outside = measures.map((m) => strip(m.replace(/<details[\s\S]*<\/details>/, '')).trim());
    const inside = measures.map((m) => strip(m.match(/<details[\s\S]*<\/details>/)![0]));
    const d = b.documentFacts;
    expect(outside[0]).toBe(`Measure ${d.salesTaxMeasure.letter}: a 0.5% sales tax for any city purpose. It needs a simple majority to pass. The City estimates it would raise $9–10M a year.`);
    expect(outside[1]).toBe(`Measure ${d.bondMeasure.letter}: a $300M bond for streets, buildings and parks. It needs a two-thirds vote to pass. It doesn't change this year's gap.`);
    for (const m of measures) expect(m).not.toMatch(/<details[^>]*\bopen\b/);
    expect(inside[0]).toMatch(/^ ?Details on Measure V Official title: .* 10\.75%\. It would start April 1, 2027 .* Read Measure V Full text/);
    expect(inside[1]).toMatch(/^ ?Details on Measure U Official title: .* \$22\.14 a year .* at least every three years\. .* \$2\.12B.* Read Measure U Full text/);
    // Same parts in the same order on both cards: heading, line, Details (title, mechanics, documents).
    const parts = (m: string) => [...m.matchAll(/<(p|h3|details|summary|nav)\b[^>]*class="([^"]*)"|<(h3|details|summary)>/g)].map((x) => (x[1] ?? x[3]) + (x[2] ? `.${x[2].split(' ')[0]}` : ''));
    expect(parts(measures[0]).slice(0, 5)).toEqual(parts(measures[1]).slice(0, 5));
  });

  it('names the measures by letter, with the City Attorney and adoption figures', () => {
    const t = strip(html);
    const d = b.documentFacts;
    expect(t).toContain(`Measure ${d.salesTaxMeasure.letter}: a 0.5% sales tax for any city purpose. It needs a simple majority to pass.`);
    expect(t).toContain(`Measure ${d.bondMeasure.letter}: a $300M bond for streets, buildings and parks. It needs a two-thirds vote to pass.`);
    expect(t).toContain('The City estimates it would raise $9–10M a year');
    expect(t).toContain('It would start April 1, 2027 and last until ended by the voters.');
    expect(t).toContain(`about $${d.bondCost.perHundredK.toFixed(2)} a year per $100,000 of assessed value on average over ${d.bondCost.years} years`);
    expect(t).toContain(`Its highest rate would be about $${d.bondPeak.perHundredK}, from ${d.bondPeak.from}.`);
    expect(t).toContain('at least every three years');
    expect(t).toContain(`unfunded capital and maintenance need at $${+(d.capitalNeed.amount / 1e9).toFixed(2)}B`);
    expect(t).toContain('The election is November 3, 2026.');
    // #32: real headings, not "If Measure V, the sales tax… / …passes / …fails".
    expect(cards.map((c) => c.html.match(/<h2 class="scenario-h"[^>]*>([^<]*)/)![1].trim())).toEqual([`If Measure ${d.salesTaxMeasure.letter} passes`, `If Measure ${d.salesTaxMeasure.letter} fails`]);
  });

  it('each measure card shows its official title and links its City documents, in the same form', () => {
    const t = strip(html);
    const d = b.documentFacts;
    expect(t).toContain(`Official title: “${d.salesTaxTitle.title}”`);
    expect(t).toContain(`Official title: “${d.bondTitle.title}”`);
    const navs = [...html.matchAll(/<nav class="read"[^>]*>([\s\S]*?)<\/nav>/g)].map((m) => m[1]);
    expect(navs).toHaveLength(2);
    const links = navs.map((n) => [...n.matchAll(/<a href="([^"]+)"[^>]*data-source-link="(S\d+)"[^>]*>\s*([^<]+?)\s*</g)].map((m) => ({ href: m[1].replace(/&amp;/g, '&'), source: m[2], label: m[3] })));
    // Same labels in the same order on both cards.
    expect(links[0].map((l) => l.label)).toEqual(links[1].map((l) => l.label));
    expect(links[0].map((l) => l.label)).toEqual(['Full text', 'Impartial analysis', 'All City measures']);
    for (const l of links.flat()) expect(l.href).toBe(b.sources.find((s) => s.id === l.source)!.url);
    expect(strip(navs[0])).toContain(`Read Measure ${d.salesTaxMeasure.letter}`);
    expect(strip(navs[1])).toContain(`Read Measure ${d.bondMeasure.letter}`);
    expect(links[0][0].source).not.toBe(links[1][0].source); // each card's own full text
  });

  it('the footnote says the budget was adopted with amendments, not that figures "may have changed"', () => {
    const t = strip(html);
    expect(t).toContain('The Council adopted the budget on June 23, 2026 with amendments made at that meeting');
    expect(t).not.toMatch(/may have changed/);
  });

  it('the footnote calls the $9.4M one-time money until the vote, not tax money, and says when the tax would start', () => {
    const t = strip(html);
    expect(t).toContain('Note: in FY27 the plan uses $9.4M of one-time money (reserves and a Successor Agency transfer) to soften Police, Fire and Parks, Rec & Waterfront cuts until the vote.');
    expect(t).toContain('The tax itself would start April 1, 2027.');
  });

  it('uses no advocacy language', () => {
    expect(strip(html)).not.toMatch(/vote (yes|no)\b|devastat|catastroph|disastr|must pass/i);
  });
});
