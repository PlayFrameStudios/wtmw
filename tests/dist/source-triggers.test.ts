import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Receipt } from '../../src/lib/receipts';

// #29: the S-chips are gone. A figure is its own button; prose without a figure gets a quiet ⓘ.
const root = join(import.meta.dirname, '../..');
const before: Record<string, string[]> = JSON.parse(readFileSync(join(root, 'tests/fixtures/receipts-before-29.json'), 'utf8'));
const html = (path: string) => readFileSync(join(root, 'dist', path, 'index.html'), 'utf8');
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const receipts = (h: string): Receipt[] => [...h.matchAll(/data-receipt="([^"]*)"/g)].map((m) => JSON.parse(unescape(m[1])));
const key = (kind: string, value: string, label: string, sources: string, page?: number, quote?: string) => [kind, value, label, sources, page ?? '', quote ?? ''].join(' | ');

/** Everything a receipt lets a reader reach: the figure, or each document cite it carries (merged cites count for each). */
function reachable(r: Receipt): string[] {
  if (r.kind === 'figure') return [key('figure', r.value!, r.label!, r.sources.join('+'), r.page, r.quote)];
  return [key('source', '', '', r.sources[0], r.page, r.quote), ...(r.also ?? []).map((c) => key('source', '', '', c.source, c.page, c.quote))];
}

// The overview's "Don't take our word for it" strip showed six whole-document chips, as a sample of the
// sources. It now says "Tap any number" and links to the Sources page, which lists every document; #33 cuts
// the section. And #31 rewrote overview card 3 to state only the two position counts, so the measures'
// 0.5% and $300M figures now live on the Ballot page alone (checked below). Nothing else may go missing.
const STRIP = /^source \| {2}\| {2}\| S\d+ \| {2}\| $/;
const CARD3 = /^figure \| (0\.5%|\$300,000,000) \| Measure [A-Z]: proposed (local sales tax|infrastructure bond) on the /;
// #33: a square's sheet on the overview shows only the name, whole dollars and Department
// details; each department's baseline receipt lives on the Departments page (checked below).
const SHEET = /^figure \| \$[\d,]+ \| .+ General Fund baseline, FY2027 \| S1 \| {2}\| $/;
const RETIRED: Record<string, RegExp> = { '/us/ca/berkeley/': new RegExp(`${STRIP.source}|${CARD3.source}|${SHEET.source}`) };
// #61: the cuts view moved from Departments to The Gap (#cuts), so its receipts are reachable there.
const MOVED: Record<string, string[]> = { '/us/ca/berkeley/departments/': ['/us/ca/berkeley/gap/'] };
// #63: FY2028's department figures cited the April 16 plan (S1), which has no FY2028 table; they now cite Item 21 (S40)
// row by row. And the Ballot page's position-count caveat, which cited the supplemental and news (S23, S24), now cites
// the adopted motion (S41). Each is checked below: the same figure, re-cited; the caveat, replaced.
const RECITED = /^figure \| [^|]+ \| [^|]+, FY2028[:,][^|]* \| S1 \| {2}\| $/;
const REPLACED: Record<string, RegExp> = { '/us/ca/berkeley/ballot/': /^source \| {2}\| {2}\| S2[34] \| / };

describe('every receipt that had a chip is still reachable on its page (#29)', () => {
  for (const [path, keys] of Object.entries(before)) {
    it(path, () => {
      const now = new Set([path, ...(MOVED[path] ?? [])].flatMap((p) => receipts(html(p)).flatMap(reachable)));
      const missing = keys.filter((k) => !now.has(k) && !RETIRED[path]?.test(k) && !RECITED.test(k) && !REPLACED[path]?.test(k));
      expect(missing).toEqual([]);
    });
  }

  it('every FY2028 department figure that cited S1 is still there, cited to its row of Item 21 (S40) instead (#63)', () => {
    const now = receipts(html('/us/ca/berkeley/gap/')).filter((r) => r.kind === 'figure');
    const recited = Object.values(before).flat().filter((k) => RECITED.test(k));
    expect(recited.length).toBeGreaterThanOrEqual(75);
    // The five rows #63 corrected (the charter offices repeated FY2027's figures; PRW's cut was $1 low) changed value too.
    const corrected = /^(City Attorney|City Auditor|Office of Dir\. of Police Accountability \(ODPA\)|Mayor & Council|Parks, Recreation & Waterfront \(PRW\)), /;
    for (const k of new Set(recited)) {
      const [, value, label] = k.split(' | ');
      const match = now.filter((r) => r.label === label && (corrected.test(label) || r.value === value));
      expect(match.length, k).toBeGreaterThan(0);
      for (const r of match) expect([r.sources.join('+'), r.page], k).toEqual(['S40', 11]);
    }
    expect(now.some((r) => r.sources[0] === 'S1' && / FY2028[:,]/.test(r.label!))).toBe(false);
  });

  it("the Ballot page's position-count caveat cites the adopted motion, not the supplemental and news (#63)", () => {
    const keys = receipts(html('/us/ca/berkeley/ballot/')).flatMap(reachable);
    expect(keys.some((k) => /^source \| {2}\| {2}\| S41 \| 3 \| In both FY 2027 and FY 2028 /.test(k))).toBe(true);
    expect(keys.filter((k) => REPLACED['/us/ca/berkeley/ballot/'].test(k))).toEqual([]);
  });

  it('the retired strip is gone, and the Sources page is still in the nav and footer (#33)', () => {
    const h = html('/us/ca/berkeley/');
    expect(h.match(/<a [^>]*href="\/us\/ca\/berkeley\/sources\/"/g)!.length).toBeGreaterThanOrEqual(2);
    expect(receipts(h).flatMap(reachable).filter((k) => RETIRED['/us/ca/berkeley/'].test(k))).toEqual([]);
  });

  it("each department baseline the sheets dropped still opens its receipt on the cuts view, The Gap's since #61 (#33)", () => {
    const depts = receipts(html('/us/ca/berkeley/gap/'));
    // The overview's sheets carried them. (The homepage's static chart never did: main's homepage stays, #28.)
    for (const path of ['/us/ca/berkeley/']) {
      const dropped = before[path].filter((k) => SHEET.test(k));
      expect(dropped, path).toHaveLength(16);
      for (const k of dropped) {
        const [, value, , sources] = k.split(' | ');
        // Its FY2027 baseline: a row's panel, or the "Not shown" footnote for the excluded accounting line.
        expect(depts.some((r) => r.kind === 'figure' && r.value === value && r.sources.join('+') === sources && /FY2027: (General Fund )?baseline\b/.test(r.label!)), k).toBe(true);
      }
    }
  });

  it("the measures' figures card 3 dropped still open their receipts on the Ballot page (#31)", () => {
    const ballot = receipts(html('/us/ca/berkeley/ballot/'));
    const dropped = before['/us/ca/berkeley/'].filter((k) => CARD3.test(k));
    expect(dropped).toHaveLength(2);
    for (const k of dropped) {
      const [, value, , sources] = k.split(' | ');
      expect(ballot.some((r) => r.kind === 'figure' && r.value === value && r.sources.join('+') === sources), k).toBe(true);
    }
  });
});

describe('triggers', () => {
  for (const path of Object.keys(before)) {
    const h = html(path);
    const triggers = [...h.matchAll(/<(\w+)([^>]*\bdata-source-chip="[^"]*"[^>]*)>([\s\S]*?)<\/\1>/g)];

    it(`${path}: no S-chip labels, and every trigger is a button that names its source`, () => {
      if (path === '/us/ca/berkeley/glossary/') return;
      expect(triggers.length).toBeGreaterThan(0);
      for (const [, tag, attrs, inner] of triggers) {
        expect(tag).toBe('button');
        expect(attrs).toContain('aria-haspopup="dialog"');
        expect(inner.replace(/<[^>]+>/g, '').trim()).not.toMatch(/^S\d+$/);
        expect(attrs).not.toMatch(/class="chip\b/);
        expect(unescape(attrs.match(/aria-label="([^"]*)"/)![1])).toMatch(/(^Source: |, source: ).+/);
      }
    });

    it(`${path}: a figure button sits in its sentence, not glued to the words beside it`, () => {
      // Look past inline markup (a glossary term, a link) to the character a reader sees next to the figure:
      // "$313.8M</button><span class="term">General Fund" renders "$313.8MGeneral Fund".
      // Other spans here are layout cells (a step's value beside its label), so only terms and links count as inline.
      const INLINE = /^(?:<span class="term"[^>]*>|<a\b[^>]*>|<em>|<strong>)+/;
      for (const m of h.matchAll(/(.)<button[^>]*class="sourced\b[^>]*>([^<]*)<\/button>/g)) {
        const after = h.slice(m.index + m[0].length).replace(INLINE, '')[0];
        expect(m[1], `before "${m[2]}"`).not.toMatch(/[A-Za-z0-9]/);
        expect(after, `after "${m[2]}"`).not.toMatch(/[A-Za-z0-9]/);
      }
    });
  }
});
