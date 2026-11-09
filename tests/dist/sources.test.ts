import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GapBudget } from '../../src/data/types';
import { unwrapFigures } from './figures';

const root = join(import.meta.dirname, '../..');
const dist = join(root, 'dist');
const b: GapBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/budget.json'), 'utf8'));
const html = readFileSync(join(dist, 'us/ca/berkeley/sources/index.html'), 'utf8');
const strip = (h: string) => unwrapFigures(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const text = strip(html);
const pages = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? pages(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []));

describe('sources page', () => {
  const rows = [...html.matchAll(/<li class="src-row" id="(S\d+)" data-type="(city|news|other)"/g)].map((m) => ({ id: m[1], type: m[2] }));

  it('lists all 42 sources, in order: 21 city documents, 10 news reports, 11 from other governments (#51, #54, #63, #64)', () => {
    expect(rows.map((r) => r.id)).toEqual(b.sources.map((s) => s.id));
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 42 }, (_, i) => `S${i + 1}`));
    expect(rows.filter((r) => r.type === 'city')).toHaveLength(21);
    expect(rows.filter((r) => r.type === 'other')).toHaveLength(11);
    expect(text).toContain('City documents (21)');
    expect(text).toContain('News reports (10)');
    expect(text).toContain('Other governments (11)');
  });

  it("labels other governments' documents as not the City's (#51)", () => {
    const row = (id: string) => strip(html.match(new RegExp(`<li class="src-row" id="${id}"[\\s\\S]*?</li>`))![0]);
    expect(row('S30')).toMatch(/^S30 Another government's document, not the City's 2026-27 Adopted Budget Report/);
    expect(row('S30')).toContain('Berkeley Unified School District');
    expect(row('S20')).not.toContain('Another government');
    expect(html).toMatch(/<span class="badge badge--other"[^>]*>S30<\/span>/);
  });

  it('the documents added after the workbook list the pages the site cites', () => {
    const meta = (id: string) => strip(html.match(new RegExp(`id="${id}"[\\s\\S]*?<span class="meta"[^>]*>([^<]*)<`))![1]);
    expect(meta('S20')).toMatch(/· pp\. 1, 2, 55, 96, 170, 172, 173, 248$/);
    expect(meta('S21')).toMatch(/· pp\. 1, 2, 3$/);
    expect(meta('S22')).toMatch(/· p\. 1$/);
    // #63: Item 21's FY2028 department table, and the annotated agenda's motion.
    expect(meta('S40')).toMatch(/· pp\. 11, 12$/);
    expect(meta('S41')).toMatch(/· pp\. 3, 4$/);
    // #64: the Financial Summaries' revenue and spending totals.
    expect(meta('S42')).toMatch(/· pp\. 8, 10$/);
    expect(meta('S1')).not.toMatch(/ p\. /);
  });

  it('explains the adoption amendments and the two capital totals in the known gaps', () => {
    // #63: the annotated agenda records the amendments, so the "until the minutes are posted" caveat is gone.
    expect(text).toContain('Adopted with amendments');
    expect(text).not.toContain('not yet in City records');
    expect(text).not.toMatch(/minutes are posted/i);
    expect(text).toContain(
      "The annotated agenda records the amendments: the Council restored 9 Fire positions and 1 City Manager's Office position for FY2027, paid for with $2.29M of revenue transfers, so the gap didn't change.",
    );
    expect(text).toContain("The overview's $313.8M General Fund total is the adoption staff report's estimate, from before these amendments.");
    const m = (v: number) => `$${(v / 1e6).toFixed(1)}M`;
    expect(text).toContain(`lists ${m(b.capitalProgram.total.total)} for FY27-28; the adoption report's table by funding source totals ${m(b.documentFacts.capitalProgram.total.total)}`);
  });

  it('every chip used anywhere on the site points at a source listed here', () => {
    const listed = new Set(rows.map((r) => r.id));
    const used = new Set<string>();
    for (const file of pages(dist)) for (const m of readFileSync(file, 'utf8').matchAll(/data-source-chip="([S\d ]+)"/g)) for (const id of m[1].split(' ')) used.add(id);
    expect(used.size).toBeGreaterThan(5);
    for (const id of used) expect(listed, id).toContain(id);
  });

  it('"used on" is filled for every source, from where its chips appear', () => {
    const usage = JSON.parse(readFileSync(join(dist, 'us/ca/berkeley/data/source-usage.json'), 'utf8'));
    expect(html).not.toMatch(/data-used-on="S\d+"[^>]*><\/span>/); // no empty placeholder left
    for (const s of b.sources) {
      const cell = html.match(new RegExp(`data-used-on="${s.id}"[^>]*>([\\s\\S]*?)</span></span>`))![1];
      const links = [...cell.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => ({ path: m[1], label: m[2] }));
      expect(links, s.id).toEqual(usage[s.id]);
      if (!links.length) expect(cell).toContain('Not cited on a page yet');
    }
  });

  it('the known-gaps cards quote the data where it has the number', () => {
    const l = b.personnelAndPension.unfundedLiabilities;
    const m = (v: number) => `$${Math.round(v / 1e6)}M`;
    expect(text).toContain(`${m(l[0].amount)} (FY12), ${m(l[1].amount)} (FY21), ~${m(l[2].amount)} (2026) use different assumptions`);
    const it = b.departmentReductions[0].departments.find((d) => d.id === 'it-cost-allocation-plan')!;
    expect(text).toContain(`Department totals differ by $${it.baseline / 1e3}K`);
  });

  it('every download link exists in the build', () => {
    const hrefs = [...html.matchAll(/<a href="(\/us\/ca\/berkeley\/data\/[^"]+)" download/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(14);
    for (const h of hrefs) expect(existsSync(join(dist, h)), h).toBe(true);
    expect(html).toContain('id="downloads"');
  });
});
