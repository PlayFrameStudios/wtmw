/**
 * #63 on the built pages: the Fire and CMO cuts say what the Council restored at adoption, beside the proposed figure
 * (never netted against it), with the motion's table and the motion as receipts; no page says "until the minutes are
 * posted"; and the cuts view's FY2028 figures open Item 21's row.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GapBudget } from '../../src/data/types';
import type { Receipt } from '../../src/lib/receipts';

const root = join(import.meta.dirname, '../..');
const b: GapBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/budget.json'), 'utf8'));
const page = (p: string) => readFileSync(join(root, 'dist/us/ca/berkeley', p, 'index.html'), 'utf8');
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const receipts = (h: string): Receipt[] => [...h.matchAll(/data-receipt="([^"]*)"/g)].map((m) => JSON.parse(unescape(m[1])));
const strip = (h: string) => unescape(h.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

const gap = page('gap');
const cuts = gap.slice(gap.indexOf('id="cuts"'));
const ballot = page('ballot');
const { restored, motion } = b.documentFacts.adoptionAmendments;
const fire = restored.find((r) => r.department === 'fire')!;
const cmo = restored.find((r) => r.department === 'cmo')!;

describe("The Gap's cuts: what the Council restored, beside the cut (#63)", () => {
  const panel = (id: string) => cuts.match(new RegExp(`<section class="panel" id="${id}"[\\s\\S]*?</section>`))![0];

  it("Fire's FY2027 panel says $1.73M restored for 9 positions, and its receipts are the motion's table and the motion", () => {
    const h = panel('fire');
    const fy27 = h.slice(h.indexOf('class="yr yr--fy2027"'), h.indexOf('class="yr yr--fy2028"'));
    const note = fy27.slice(fy27.indexOf('data-restored="fire"'));
    expect(strip(note.slice(0, note.indexOf('</p>')))).toMatch(
      /^[^A]*At adoption, the Council restored \$1\.73M of this, for 9 positions \(a fire inspector, 5 firefighters and 3 paramedics\), paid for with revenue transfers that include more ambulance transport revenue\.$/,
    );
    const [amount, chip] = receipts(note.slice(0, note.indexOf('</p>')));
    expect(amount).toMatchObject({ kind: 'figure', value: '$1,728,334', sources: ['S41'], page: 4, quote: fire.cite.quote });
    expect(amount.parts!.map((p) => p.value)).toEqual(['$238,232', '$1,109,795', '$380,307']);
    expect(chip).toMatchObject({ kind: 'source', sources: ['S41'], page: 3, quote: motion.quote });
    // Beside the proposed cut, not netted against it: the FY2027 cut is the proposal's.
    expect(receipts(fy27).find((r) => /Fire, FY2027: proposed cut/.test(r.label ?? ''))?.value).toBe('$6,653,092');
  });

  it("Fire's FY2028 panel says the motion funds the same positions, with no amount", () => {
    const fy28 = panel('fire').slice(panel('fire').indexOf('class="yr yr--fy2028"'));
    const note = fy28.slice(fy28.indexOf('data-restored="fire"'));
    expect(strip(note.slice(note.indexOf('>') + 1, note.indexOf('</p>')))).toBe('The adopted motion funds the same 9 positions in FY2028; its table lists FY2027 amounts only.');
    expect(receipts(note.slice(0, note.indexOf('</p>'))).map((r) => [r.kind, r.sources[0], r.page])).toEqual([['source', 'S41', 3]]);
  });

  it("CMO's FY2027 panel says one position ($236,000), with its line as the receipt and no motion chip; nothing for FY2028", () => {
    const h = panel('cmo');
    const fy27 = h.slice(h.indexOf('class="yr yr--fy2027"'), h.indexOf('class="yr yr--fy2028"'));
    const note = fy27.slice(fy27.indexOf('data-restored="cmo"'));
    expect(strip(note.slice(note.indexOf('>') + 1, note.indexOf('</p>')))).toBe('At adoption, the Council restored one economic development position ($236,000).');
    expect(receipts(note.slice(0, note.indexOf('</p>'))).map((r) => [r.kind, r.value, r.page, r.quote])).toEqual([['figure', '$236,000', 4, cmo.cite.quote]]);
    expect(h.slice(h.indexOf('class="yr yr--fy2028"'))).not.toContain('data-restored');
  });

  it('no other department has a note', () => {
    const ids = [...cuts.matchAll(/data-restored="([^"]+)"/g)].map((m) => m[1]);
    expect([...new Set(ids)].sort()).toEqual(['cmo', 'fire']);
    expect(ids).toHaveLength(3);
  });

  it("the cuts view's FY2028 figures open Item 21's row; FY2027's the April 16 plan", () => {
    const figures = receipts(cuts).filter((r) => r.kind === 'figure' && /, FY20(27|28):/.test(r.label ?? ''));
    const fy28 = figures.filter((r) => /, FY2028:/.test(r.label!));
    expect(fy28.length).toBeGreaterThan(40);
    for (const r of fy28) expect([r.sources.join('+'), r.page], r.label).toEqual(['S40', 11]);
    for (const r of figures.filter((x) => /, FY2027:/.test(x.label!) && !/restored/.test(x.label!))) expect(r.sources, r.label).toEqual(['S1']);
    const mc = fy28.find((r) => r.label === 'Mayor & Council, FY2028: General Fund baseline')!;
    expect(mc).toMatchObject({ value: '$7,014,592', quote: 'Mayor & Council* 7,014,592 877,248 6,136,365 12.5% 0 877,248 12.5%' });
  });
});

describe('Ballot page: the same notes under the FY2027 cuts (#63)', () => {
  const section = ballot.slice(ballot.indexOf('class="dc-section"'), ballot.indexOf('</section>', ballot.indexOf('class="dc-section"')));
  const li = (id: string) => section.match(new RegExp(`<li[^>]*data-dept="${id}"[^>]*>[\\s\\S]*?</li>`))![0];

  it("Fire's row, in the switch, and CMO's, in the same-either-way list", () => {
    const f = li('fire');
    expect(strip(f.slice(f.indexOf('data-restored="fire"')))).toContain(
      'At adoption, the Council restored $1.73M of this, for 9 positions (a fire inspector, 5 firefighters and 3 paramedics), paid for with revenue transfers that include more ambulance transport revenue.',
    );
    const c = li('cmo');
    expect(strip(c.slice(c.indexOf('data-restored="cmo"')))).toContain('At adoption, the Council restored one economic development position ($236,000).');
    expect(receipts(f).find((r) => r.label === 'Fire: restored at adoption, FY2027')).toMatchObject({ page: 4, value: '$1,728,334' });
  });

  it('no other row has a note', () => {
    expect([...section.matchAll(/data-restored="([^"]+)"/g)].map((m) => m[1]).sort()).toEqual(['cmo', 'fire']);
  });
});

describe('the "until the minutes are posted" caveats are gone (#63)', () => {
  const pages = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? pages(join(d, e.name)) : e.name.endsWith('.html') ? [join(d, e.name)] : []));

  it('no built page says it, or that counts are "from the April 16 plan"', () => {
    const files = pages(join(root, 'dist/us/ca/berkeley'));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const t = strip(readFileSync(f, 'utf8'));
      expect(t, f).not.toMatch(/minutes are posted|counts (shown )?are from the April 16 plan|not yet in City records/i);
    }
  });
});
