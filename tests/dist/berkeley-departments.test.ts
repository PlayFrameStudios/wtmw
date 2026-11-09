/**
 * #61: Berkeley's Departments page is the view Fremont's uses, with its figures labeled as the baseline before the
 * proposed cuts, and who's being asked to cut is a section of The Gap (#cuts), whose controls can't collide with
 * The Gap's own. Every link that meant "the cuts" now goes there.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GapBudget } from '../../src/data/types';

const root = join(import.meta.dirname, '../..');
const b: GapBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/budget.json'), 'utf8'));
const html = (p: string) => readFileSync(join(root, 'dist', p, 'index.html'), 'utf8');
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (h: string) =>
  decode(
    h
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' '),
  ).trim();
type Receipt = { kind: string; value?: string; label?: string; sources: string[] };
const receipts = (h: string) => [...h.matchAll(/data-receipt="([^"]*)"/g)].map((m) => JSON.parse(decode(m[1])) as Receipt);
const ids = (h: string) => [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dupes = (h: string) => ids(h).filter((id, i, all) => all.indexOf(id) !== i);
const money = (v: number) => `$${v.toLocaleString('en-US')}`;

const departments = html('us/ca/berkeley/departments/');
const gap = html('us/ca/berkeley/gap/');
const fy27 = b.generalFund.find((u) => u.year === 2027)!;

describe('Berkeley departments page (built)', () => {
  it('has the sections Fremont has: per $100, then staff positions', () => {
    const fremont = html('us/ca/fremont/departments/');
    const sections = (h: string) => [...h.matchAll(/<section class="db-section" aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    expect(sections(departments)).toEqual(sections(fremont));
    expect(sections(departments)).toEqual(['db-depts', 'db-staff']);
  });

  it('says before cuts: h1, lede and the staff note', () => {
    expect(text(departments.match(/<h1[^>]*>[\s\S]*?<\/h1>/)![0])).toBe('What each department starts with in FY2027, before cuts');
    expect(text(departments)).toContain("Before the proposed cuts, the City's FY2027 plan gives its departments $283.8M of General Fund money. Who's being asked to cut, and by how much →");
    expect(text(departments)).toContain('Full-time-equivalent positions in every fund, not just the General Fund: 1,559.54 in all.');
    expect(text(departments)).toContain('This is the FY2027 baseline, before the proposed reductions.');
    expect(departments).not.toMatch(/What each department gets/);
  });

  it('shows FY2027 only: one row per department line, each with its own receipt', () => {
    const rows = [...departments.matchAll(/<li class="db-row" id="([^"]+)"/g)].map((m) => m[1]);
    expect(rows.sort()).toEqual(fy27.lines.map((l) => l.id).sort());
    const figures = receipts(departments).filter((r) => r.kind === 'figure');
    for (const l of fy27.lines) {
      const r = figures.find((x) => x.value === money(l.amount) && x.label!.includes(`FY2027: ${fy27.basis}`));
      expect(r, l.id).toBeDefined();
      expect(r!.sources).toEqual([l.source]);
    }
    // The department lines are FY2027's only. "What staff cost" (#65) shows FY2024–FY2028 on purpose, as its own
    // section after Staff positions, so the check stops where it begins.
    const lines = departments.slice(0, departments.indexOf('id="staff-costs"'));
    expect(departments.indexOf('id="staff-costs"')).toBeGreaterThan(0);
    expect(lines).not.toMatch(/FY2028/);
  });

  it("the total and the staff count are the budget's, with receipts", () => {
    const figures = receipts(departments).filter((r) => r.kind === 'figure');
    expect(figures.some((r) => r.value === money(fy27.total.amount) && r.label === `${fy27.basis}, FY2027 (${fy27.note})`)).toBe(true);
    expect(figures.some((r) => r.value === '1,559.54' && /^Staff positions \(FTE\), FY2027 baseline, all funds$/.test(r.label!))).toBe(true);
  });

  it('links to the cuts on The Gap, from the lede and the staff note', () => {
    expect([...departments.matchAll(/<a href="\/us\/ca\/berkeley\/gap\/#cuts"/g)]).toHaveLength(2);
  });

  it('has no duplicate ids', () => {
    expect(dupes(departments)).toEqual([]);
  });
});

describe('The Gap, with the cuts (built)', () => {
  it('ends with the cuts section, whose heading was the old Departments h1', () => {
    const at = gap.indexOf('id="cuts"');
    expect(at).toBeGreaterThan(gap.indexOf('class="closing"'));
    expect(text(gap.match(/<h2 id="cuts-title"[^>]*>[\s\S]*?<\/h2>/)![0])).toBe("Who's being asked to cut in FY2027FY2028, and by how much");
  });

  it('has no duplicate ids, and its year switch and the cuts controls are separate radio groups', () => {
    expect(dupes(gap)).toEqual([]);
    const groups = (h: string) => [...h.matchAll(/type="radio"[^>]*name="([^"]+)"[^>]*id="([^"]+)"/g)].map((m) => [m[1], m[2]]);
    expect(groups(gap)).toEqual([
      ['year', 'year-fy2027'],
      ['year', 'year-fy2028'],
      ['cuts-year', 'cuts-year-fy2027'],
      ['cuts-year', 'cuts-year-fy2028'],
      ['cuts-tax', 'cuts-tax-passes'],
      ['cuts-tax', 'cuts-tax-fails'],
      ['cuts-sort', 'cuts-sort-budget'],
      ['cuts-sort', 'cuts-sort-cut'],
    ]);
  });

  it("The Gap's waterfall rules answer only to its own switch, and the cuts' rules only to theirs", () => {
    const css = [...gap.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    const rules = (re: RegExp) => [...css.matchAll(re)].map((m) => m[0]);
    for (const r of rules(/[^{}]*\.waterfall[^{}]*\{/g)) expect(r).not.toMatch(/#cuts-/);
    for (const r of rules(/[^{}]*\.dept-page[^{}]*:has\([^{}]*\{/g)) expect(r).not.toMatch(/#(year|tax|sort)-/);
    expect(rules(/\.dept-page:has\(#cuts-year-fy2028:checked\) \.yr:not\(\.yr--fy2028\)/g)).toHaveLength(1);
  });

  it("describes both: the gap, and who's being asked to cut", () => {
    expect(decode(gap)).toMatch(/<meta name="description" content="[^"]*how it plans to close it, and who's being asked to cut\.">/);
  });
});

describe('links that meant the cuts (built)', () => {
  it('the home card and the ballot page go to The Gap #cuts', () => {
    const home = html('');
    const card = home.slice(home.indexOf("Who&#39;s cutting what?"), home.indexOf('</li>', home.indexOf("Who&#39;s cutting what?")));
    expect(card).toMatch(/href="\/us\/ca\/berkeley\/gap\/#cuts"/);
    expect(text(card)).toContain('The Gap');
    expect(html('us/ca/berkeley/ballot/')).toMatch(/<a class="dc-all"[^>]*href="\/us\/ca\/berkeley\/gap\/#cuts"/);
  });

  it("the overview's Department details still goes to the Departments page, whose rows carry the same ids", () => {
    const overview = html('us/ca/berkeley/');
    const links = [...overview.matchAll(/href="\/us\/ca\/berkeley\/departments\/#([a-z-]+)"/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const id of links) expect(departments, id).toContain(`<li class="db-row" id="${id}"`);
  });
});
