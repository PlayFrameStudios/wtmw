import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GapBudget } from '../../src/data/types';
import type { Receipt } from '../../src/lib/receipts';

// #30: a drawer opens a PDF at the quoted page, so every quote from a PDF must carry its page.
const root = join(import.meta.dirname, '../..');
const dist = join(root, 'dist');
const b: GapBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/budget.json'), 'utf8'));
const isPdf = new Map(b.sources.map((s) => [s.id, /\.pdf$/i.test(new URL(s.url).pathname)]));
const pages = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? pages(join(dir, e.name)) : e.name === 'index.html' ? [join(dir, e.name)] : []));
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const receipts: Receipt[] = pages(join(dist, 'us')).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/data-receipt="([^"]*)"/g)].map((m) => JSON.parse(unescape(m[1]))));

describe('every quote from a PDF carries its page (#30)', () => {
  it('there are PDF-backed quotes to check', () => {
    expect(receipts.filter((r) => r.quote && isPdf.get(r.sources[0])).length).toBeGreaterThan(30);
  });

  it('the primary cite', () => {
    const missing = receipts.filter((r) => r.quote && isPdf.get(r.sources[0]) && !r.page).map((r) => `${r.sources[0]}: ${r.quote}`);
    expect(missing).toEqual([]);
  });

  it("each other cite's", () => {
    const missing = receipts.flatMap((r) => (r.also ?? []).filter((c) => c.quote && isPdf.get(c.source) && !c.page).map((c) => `${c.source}: ${c.quote}`));
    expect(missing).toEqual([]);
  });
});
