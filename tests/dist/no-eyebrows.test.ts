import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unwrapFigures } from './figures';

// #32: no small capitalized line above a heading, on any page; the facts they carried are said in words.
const dist = join(import.meta.dirname, '../../dist');
const pages = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? pages(join(dir, e.name)) : e.name === 'index.html' ? [join(dir, e.name)] : []));
const read = (path: string) => readFileSync(join(dist, path, 'index.html'), 'utf8');
const text = (path: string) =>
  unwrapFigures(read(path).replace(/<(script|style)[\s\S]*?<\/\1>/g, ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const EYEBROW = /<(\w+) class="(?:[^"]* )?(?:eyebrow|kicker)[ "][^>]*>([\s\S]*?)<\/\1>/g;
// The homepage keeps these for now, case by case (Jeremy on #28); "Free · Independent · Every number sourced" is gone.
// The hero's sample card, once per city behind tabs (#49): its city line and "Source receipt".
const HOMEPAGE_KEEPS = [
  ...['Berkeley, CA · FY2027', 'Fremont, CA · FY 2026/27'].flatMap((city) => [city, 'Source receipt']),
  'How it works',
  'Built for the questions people actually ask',
  'Cities',
];

describe('no eyebrows (#32)', () => {
  it('no element on any page but the homepage has class eyebrow or kicker', () => {
    const all = pages(dist).filter((f) => f !== join(dist, 'index.html'));
    expect(all.length).toBeGreaterThan(8);
    const hits = all.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/class="(?:[^"]* )?(eyebrow|kicker)[ "]/g)].map((m) => `${f.slice(dist.length)}: ${m[1]}`));
    expect(hits).toEqual([]);
  });

  it('the homepage has exactly the eyebrows it keeps, and none in the source drawer', () => {
    const h = read('/');
    const kept = [...h.matchAll(EYEBROW)].map((m) => m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim());
    expect(kept).toEqual(HOMEPAGE_KEEPS);
    expect([...h.matchAll(/<dialog[\s\S]*?<\/dialog>/g)].join('')).not.toMatch(/class="(?:[^"]* )?(eyebrow|kicker)[ "]/);
  });

  // Each fact an eyebrow carried, now in a heading or a first sentence.
  const B = '/us/ca/berkeley/';
  const facts: [string, RegExp][] = [
    [B, /<p class="sizes">\s*Berkeley's whole budget for fiscal year 2027 is/],
    [`${B}gap/`, /<h1>The \$29 million gap in FY2027, step by step<\/h1>/],
    [`${B}gap/`, /<h2>The city plans to close it with ongoing cuts, one-time money and, if voters approve it, new sales-tax revenue\.<\/h2>/],
    [`${B}revenue/`, /in General Fund revenue for FY2026/],
    [`${B}capital/`, /This page covers the program's FY2027-28 plan\./],
    [`${B}departments/`, /<h1>Who's being asked to cut in <span class="yr yr--fy2027"[^>]*>FY2027<\/span><span class="yr yr--fy2028"[^>]*>FY2028<\/span>, and by how much<\/h1>/],
    [`${B}departments/`, /Every department was asked to find savings in the proposed budget\./],
    [`${B}ballot/`, /<p class="lede"[^>]*>The election is November 3, 2026\./],
    [`${B}ballot/`, /It needs a simple majority to pass\./],
    [`${B}ballot/`, /It needs a two-thirds vote to pass\./],
  ];
  for (const [path, re] of facts) {
    it(`${path} still says ${re.source.replace(/\\/g, '').slice(0, 60)}`, () => {
      expect(read(path).replace(/ data-astro-cid-\w+/g, '').replace(/&#39;/g, "'")).toMatch(re);
    });
  }

  it('the source drawer is named by the document it shows', () => {
    const h = read(B);
    expect(h).toMatch(/<dialog class="receipt" aria-labelledby="receipt-heading"/);
    expect(text(B)).not.toMatch(/Source receipt/);
  });
});
