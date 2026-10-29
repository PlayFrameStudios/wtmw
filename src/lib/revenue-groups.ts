/**
 * Revenue groups for the Revenue page $100 chart and the overview mix bar (Property tax, Transfers in, …), from
 * data/cities/{city}/revenue-groups.json. Loading checks that every revenue
 * line item is in exactly one group, so the groups always add up to the total.
 */
import type { CityBudget, RevenueLine } from '../data/types.ts';
import type { City } from './cities.ts';

export interface RevenueGroupDef {
  id: string;
  name: string;
  color: string;
  lines: string[];
}

export interface RevenueGroup extends Omit<RevenueGroupDef, 'lines'> {
  lines: RevenueLine[];
  /** FY2026 adopted, summed over the group's lines. */
  adopted: number;
  /** adopted / the revenue TOTAL row. */
  share: number;
}

const files = import.meta.glob<{ groups: RevenueGroupDef[] }>('/data/cities/*/*/*/revenue-groups.json', { eager: true, import: 'default' });

export function groupRevenue(defs: RevenueGroupDef[], revenue: CityBudget['revenue'], where: string): RevenueGroup[] {
  const byName = new Map(revenue.lines.map((l) => [l.name, l]));
  const seen = new Map<string, string>();
  for (const g of defs) {
    for (const n of g.lines) {
      if (!byName.has(n)) throw new Error(`${where}: "${n}" (in ${g.id}) isn't a revenue line`);
      if (seen.has(n)) throw new Error(`${where}: "${n}" is in both ${seen.get(n)} and ${g.id}`);
      seen.set(n, g.id);
    }
  }
  const missing = revenue.lines.filter((l) => !seen.has(l.name)).map((l) => l.name);
  if (missing.length) throw new Error(`${where}: not in any group: ${missing.join(', ')}`);
  const total = revenue.total.fy2026Adopted;
  return defs.map((g) => {
    const lines = g.lines.map((n) => byName.get(n)!);
    const adopted = lines.reduce((a, l) => a + l.fy2026Adopted, 0);
    return { ...g, lines, adopted, share: adopted / total };
  });
}

export function revenueGroupsFor(city: City, budget: CityBudget): RevenueGroup[] {
  const file = files[`${city.dataDir}revenue-groups.json`];
  if (!file) throw new Error(`${city.path} has no revenue-groups.json`);
  return groupRevenue(file.groups, budget.revenue, `${city.path}revenue-groups.json`);
}
