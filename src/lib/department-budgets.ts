/**
 * Figures for the Departments page (#43): each department's General Fund budget and its share of
 * every $100, the citywide lines that bring the departments to the table's total, and staff
 * positions by department. All from budget.json. A city with a deficit plan (#61) has a baseline
 * before its proposed cuts, not a budget, and its figures' labels say so.
 */
import { hasGapPlan, type CityBudget, type DepartmentLine } from '../data/types.ts';
import type { Families } from './families.ts';
import type { Figure } from './receipts.ts';
import { per100 } from './waffle.ts';

/** `names` are display names by department id; `yearLabel` names a fiscal year in the city's style. */
export function departmentBudgets(b: CityBudget, families: Families, names: Record<string, string>, yearLabel: (year: number) => string) {
  const uses = b.generalFund[0];
  const y = yearLabel(uses.year);
  const baseline = hasGapPlan(b);
  const budget = baseline ? uses.basis : `General Fund${uses.note ? ` ${uses.note}` : ''} budget`;
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
    /** Who provides the service, where it isn't City staff (#59). */
    providedBy: s.item.providedBy,
  }));
  const deptTotal = departments.reduce((a, d) => a + d.amount, 0);
  const departmentsFigure: Figure = {
    value: deptTotal,
    label: `${uses.basis}, ${y}${uses.note ? ` (${uses.note})` : ''}`,
    ref: departments[0],
    tone: 'neutral',
    parts: departments.map((d) => ({ label: d.name, value: d.amount })),
  };
  // With citywide lines, the total is built from the departments and them. Without (#59), it is the table's own total:
  // its lines are printed rounded to the dollar, so their sum can be a dollar off it, and the page shows only the City's.
  const total: Figure = {
    value: uses.total.amount,
    label: `${baseline ? uses.basis : 'General Fund expenditures'}, ${y}${uses.note ? ` (${uses.note})` : ''}`,
    ref: uses.total,
    tone: 'neutral',
    ...(citywide.length ? { parts: [{ label: 'Departments', value: deptTotal }, ...citywide.map((l) => ({ label: l.name, value: l.amount }))] } : {}),
  };

  const staff = b.staffing;
  const staffRows = [...(staff.byDepartment ?? [])]
    .sort((a, c) => c.fte - a.fte)
    .map((d) => ({ name: d.name, figure: { value: d.fte, label: `${d.name}: staff positions (FTE), ${yearLabel(staff.year)} ${staff.basis}`, ref: d, format: 'number', tone: 'neutral' } satisfies Figure }));

  return {
    year: uses.year,
    /** What one line is: "department", or the city's own word ("program", #59). */
    unit: uses.unit ?? 'department',
    rows,
    /** Services the General Fund doesn't pay for (#59): muted rows with no squares. */
    outside: b.coverage?.notInBudget ?? [],
    /** The lines below the departments: their figures, in the table's order. */
    citywide: citywide.map((l) => ({ id: l.id, name: l.name, figure: figure(l, 'General Fund') })),
    departments: departmentsFigure,
    total,
    max: Math.max(...departments.map((d) => d.amount)),
    staff: {
      rows: staffRows,
      max: Math.max(...staffRows.map((r) => r.figure.value)),
      /** What the count leaves out, where the City's document says (#60). */
      scope: staff.scope,
      total: { value: staff.fte, label: `Staff positions (FTE), ${yearLabel(staff.year)} ${staff.basis}`, ref: staff, format: 'number', tone: 'neutral' } satisfies Figure,
    },
  };
}
