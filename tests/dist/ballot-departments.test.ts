/**
 * The Ballot page's passes/fails switch (#36) shows the Departments page's
 * figures: for every department and both outcomes, the same receipt (label and
 * value) and the same displayed amount. Which departments differ, and their
 * order, is worked out here from budget.json, not from the page code.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GapBudget } from '../../src/data/types';
import { shortMoney } from '../../src/lib/format';

const root = join(import.meta.dirname, '../..');
const b: GapBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/budget.json'), 'utf8'));
const page = (p: string) => readFileSync(join(root, 'dist/us/ca/berkeley', p, 'index.html'), 'utf8');
const ballot = page('ballot');
const departments = page('departments');
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const receipts = (html: string) =>
  [...html.matchAll(/data-receipt="([^"]*)"[^>]*>([\s\S]*?)<\/button/g)].map((m) => ({ ...(JSON.parse(unescape(m[1])) as { label?: string; value?: string }), shown: m[2].replace(/<[^>]+>/g, '').trim() }));
const deptReceipts = receipts(departments);
const fy27 = b.departmentReductions.find((t) => t.year === 2027)!.departments.filter((d) => d.id !== 'it-cost-allocation-plan');

const section = ballot.slice(ballot.indexOf('class="dc-section"'), ballot.indexOf('</section>', ballot.indexOf('class="dc-section"')));
const rows = [...section.matchAll(/<li class="dc-row"[^>]*data-dept="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => ({ id: m[1], html: m[2] }));
const sameList = section.slice(section.indexOf('class="dc-same"'));
const same = [...sameList.matchAll(/<li[^>]*data-dept="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => ({ id: m[1], html: m[2] }));

describe("Ballot: each department's cut, passes or fails (#36)", () => {
  it('lists the departments with bridge money, biggest difference first, and collapses the rest', () => {
    const differs = fy27.filter((d) => d.salesTaxAllocation !== 0).sort((a, c) => c.salesTaxAllocation - a.salesTaxAllocation);
    expect(differs.map((d) => d.id)).toEqual(['police', 'fire', 'prw']);
    expect(rows.map((r) => r.id)).toEqual(differs.map((d) => d.id));
    expect(same.map((s) => s.id).sort()).toEqual(fy27.filter((d) => d.salesTaxAllocation === 0).map((d) => d.id).sort());
    expect(sameList).toContain(`${same.length} departments: same cut either way`);
  });

  it('every figure in the switch is the Departments page receipt, with the same label, value and displayed amount', () => {
    const mine = receipts(section);
    const twins = mine.filter((r) => !/passes or fails/.test(r.label!));
    expect(twins).toHaveLength(rows.length * 2);
    for (const r of twins) {
      const d = deptReceipts.find((x) => x.label === r.label);
      expect(d, r.label).toBeDefined();
      expect(r.value, r.label).toBe(d!.value);
      // The Departments page's button also carries the percentage: "$5.2M (4.9%)".
      expect(d!.shown.split(' ')[0], r.label).toBe(r.shown);
    }
  });

  it("each row's figures are the City's numbers: the net cut if it passes, the full cut if it fails", () => {
    for (const { id, html } of rows) {
      const d = fy27.find((x) => x.id === id)!;
      const out = (o: string) => receipts(html.slice(html.indexOf(`dc-out--${o}`)))[0];
      expect(out('passes').shown).toBe(shortMoney(d.netReduction));
      expect(out('fails').shown).toBe(shortMoney(d.reduction));
      expect(html.replace(/<[^>]+>/g, '')).toContain(`${shortMoney(d.reduction)} proposed, softened by ${shortMoney(d.salesTaxAllocation)} of one-time bridge money`);
    }
  });

  it('a department cut the same either way shows the amount both Departments page outcomes show', () => {
    for (const { id, html } of same) {
      const d = fy27.find((x) => x.id === id)!;
      if (d.reduction === 0) {
        expect(html).toContain('no cut');
        continue;
      }
      const [r] = receipts(html);
      expect(r.label).toMatch(/if the sales tax passes or fails \(the same either way\)$/);
      for (const o of ['passes', 'fails']) {
        const twin = deptReceipts.find((x) => x.label!.startsWith(`${d.name}, FY2027: net cut if the sales tax ${o}`));
        expect(twin, `${d.name} ${o}`).toBeDefined();
        expect(r.value).toBe(twin!.value);
      }
    }
  });

  it('links to all departments', () => {
    expect(section).toMatch(/<a class="dc-all"[^>]*href="\/us\/ca\/berkeley\/departments\/"/);
  });
});
