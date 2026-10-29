/**
 * Each city's budget.json, built from its workbook by `npm run data`.
 * Pages read figures from here; nothing on the site is typed in by hand.
 */
import type { CityBudget } from '../data/types.ts';
import type { City } from './cities.ts';

const files = import.meta.glob<CityBudget>('/data/cities/*/*/*/budget.json', { eager: true, import: 'default' });

/** The city's budget data, or undefined if it has none yet. */
export function budgetFor(city: City): CityBudget | undefined {
  return files[`${city.dataDir}budget.json`];
}
