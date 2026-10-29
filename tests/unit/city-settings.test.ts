import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkCities } from '../../src/data/city-check';
import { pagesFor } from '../../src/lib/city-pages';
import { fy, parseReserves, parseSettings } from '../../src/lib/city-settings';

const root = join(import.meta.dirname, '../..');
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const berkeley = read('data/cities/us/ca/berkeley/city.json');
const fixture = read('data/fixtures/fixtureville/city.json');
const everything = () => true;
const nothing = () => false;
const settings = (over: Record<string, unknown>, exists: (name: string) => boolean = everything) => parseSettings('city.json', { ...berkeley, ...over }, exists);

describe('city settings (#42)', () => {
  it("reads Berkeley's: The Gap, ballot on, a two-year budget in its own year style", () => {
    const s = parseSettings('city.json', berkeley, everything);
    expect(s.fiscalPosition.variant).toBe('gap');
    expect(s.ballot).toBe(true);
    expect(s.featured).toBe(true);
    expect(s.budget).toMatchObject({ cadence: 'biennial', years: [2027, 2028] });
    expect(s.budget.years.map((y) => fy(s.budget.labels, y))).toEqual(['FY2027', 'FY2028']);
    expect(fy(s.budget.labels, 2027, 'short')).toBe('FY27');
    expect(fy(s.budget.labels, 2027, 'spoken')).toBe('fiscal year 2027');
  });

  it("writes Fremont's style when a city declares it: FY 2026/27", () => {
    const s = parseSettings('city.json', fixture, everything);
    expect(s.budget.cadence).toBe('annual');
    expect(fy(s.budget.labels, 2027)).toBe('FY 2026/27');
    expect(fy(s.budget.labels, 2027, 'short')).toBe('FY26/27');
    expect(fy(s.budget.labels, 2030, 'spoken')).toBe('fiscal year 2029/30');
  });

  it('needs a cited reason for the fiscal-position choice', () => {
    const fp = berkeley.fiscalPosition;
    expect(() => settings({ fiscalPosition: { variant: 'gap' } })).toThrow(/needs a "reason"/);
    expect(() => settings({ fiscalPosition: { ...fp, reason: { text: 'In deficit.', cites: [] } } })).toThrow(/cite at least one document/);
    expect(() => settings({ fiscalPosition: { ...fp, reason: { text: 'In deficit.', cites: [{ source: 'S20', page: 2 }] } } })).toThrow(/needs the "quote"/);
    expect(() => settings({ fiscalPosition: { ...fp, variant: 'surplus' } })).toThrow(/variant must be one of gap, reserves/);
  });

  it("fails a variant or a ballot switched on without the data that page needs", () => {
    expect(() => settings({}, nothing)).toThrow(/variant "gap" needs budget.json/);
    expect(() => settings({}, (f) => f !== 'ballot.json')).toThrow(/"ballot" is on, but there is no ballot.json/);
    expect(() => settings({ ballot: false }, (f) => f !== 'ballot.json')).not.toThrow();
    expect(() => parseSettings('city.json', fixture, (f) => f !== 'reserves.json')).toThrow(/variant "reserves" needs reserves.json/);
  });

  it('holds the cadence to its number of years, and the labels to naming the year', () => {
    const b = berkeley.budget;
    expect(() => settings({ budget: { ...b, cadence: 'annual' } })).toThrow(/annual budget covers 1 fiscal year, but budget.years lists 2/);
    expect(() => settings({ budget: { ...b, years: [2027, 2029] } })).toThrow(/consecutive/);
    expect(() => settings({ budget: { ...b, cadence: 'quarterly' } })).toThrow(/cadence must be/);
    expect(() => settings({ budget: { ...b, labels: { ...b.labels, short: 'FY' } } })).toThrow(/labels.short must name the year/);
  });

  it('requires the ballot switch to be set, either way', () => {
    const { ballot: _omit, ...rest } = berkeley;
    void _omit;
    expect(() => parseSettings('city.json', rest, everything)).toThrow(/"ballot" must be true or false/);
  });
});

describe('page sets (#42)', () => {
  const nav = (s: Parameters<typeof pagesFor>[0]) => pagesFor(s).filter((p) => p.nav).map((p) => p.label);

  it("gives Berkeley today's links after Overview, in today's order", () => {
    expect(nav(parseSettings('city.json', berkeley, everything))).toEqual(['Revenue', 'The Gap', 'Departments', 'Ballot', 'Capital', 'Sources']);
  });

  it('puts Balance & Reserves in The Gap’s slot, and drops Ballot when it is off', () => {
    expect(nav(parseSettings('city.json', fixture, everything))).toEqual(['Revenue', 'Balance & Reserves', 'Departments', 'Capital', 'Sources']);
  });

  it('never gives a city both fiscal-position pages', () => {
    for (const variant of ['gap', 'reserves'] as const) {
      const slugs = pagesFor({ fiscalPosition: { variant, reason: berkeley.fiscalPosition.reason }, ballot: true }).map((p) => p.slug);
      expect(slugs.filter((s) => s === 'gap' || s === 'reserves')).toEqual([variant]);
    }
  });
});

describe('reserves.json', () => {
  const amount = (quote: string) => ({ year: 2027, reserves: [{ key: 'a', name: 'A', purpose: 'For a rainy day.', amount: { source: 'S1', page: 7, quote } }] });

  it('reads each amount from its quote', () => {
    expect(parseReserves('r.json', amount('Operating Reserve (2025 AAO#1) $4,177,541')).reserves[0].value).toBe(4177541);
  });

  it('refuses a quote with no dollar figure, or more than one', () => {
    expect(() => parseReserves('r.json', amount('Operating Reserve'))).toThrow(/exactly one dollar figure \(or name the row's "figure" and "unit"\), and it has 0/);
    expect(() => parseReserves('r.json', amount('$1 and $2'))).toThrow(/and it has 2/);
  });
});

describe('the data check (npm run data:check)', () => {
  let tmp: string;
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  /** A copy of the repo's city data, with `edit` applied to the fixture's files. */
  function copy(edit: (dir: string) => void) {
    tmp = mkdtempSync(join(tmpdir(), 'wtmw-cities-'));
    cpSync(join(root, 'data/cities'), join(tmp, 'data/cities'), { recursive: true });
    cpSync(join(root, 'data/fixtures'), join(tmp, 'data/fixtures'), { recursive: true });
    edit(join(tmp, 'data/fixtures/fixtureville'));
    return tmp;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a JSON file edited in place
  type Json = any;
  const rewrite = (file: string, change: (json: Json) => void) => {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    change(json);
    writeFileSync(file, JSON.stringify(json));
  };

  it('passes the committed cities, and finds every one of them', async () => {
    const { cities, errors } = await checkCities(copy(() => {}));
    expect(errors).toEqual([]);
    expect(cities.map((c) => c.path)).toEqual(['/test/cities/fixtureville/', '/us/ca/berkeley/', '/us/ca/fremont/']);
  });

  it("fails a fiscal-position reason whose quote isn't on its page", async () => {
    const { errors } = await checkCities(
      copy((dir) => rewrite(join(dir, 'city.json'), (j: Json) => (j.fiscalPosition.reason.cites[0].quote = 'The City is in balance.'))),
    );
    expect(errors.join('\n')).toMatch(/fiscalPosition.reason.*"The City is in balance." is not on S1 page 9/);
  });

  it("fails a reserve amount whose quote isn't on its page", async () => {
    const { errors } = await checkCities(copy((dir) => rewrite(join(dir, 'reserves.json'), (j: Json) => (j.reserves[0].amount.quote = 'Operating Reserve $5,000,000'))));
    expect(errors.join('\n')).toMatch(/reserves.json.*"Operating Reserve \$5,000,000" is not on S1 page 7/);
  });

  it('fails a reserves city with no reserves.json', async () => {
    const { errors } = await checkCities(copy((dir) => rmSync(join(dir, 'reserves.json'))));
    expect(errors.join('\n')).toMatch(/variant "reserves" needs reserves.json/);
  });
});
