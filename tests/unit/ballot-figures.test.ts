import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ballotFileFor, ballotPage, ballotState, checkBallotFile, type BallotFile } from '../../src/lib/ballot';
import { gapPlan } from '../../src/data/types';
import { budgetFor } from '../../src/lib/budget';
import { cities } from '../../src/lib/cities';
import { shortNames } from '../../src/lib/departments';

const city = cities[0];
const budget = gapPlan(budgetFor(city)!, 'test');
const file = ballotFileFor(city.path);
const p = ballotPage(budget, file, shortNames(city.path, budget));
const [passes, fails] = p.scenarios;
const withStatus = (status: 'pending' | 'passed' | 'failed'): BallotFile => ({ ...file, measures: { ...file.measures, salesTax: { ...file.measures.salesTax, status, yesShare: null } } });

describe('ballot page figures', () => {
  it('passes 105 positions (85 vacant, 20 filled), FTE 1,455; fails 138 (100 / 38), FTE 1,422', () => {
    expect(passes.outcome).toBe('passes');
    expect(passes.positions).toMatchObject({ total: 105, vacant: 85, filled: 20 });
    expect(Math.round(passes.workforce.after)).toBe(1455);
    expect(fails.positions).toMatchObject({ total: 138, vacant: 100, filled: 38 });
    expect(Math.round(fails.workforce.after)).toBe(1422);
    expect(Math.round(passes.workforce.before)).toBe(1609);
  });

  it('department cuts: $19.8M (7.0%) if it passes, $29.3M (10.3%) if it fails', () => {
    expect((passes.cuts.value / 1e6).toFixed(1)).toBe('19.8');
    expect((passes.cuts.pct * 100).toFixed(1)).toBe('7.0');
    expect((fails.cuts.value / 1e6).toFixed(1)).toBe('29.3');
    expect((fails.cuts.pct * 100).toFixed(1)).toBe('10.3');
  });

  it('Measure V: 0.5%, $9-10M/yr (City Attorney and Council agree), to 10.75%, simple majority, from April 1, 2027 until ended by voters', () => {
    expect(p.salesTax.fact).toMatchObject({ rate: 0.005, newRate: 0.1075, threshold: 'simple majority' });
    expect(p.salesTax.letter).toBe('V');
    expect(p.salesTax.revenue).toMatchObject({ low: 9_000_000, high: 10_000_000 });
    expect(p.salesTax.revenue.cites.map((c) => `${c.source} p.${c.page}`)).toEqual(['S21 p.3', 'S22 p.1']);
    expect(p.salesTax.term).toMatchObject({ start: '2027-04-01', until: 'until ended by the voters' });
    expect(p.salesTax.general.quote).toMatch(/general tax/);
  });

  it('Measure U: $300M, 2/3, ~$22.14 per $100k over 40 years (~$15.2M/yr), peak ~$35 from 2040-41, audited every 3 years; need $2.12B', () => {
    expect(p.bond.fact).toMatchObject({ amount: 300_000_000, threshold: '2/3', repaidBy: 'property tax' });
    expect(p.bond.letter).toBe('U');
    expect(p.bond.cost).toMatchObject({ perHundredK: 22.14, years: 40, perYear: 15_200_000 });
    expect(p.bond.peak).toMatchObject({ perHundredK: 35, from: '2040-41' });
    expect(p.bond.audit.everyYears).toBe(3);
    expect(p.bond.need.value).toBe(2_115_819_772);
    expect(p.bond.backlog.ref).toMatchObject({ low: 1_650_000_000, high: 2_000_000_000 });
  });

  it("official titles come from the City's ballot measures page, and each card links the measure's own full text", () => {
    expect(p.salesTax.official).toMatchObject({ title: 'Transactions and Use (Sales) General Tax Measure', cite: { source: 'S25' } });
    expect(p.bond.official).toMatchObject({ title: 'General Obligation Bond Measure for Public Infrastructure and Facilities', cite: { source: 'S25' } });
    expect(p.salesTax.read.map((r) => r.source)).toEqual(['S27', 'S21', 'S25']);
    expect(p.bond.read.map((r) => r.source)).toEqual(['S26', 'S21', 'S25']);
    expect(budget.sources.find((s) => s.id === 'S27')!.title).toMatch(/Measure V/);
    expect(budget.sources.find((s) => s.id === 'S26')!.title).toMatch(/Measure U/);
  });

  it('scenario rows quote the adoption report: Fire Station 4 (p.55) and 21 police positions (p.96)', () => {
    const row = (s: typeof passes, k: string) => s.rows.find((r) => r.key === k)!;
    expect(row(passes, 'fire-station')).toMatchObject({ label: 'Fire Station 4', text: 'Tax revenue proposed to keep it open', cite: { source: 'S20', page: 55 } });
    expect(row(fails, 'fire-station')).toMatchObject({ label: 'Fire Station 4', text: 'Closure reconsidered for FY2028', cite: { source: 'S20', page: 55 } });
    expect(row(passes, 'police')).toMatchObject({ label: '21 police positions', cite: { source: 'S20', page: 96 } });
    expect(row(fails, 'police')).toMatchObject({ label: '21 police positions', cite: { source: 'S20', page: 96 } });
    // Said once for both outcomes (#31), from the same file.
    expect(p.countsCaveat).toBe(file.countsCaveat);
    expect(p.adoption).toMatchObject({ date: '2026-06-23', cite: { source: 'S20', page: 1 } });
  });

  it('both outcomes are built the same way: same fields, same pictogram scale', () => {
    const shape = (o: unknown): unknown =>
      Array.isArray(o) ? 'array' : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'ref' ? 'ref' : shape(v)])) : typeof o;
    expect(shape(passes)).toEqual(shape(fails));
    expect(p.pictogramSlots).toBe(40);
  });

  it('the footnote names the departments the bridge softens, biggest first', () => {
    expect(p.softened).toEqual(['Police', 'Fire', 'Parks, Rec & Waterfront']);
  });

  it('results are a data change: pending, passed and failed', () => {
    expect(ballotState(withStatus('pending')).lede).toMatch(/^The election is November 3, 2026\. /);
    expect(ballotState(withStatus('pending'))).toMatchObject({ decided: false, result: null, heading: 'What changes if the sales tax passes or fails' });
    expect(ballotState(withStatus('passed')).heading).toMatch(/^The sales tax passed\./);
    expect(ballotState(withStatus('pending'), 'Measure V').heading).toBe('What changes if Measure V passes or fails');
    expect(ballotState(withStatus('passed'), 'Measure V')).toMatchObject({ decided: true, result: 'passes', heading: expect.stringMatching(/^Measure V passed\./) });
    expect(ballotState(withStatus('failed'), 'Measure V')).toMatchObject({ decided: true, result: 'fails', heading: expect.stringMatching(/^Measure V failed\./) });
    expect(ballotPage(budget, withStatus('passed')).state.heading).toMatch(/^Measure V passed\./);
  });

  it('rejects a ballot.json it cannot render honestly', () => {
    expect(() => checkBallotFile({ ...file, measures: { ...file.measures, salesTax: { ...file.measures.salesTax, status: 'won' as never } } }, budget)).toThrow(/status/);
    // Both measures link the same kinds of City document, in the same order.
    const withRead = (read: BallotFile['measures']['bond']['read']): BallotFile => ({ ...file, measures: { ...file.measures, bond: { ...file.measures.bond, read } } });
    expect(() => checkBallotFile(withRead(file.measures.bond.read.slice(0, 2)), budget)).toThrow(/the sales tax links Full text, Impartial analysis, All City measures but the bond links Full text, Impartial analysis$/);
    expect(() => checkBallotFile(withRead([...file.measures.bond.read.slice(0, 2), { label: 'All City measures', source: 'S16' }]), budget)).toThrow(/S16, which isn't a City document/);
    expect(() => checkBallotFile(withRead([...file.measures.bond.read.slice(0, 2), { label: 'All City measures', source: 'S99' as never }]), budget)).toThrow(/unknown source S99/);
    const withRow = (fails: Partial<BallotFile['rows'][number]['fails']>): BallotFile => ({ ...file, rows: [{ ...file.rows[0], fails: { ...file.rows[0].fails, ...fails } }, ...file.rows.slice(1)] });
    expect(() => checkBallotFile(withRow({ cite: { ...file.rows[0].fails.cite, source: 'S99' as never } }), budget)).toThrow(/S99/);
    expect(() => checkBallotFile(withRow({ also: ['S99' as never] }), budget)).toThrow(/S99/);
    // Neutral by construction: one outcome can't cite more (or other) documents than the other.
    expect(() => checkBallotFile(withRow({ also: ['S15', 'S16'] }), budget)).toThrow(/cites S20,S16 if it passes but S20,S15,S16 if it fails/);
    expect(() => checkBallotFile(withRow({ text: '' }), budget)).toThrow(/needs text/);
    expect(() => checkBallotFile({ ...file, countsCaveat: { ...file.countsCaveat, cites: [] } }, budget)).toThrow(/countsCaveat/);
  });

  it('has no figure typed into the page, and no advocacy', () => {
    const src = readFileSync(join(import.meta.dirname, '../../src/pages/[country]/[state]/[city]/ballot.astro'), 'utf8');
    for (const lit of ['105', '138', '1,455', '1,422', '19.8', '29.3', '10.75', '300M', '9.4', '1.65', '2.12', '22.14', '15.2', '2040', 'April 1', 'Measure V', 'Measure U', 'Police', 'Station 4', '21 ']) expect(src, lit).not.toContain(lit);
    const words = /vote (yes|no)|\bsupport\b|\boppose\b|devastat|catastroph|disastr|crucial|vital|must pass|reckless|\bsave\b/i;
    expect(src.replace(/<style>[\s\S]*<\/style>/, '')).not.toMatch(words);
    const said = [...file.rows.flatMap((r) => [r.label, r.passes.text, r.fails.text]), file.countsCaveat.text].join(' ');
    expect(said).not.toMatch(words);
    // The fails line says only what the document says: no "would close", no "eliminated" the report doesn't state.
    expect(said).not.toMatch(/would close|will close|eliminated/i);
  });
});
