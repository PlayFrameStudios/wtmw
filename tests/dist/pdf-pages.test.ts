import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CityBudget } from '../../src/data/types';
import type { Receipt } from '../../src/lib/receipts';

// #30: a drawer opens a PDF at the quoted page, so every quote from a PDF must carry its page.
const root = join(import.meta.dirname, '../..');
const dist = join(root, 'dist');
// S-numbers are per city (Fremont's S8 is a web page, Berkeley's a PDF), so each page's receipts resolve against its own city's sources.
const pdfSources = (city: string): Set<string> => {
  const b: CityBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca', city, 'budget.json'), 'utf8'));
  return new Set(b.sources.filter((s) => s.format === 'PDF' || /\.pdf$/i.test(new URL(s.url).pathname)).map((s) => s.id));
};
const pages = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? pages(join(dir, e.name)) : e.name === 'index.html' ? [join(dir, e.name)] : []));
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const cityDirs = readdirSync(join(dist, 'us/ca'), { withFileTypes: true }).filter((e) => e.isDirectory());
const receipts: { r: Receipt; isPdf: (id: string) => boolean }[] = cityDirs.flatMap((d) => {
  const pdf = pdfSources(d.name);
  return pages(join(dist, 'us/ca', d.name)).flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/data-receipt="([^"]*)"/g)].map((m) => ({ r: JSON.parse(unescape(m[1])) as Receipt, isPdf: (id: string) => pdf.has(id) })),
  );
});

describe('every quote from a PDF carries its page (#30)', () => {
  it('there are PDF-backed quotes to check', () => {
    expect(receipts.filter(({ r, isPdf }) => r.quote && isPdf(r.sources[0])).length).toBeGreaterThan(30);
  });

  it('the primary cite', () => {
    const missing = receipts.filter(({ r, isPdf }) => r.quote && isPdf(r.sources[0]) && !r.page).map(({ r }) => `${r.sources[0]}: ${r.quote}`);
    expect(missing).toEqual([]);
  });

  it("each other cite's", () => {
    const missing = receipts.flatMap(({ r, isPdf }) => (r.also ?? []).filter((c) => c.quote && isPdf(c.source) && !c.page).map((c) => `${c.source}: ${c.quote}`));
    expect(missing).toEqual([]);
  });
});
