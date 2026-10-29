/**
 * Figures for the Departments page of a city without a deficit plan (#43): each department's
 * General Fund budget and its share of every $100, the citywide lines that bring the
 * departments to the table's total, and staff positions by department. All from budget.json.
 */
import type { CityBudget, DepartmentLine } from '../data/types.ts';
import type { Families } from './families.ts';
import type { Figure } from './receipts.ts';
import { per100 } from './waffle.ts';

/** `names` are display names by department id; `yearLabel` names a fiscal year in the city's style. */
export function departmentBudgets(b: CityBudget, families: Families, names: Record<string, string>, yearLabel: (year: number) => string) {
  const uses = b.generalFund[0];
  const y = yearLabel(uses.year);
  const budget = `General Fund${uses.note ? ` ${uses.note}` : ''} budget`;
  const departments = uses.lines.filter((l) => l.kind === 'department');
  const citywide = uses.lines.filter((l) => l.kind === 'citywide');
  const figure = (l: DepartmentLine, what: string): Figure => ({ value: l.amount, label: `${l.name}, ${y}: ${what}`, ref: l, tone: 'neutral' });

  const rows = per100(departments, (d) => d.amount).map((s) => ({
    id: s.item.id,
    name: names[s.item.id] ?? s.item.name,
    family: families.of(s.item.id),
    color: families.color(s.item.id),
    per100: s.exact,
    figure: figure(s.item, budget),
  }));
  const deptTotal = departments.reduce((a, d) => a + d.amount, 0);
  const departmentsFigure: Figure = {
    value: deptTotal,
    label: `${uses.basis}, ${y}${uses.note ? ` (${uses.note})` : ''}`,
    ref: departments[0],
    tone: 'neutral',
    parts: departments.map((d) => ({ label: d.name, value: d.amount })),
  };
  const total: Figure = {
    value: uses.total.amount,
    label: `General Fund expenditures, ${y}${uses.note ? ` (${uses.note})` : ''}`,
    ref: uses.total,
    tone: 'neutral',
    parts: [{ label: 'Departments', value: deptTotal }, ...citywide.map((l) => ({ label: l.name, value: l.amount }))],
  };

  const staff = b.staffing;
  const staffRows = [...(staff.byDepartment ?? [])]
    .sort((a, c) => c.fte - a.fte)
    .map((d) => ({ name: d.name, figure: { value: d.fte, label: `${d.name}: staff positions (FTE), ${yearLabel(staff.year)} ${staff.basis}`, ref: d, format: 'number', tone: 'neutral' } satisfies Figure }));

  return {
    year: uses.year,
    rows,
    /** The lines below the departments: their figures, in the table's order. */
    citywide: citywide.map((l) => ({ id: l.id, name: l.name, figure: figure(l, 'General Fund') })),
    departments: departmentsFigure,
    total,
    max: Math.max(...departments.map((d) => d.amount)),
    staff: {
      rows: staffRows,
      max: Math.max(...staffRows.map((r) => r.figure.value)),
      total: { value: staff.fte, label: `Staff positions (FTE), ${yearLabel(staff.year)} ${staff.basis}`, ref: staff, format: 'number', tone: 'neutral' } satisfies Figure,
    },
  };
}
