import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GapBudget } from '../../src/data/types';
import { unwrapFigures } from './figures';

const root = join(import.meta.dirname, '../..');
const b: GapBudget = JSON.parse(readFileSync(join(root, 'data/cities/us/ca/berkeley/budget.json'), 'utf8'));
const html = readFileSync(join(root, 'dist/us/ca/berkeley/departments/index.html'), 'utf8');
const m = (v: number) => `$${(v / 1e6).toFixed(1)}M`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

describe('departments page (built)', () => {
  const police = b.departmentReductions[0].departments.find((d) => d.id === 'police')!;
  const panel = html.slice(html.indexOf('id="police"'), html.indexOf('</section>', html.indexOf('id="police"')));
  const fy27 = panel.slice(panel.indexOf('yr--fy2027'), panel.indexOf('yr--fy2028'));
  const text = unwrapFigures(fy27).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('FY27 Police, tax passes: baseline, cut, softened, net', () => {
    expect(text).toContain(`FY27 baseline ${m(police.baseline)}`);
    expect(text).toContain(`Proposed cut ${m(police.reduction)} (${pct(police.reductionPct)})`);
    expect(text).toContain(`Softened by bridge money +${m(police.salesTaxAllocation)}`);
    expect(text).toContain(`Net cut if Measure V passes ${m(police.netReduction)} (${pct(police.netReductionPct)})`);
  });

  it('FY27 Police, tax fails: the net cut is the full cut', () => {
    expect(text).toContain(`Net cut if Measure V fails ${m(police.reduction)} (${pct(police.reductionPct)})`);
  });

  it('every department but IT Cost Allocation has a row, and IT Cost Allocation is footnoted', () => {
    const depts = b.departmentReductions[0].departments;
    const rows = [...html.matchAll(/<li class="row" data-dept="([^"]+)"/g)].map((x) => x[1]);
    expect(rows.sort()).toEqual(depts.map((d) => d.id).filter((id) => id !== 'it-cost-allocation-plan').sort());
    expect(unwrapFigures(html).replace(/<[^>]+>/g, ' ')).toMatch(/Not shown: IT Cost Allocation Plan \(\$600K baseline, cut entirely\)/);
  });
});
