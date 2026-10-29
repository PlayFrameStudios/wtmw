/**
 * A city's reserves (data/cities/{city}/reserves.json), the module the Balance & Reserves
 * page is built around (#42). Each amount is read from the sentence it quotes, and the data
 * check (npm run data) confirms that sentence is on its PDF page.
 */
import type { City } from './cities.ts';
import { fy, parseReserves, type Reserve } from './city-settings.ts';
import type { Figure } from './receipts.ts';

const files = import.meta.glob(['/data/cities/*/*/*/reserves.json', '/data/fixtures/*/reserves.json'], { eager: true, import: 'default' });

export interface CityReserves {
  /** The fiscal year the amounts are for. */
  year: number;
  reserves: (Reserve & { figure: Figure })[];
}

/** The city's reserves, or undefined if it has no reserves.json. */
export function reservesFor(city: City): CityReserves | undefined {
  const file = `${city.dir}reserves.json`;
  if (!(file in files)) return undefined;
  const { year, reserves } = parseReserves(file, files[file]);
  return {
    year,
    reserves: reserves.map((r) => ({
      ...r,
      figure: { value: r.value, label: `${r.name}, ${fy(city.budget.labels, year)}`, ref: r.ref, tone: 'neutral' } satisfies Figure,
    })),
  };
}
