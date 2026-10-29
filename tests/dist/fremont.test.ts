/**
 * Fremont's built pages (#43): a draft city built from City documents alone. It is built and
 * served but noindexed and linked from no published page, and every figure's receipt names a
 * page of a document the build checked it against.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CityBudget } from '../../src/data/types';

const root = join(import.meta.dirname, '../..');
const dist = join(root, 'dist');
const b: CityBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/fremont/budget.json'), 'utf8'));
const excerpt = (id: string) => JSON.parse(readFileSync(join(root, `data/cities/us/ca/fremont/source/excerpts/${id}.json`), 'utf8')) as Record<string, string>;
const PAGES = ['', 'revenue/', 'reserves/', 'departments/', 'capital/', 'sources/', 'glossary/'];
const html = (p: string) => readFileSync(join(dist, 'us/ca/fremont', p, 'index.html'), 'utf8');
const text = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const receipts = (h: string) => [...h.matchAll(/data-receipt="([^"]*)"/g)].map((m) => JSON.parse(decode(m[1])) as { sources: string[]; page?: number; quote?: string; label?: string });
const published = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (['fremont', 'test'].includes(e.name) ? [] : published(join(dir, e.name))) : e.name.endsWith('.html') ? [join(dir, e.name)] : [],
  );

describe('Fremont (built)', () => {
  it('builds every page a reserves city gets, and no Gap or Ballot page', () => {
    for (const p of PAGES) expect(existsSync(join(dist, 'us/ca/fremont', p, 'index.html')), p).toBe(true);
    for (const p of ['gap/', 'ballot/']) expect(existsSync(join(dist, 'us/ca/fremont', p, 'index.html')), p).toBe(false);
  });

  it('is noindexed on every page, and linked from no published page', () => {
    for (const p of PAGES) expect(html(p), p).toMatch(/<meta name="robots" content="noindex"/);
    const pages = published(dist);
    expect(pages.length).toBeGreaterThan(5);
    for (const f of pages) expect(readFileSync(f, 'utf8'), f).not.toMatch(/fremont/i);
  });

  it('offers its data and no workbook', () => {
    const files = readdirSync(join(dist, 'us/ca/fremont/data')).sort();
    expect(files).toEqual(['budget.json', 'capital-plan.csv', 'general-fund-fy2027.csv', 'positions.csv', 'revenue.csv', 'source-usage.json', 'sources.csv']);
    expect(html('sources/')).not.toMatch(/workbook/i);
  });

  // (The city switcher lists Berkeley, so the city's name alone is not a leak.)
  it("carries none of Berkeley's deficit-plan copy", () => {
    for (const p of PAGES) {
      const t = text(html(p));
      for (const phrase of ['sales tax vote', 'Measure ', 'before cuts', 'asked to cut', 'gap the city must close', 'workbook']) expect(t, `${p}: "${phrase}"`).not.toContain(phrase);
    }
  });

  it('every figure cites a page of a Fremont document, and that page holds its quote', () => {
    const pages = { S1: excerpt('S1'), S2: excerpt('S2'), S3: excerpt('S3') } as Record<string, Record<string, string>>;
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
    let n = 0;
    for (const p of PAGES) {
      for (const r of receipts(html(p))) {
        expect(b.sources.map((s) => s.id), r.label).toContain(r.sources[0]);
        if (r.page === undefined) continue;
        n++;
        expect(norm(pages[r.sources[0]][String(r.page)] ?? ''), `${p} ${r.label}`).toContain(norm(r.quote!));
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it('receipts know each document’s page offset and archive copy', () => {
    const data = JSON.parse(decode(html('').match(/<script type="application\/json" id="receipt-data">([\s\S]*?)<\/script>/)![1]));
    expect(data.sources.S1.pageOffset).toBe(6);
    expect(data.sources.S1.format).toBe('PDF');
    expect(data.sources.S2.archive.url).toMatch(/^https:\/\/web\.archive\.org\/web\/\d{14}\/https:\/\/www\.fremont\.gov\//);
    expect(data.sources.S1.archive).toBeUndefined();
  });

  it('the sources list names printed pages', () => {
    const t = text(html('sources/'));
    expect(t).toMatch(/pp\. 27, 32, 34, 39, 65, 66, 67, 73, 87, 89, 120,/);
    expect(t).not.toMatch(/pp\. 33, 38/);
  });
});
