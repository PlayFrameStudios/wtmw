/**
 * Department families (Public safety, People & places, …) and their colors,
 * from data/cities/{city}/families.json. The grouping is editorial, so it
 * lives beside the data rather than in it, and loading it checks that every
 * department in the city's budget belongs to exactly one family.
 */
import type { CityBudget } from '../data/types.ts';
import type { City } from './cities.ts';

export interface Family {
  id: string;
  name: string;
  /** Ramp, darkest first. */
  colors: string[];
}

interface FamiliesFile {
  families: Family[];
  members: Record<string, string>;
}

const files = import.meta.glob<FamiliesFile>('/data/cities/*/*/*/families.json', { eager: true, import: 'default' });

export interface Families {
  list: Family[];
  /** Department id → its family. */
  of: (departmentId: string) => Family;
  /** Department id → its color: within a family, bigger departments get darker shades. */
  color: (departmentId: string) => string;
}

export function loadFamilies(file: FamiliesFile, departments: { id: string; baseline: number }[], where: string): Families {
  const byId = new Map(file.families.map((f) => [f.id, f]));
  const ids = new Set(departments.map((d) => d.id));
  for (const d of departments) {
    if (!file.members[d.id]) throw new Error(`${where}: department "${d.id}" has no family`);
    if (!byId.has(file.members[d.id])) throw new Error(`${where}: "${d.id}" is in unknown family "${file.members[d.id]}"`);
  }
  for (const id of Object.keys(file.members)) {
    if (!ids.has(id)) throw new Error(`${where}: "${id}" isn't a department in the budget`);
  }
  const colors = new Map<string, string>();
  const used = new Map<string, number>();
  for (const d of [...departments].sort((a, b) => b.baseline - a.baseline)) {
    const f = byId.get(file.members[d.id])!;
    const n = used.get(f.id) ?? 0;
    colors.set(d.id, f.colors[Math.min(n, f.colors.length - 1)]);
    used.set(f.id, n + 1);
  }
  return {
    list: file.families,
    of: (id) => byId.get(file.members[id])!,
    color: (id) => colors.get(id)!,
  };
}

export function familiesFor(city: City, budget: CityBudget): Families {
  const file = files[`${city.dataDir}families.json`];
  if (!file) throw new Error(`${city.path} has no families.json`);
  return loadFamilies(file, budget.departmentReductions[0].departments, `${city.path}families.json`);
}
