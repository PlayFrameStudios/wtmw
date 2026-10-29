import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CityBudget } from '../../src/data/types';
import { buildUsage, fillPlaceholders } from '../../src/integrations/source-usage';
import { sourceList } from '../../src/lib/receipt-target';
import { budgetFor } from '../../src/lib/budget';
import { cities } from '../../src/lib/cities';
import { figureReceipt, formatValue, longDate, sourceReceipt, sourcesById, type Figure } from '../../src/lib/receipts';

const city = cities[0];
const budget = budgetFor(city)!;
const page = new URL('https://wherethemoneywent.com/us/ca/berkeley/gap/');
const step = (key: string) => budget.deficitBridge.steps.find((s) => s.key === key)!;
const gap = step('final-gap');

describe('formatting', () => {
  it('shows full precision with a real minus sign', () => {
    expect(formatValue(-29_249_339)).toBe('−$29,249,339');
    expect(formatValue(106_198_574)).toBe('$106,198,574');
    expect(formatValue(1454.54, 'number')).toBe('1,454.54');
    expect(formatValue(0.0993, 'percent')).toBe('9.93%');
  });

  it('writes dates out in full, keeping month-only dates month-only', () => {
    expect(longDate('2026-04-16')).toBe('April 16, 2026');
    expect(longDate('2022-05')).toBe('May 2022');
  });
});

describe('sources', () => {
  const views = sourcesById(budget);

  it('describes a document for the drawer', () => {
    expect(views.get('S1')).toMatchObject({
      title: 'FY27-FY28 Budget Balancing Plan',
      badge: 'Primary source',
      committee: 'Budget & Finance Committee',
      date: 'April 16, 2026',
      format: 'PDF',
      host: 'berkeleyca.gov',
    });
  });

  it('labels news as reporting', () => {
    expect(views.get('S15')).toMatchObject({ type: 'news', badge: 'Reporting', publisher: 'Berkeleyside', format: 'Web page' });
  });
});

describe('figure receipts', () => {
  const figure: Figure = {
    value: gap.years[2027],
    label: 'FY2027 General Fund gap, after adjustments',
    ref: gap,
    related: ['S15'],
    parts: [
      { label: 'Initial estimate', value: -32_256_300 },
      { label: 'Revenue projections', value: 5_111_718 },
      { label: 'Three adjustments', value: -1_630_454 - 1_050_938 - 1_523_365 },
      { label: 'One-time money', value: 2_100_000 },
    ],
  };
  const r = figureReceipt(budget, city, figure, page);

  it('carries the exact figure, its table and row, and a link to that table as CSV', () => {
    expect(r).toMatchObject({
      value: '−$29,249,339',
      tone: 'short',
      table: 'Deficit Bridge FY27-28',
      row: 13,
      csv: '/us/ca/berkeley/data/deficit-bridge.csv',
      sources: ['S1', 'S15'],
    });
  });

  it('shows how a derived number is built', () => {
    // One sign per line, the amount without one, and the figure as the total (#25).
    expect(r.parts).toEqual([
      { sign: '−', label: 'Initial estimate', value: '$32,256,300' },
      { sign: '+', label: 'Revenue projections', value: '$5,111,718' },
      { sign: '−', label: 'Three adjustments', value: '$4,204,757' },
      { sign: '+', label: 'One-time money', value: '$2,100,000' },
    ]);
    expect(r.total).toBe('−$29,249,339');
    for (const p of r.parts!) expect(`${p.label}${p.value}`).not.toMatch(/[−+]|\bless\b/);
  });

  it('refuses parts that do not add up to the figure', () => {
    const short = figure.parts!.slice(1); // drop the initial estimate
    const sum = short.reduce((a, p) => a + p.value, 0);
    expect(() => figureReceipt(budget, city, { ...figure, parts: short }, page)).toThrow(
      `parts sum to ${sum}, not -29249339`,
    );
  });

  it('refuses a source that is not in the data', () => {
    expect(() => figureReceipt(budget, city, { ...figure, related: ['S99'] }, page)).toThrow(/unknown source S99/);
  });

  it('lists every source of a figure that combines several', () => {
    const fy2021 = budget.personnelAndPension.unfundedLiabilities.find((l) => l.asOf === 'FY2021')!;
    const combined = figureReceipt(budget, city, { value: fy2021.amount, label: 'Unfunded liabilities, FY2021', ref: fy2021 }, page);
    expect(combined.sources).toEqual(['S17', 'S8']);
    expect(combined.citation).toContain('Also: City of Berkeley. "Financial Condition FY2012–FY2021 (Auditor)."');
  });

  it('builds a full citation with the document URL and the page URL', () => {
    expect(r.citation.split('\n')).toEqual([
      'FY2027 General Fund gap, after adjustments: −$29,249,339.',
      `Source: City of Berkeley, Budget & Finance Committee. "FY27-FY28 Budget Balancing Plan." April 16, 2026. ${budget.sources[0].url} (Deficit Bridge FY27-28, row 13).`,
      `Also: Berkeleyside. "$30M deficit: layoffs, service cuts, sales tax." April 15, 2026. ${budget.sources[14].url}.`,
      'Via Where the Money Went, https://wherethemoneywent.com/us/ca/berkeley/gap/',
    ]);
  });

  it('gives a whole-document receipt for a deep link', () => {
    expect(sourceReceipt(budget, 'S2', page)).toMatchObject({ kind: 'source', sources: ['S2'] });
  });

  // #29: one trigger per statement, so a statement resting on several cites carries them all.
  it('keeps every other cite of a statement, with its page and sentence', () => {
    const r = sourceReceipt(budget, 'S1', page, { page: 7, quote: 'A' }, [
      { source: 'S1', page: 9, quote: 'B' },
      { source: 'S20', page: 55 },
      { source: 'S1', page: 7, quote: 'A' }, // the primary again: dropped
    ]);
    expect(r.sources).toEqual(['S1', 'S20']);
    expect(r.also).toEqual([
      { source: 'S1', page: 9, quote: 'B' },
      { source: 'S20', page: 55 },
    ]);
    expect(r.citation).toMatch(/\(p\. 7\)\.\n"A"\nAlso: .*\(p\. 9\)\.\n"B"\nAlso: .*\(p\. 55\)\./);
    expect(() => sourceReceipt(budget, 'S1', page, {}, [{ source: 'S99' as never }])).toThrow(/unknown source S99/);
    expect(sourceReceipt(budget, 'S1', page)).not.toHaveProperty('also');
  });

  it('lists document names the way a sentence would', () => {
    expect(sourceList(['A'])).toBe('A');
    expect(sourceList(['A', 'B'])).toBe('A and B');
    expect(sourceList(['A', 'B', 'C'])).toBe('A, B and C');
  });
});

describe('"Used on" index', () => {
  it('records the pages each source\'s chips actually appear on', () => {
    const dist = mkdtempSync(join(tmpdir(), 'wtmw-dist-'));
    const write = (path: string, body: string) => {
      mkdirSync(join(dist, path, '..'), { recursive: true });
      writeFileSync(join(dist, path), body);
    };
    const sources = (budget as CityBudget).sources.map((s) => ({ id: s.id }));
    write('us/ca/berkeley/data/budget.json', JSON.stringify({ sources }));
    write('us/ca/berkeley/index.html', '<button data-source-chip="S1">S1</button>');
    // A trigger naming several sources counts for each of them (#29).
    write('us/ca/berkeley/gap/index.html', '<button data-source-chip="S1"></button><button data-source-chip="S1 S15"></button>');
    write('us/ca/berkeley/sources/index.html', 'no chips here');
    write('test/receipts/index.html', '<button data-source-chip="S2"></button>'); // outside the city: ignored

    buildUsage(dist);
    const usage = JSON.parse(readFileSync(join(dist, 'us/ca/berkeley/data/source-usage.json'), 'utf8'));
    expect(usage.S1).toEqual([
      { path: '/us/ca/berkeley/', label: 'Overview' },
      { path: '/us/ca/berkeley/gap/', label: 'The Gap' },
    ]);
    expect(usage.S15).toEqual([{ path: '/us/ca/berkeley/gap/', label: 'The Gap' }]);
    expect(usage.S2).toEqual([]);
    expect(Object.keys(usage)).toHaveLength(27);
  });

  it('labels chips on the Sources page as Methods, and fills "used on" placeholders', () => {
    const dist = mkdtempSync(join(tmpdir(), 'wtmw-dist-'));
    const write = (path: string, body: string) => {
      mkdirSync(join(dist, path, '..'), { recursive: true });
      writeFileSync(join(dist, path), body);
    };
    write('us/ca/berkeley/data/budget.json', JSON.stringify({ sources: [{ id: 'S1' }, { id: 'S2' }] }));
    write('us/ca/berkeley/gap/index.html', '<button data-source-chip="S1"></button>');
    write('us/ca/berkeley/sources/index.html', '<button data-source-chip="S1"></button><span data-used-on="S1" class="x"></span>|<span data-used-on="S2"></span>');
    buildUsage(dist);
    const page = readFileSync(join(dist, 'us/ca/berkeley/sources/index.html'), 'utf8');
    expect(page).toContain(
      '<span data-used-on="S1" class="x"><a href="/us/ca/berkeley/gap/">The Gap</a><span aria-hidden="true"> · </span><a href="/us/ca/berkeley/sources/">Methods</a></span>',
    );
    expect(page).toContain('<span data-used-on="S2"><span class="unused">Not cited on a page yet</span></span>');
  });

  it('refuses a placeholder for a source that does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtmw-ph-'));
    writeFileSync(join(dir, 'p.html'), '<span data-used-on="S9"></span>');
    expect(() => fillPlaceholders(join(dir, 'p.html'), { S1: [] })).toThrow('placeholder for S9');
  });
});
