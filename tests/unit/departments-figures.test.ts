import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gapPlan } from '../../src/data/types';
import { budgetFor } from '../../src/lib/budget';
import { cities } from '../../src/lib/cities';
import { fy } from '../../src/lib/city-settings';
import { departmentsPage, fullNames, shortNames } from '../../src/lib/departments';
import { familiesFor } from '../../src/lib/families';
import { figureReceipt } from '../../src/lib/receipts';

const city = cities[0];
const budget = gapPlan(budgetFor(city)!, 'test');
const p = departmentsPage(budget, familiesFor(city, budget), shortNames(city.path, budget), city.budget.years, (y) => fy(city.budget.labels, y));
const police = p.rows.find((r) => r.id === 'police')!;
const page = new URL('https://wherethemoneywent.com/us/ca/berkeley/departments/');

describe('departments page figures', () => {
  it('FY27 Police, tax passes: $106.2M baseline, $10.6M cut (10.0%), +$5.3M softened, $5.2M net (4.9%)', () => {
    const v = police.years.fy2027;
    expect((v.d.baseline / 1e6).toFixed(1)).toBe('106.2');
    expect([(v.d.reduction / 1e6).toFixed(1), (v.d.reductionPct * 100).toFixed(1)]).toEqual(['10.6', '10.0']);
    expect((v.d.salesTaxAllocation / 1e6).toFixed(1)).toBe('5.3');
    expect([(v.netIf.passes.value / 1e6).toFixed(1), (v.netIf.passes.pct * 100).toFixed(1)]).toEqual(['5.2', '4.9']);
  });

  it('with the tax failing, the net cut is the full cut: $10.6M', () => {
    expect(police.years.fy2027.netIf.fails.value).toBe(police.years.fy2027.d.reduction);
    expect((police.years.fy2027.netIf.fails.value / 1e6).toFixed(1)).toBe('10.6');
  });

  it('the net-if-passes receipt shows how it is built, and the parts add up', () => {
    const r = figureReceipt(budget, city, police.years.fy2027.figures.net.passes, page);
    expect(r.parts).toEqual([
      { sign: '+', label: 'Proposed cut', value: '$10,588,717' },
      { sign: '−', label: 'Softened by bridge money', value: '$5,345,885' },
    ]);
    expect(r.total).toBe('$5,242,832');
  });

  it('leaves out IT Cost Allocation, and orders every view', () => {
    expect(p.rows.map((r) => r.id)).not.toContain('it-cost-allocation-plan');
    expect(p.excluded[0].d.id).toBe('it-cost-allocation-plan');
    expect(p.defaultId).toBe('police');
    const first = (view: string) => p.rows.find((r) => p.order[r.id][view] === 0)!.id;
    expect(first('fy2027-passes-budget')).toBe('police');
    expect(first('fy2027-passes-cut')).toBe('information-technology'); // 16.1%
    expect(Object.keys(p.order.police)).toHaveLength(8);
  });

  it('marks the four charter offices', () => {
    expect(p.rows.filter((r) => r.charter).map((r) => r.id).sort()).toEqual(['city-attorney', 'city-auditor', 'mayor-council', 'odpa']);
  });

  it('refuses a short name for a department that does not exist', () => {
    const b = structuredClone(budget);
    b.generalFund[0].lines = b.generalFund[0].lines.filter((d) => d.id !== 'odpa');
    expect(() => shortNames(city.path, b)).toThrow('"odpa" isn\'t a department');
  });

  it('has no figure typed into the page', () => {
    const src = readFileSync(join(import.meta.dirname, '../../src/components/views/DepartmentCuts.astro'), 'utf8');
    for (const literal of ['106.2', '10.6M', '5.3M', '5.2M', '4.9%', '29.3', '283.8', '600K', '37.42']) expect(src, literal).not.toContain(literal);
  });

  // #33: the chart's sheet spells every name out.
  it('spells out every department name, and refuses one left abbreviated', () => {
    const n = fullNames(city.path, budget);
    expect(Object.keys(n)).toHaveLength(16);
    expect(n.hhcs).toBe('Health, Housing & Community Services');
    expect(n.odpa).toBe('Office of the Director of Police Accountability');
    for (const name of Object.values(n)) expect(name).not.toMatch(/\(|Svcs|Dir\./);
    const b = structuredClone(budget);
    b.generalFund[0].lines.push({ ...b.generalFund[0].lines[0], id: 'x', name: 'Public Svcs (PS)' });
    expect(() => fullNames(city.path, b)).toThrow('"x" needs a fullNames entry');
  });
});
