/**
 * The city registry. Every folder at data/cities/{country}/{state}/{city}/
 * holding a city.json is a city, and gets its pages generated. Adding a city
 * is adding a folder; no routing code changes. The rules for reading a
 * city.json are in city-registry.ts.
 *
 * Test fixture cities live at data/fixtures/{name}/ and are served under
 * /test/cities/{name}/ (#42): built so tests can drive them, but kept out of
 * search, the city lists and the landing page, like /test/receipts/.
 */
import { pagesFor, type CityPage, type CityPageSlug } from './city-pages.ts';
import { buildRegistry, type City } from './city-registry.ts';

export { buildRegistry, parseCity, type City, type CityMeta } from './city-registry.ts';
export { CITY_PAGES, pagesFor, hasPage, type CityPage, type CityPageSlug } from './city-pages.ts';

const files = import.meta.glob(['/data/cities/*/*/*/city.json', '/data/fixtures/*/city.json'], { eager: true, import: 'default' });
// Only the names: which data files exist, so a city can't declare a page it has no data for.
const present = new Set(Object.keys(import.meta.glob(['/data/cities/*/*/*/*.json', '/data/fixtures/*/*.json'])));

/** Every city that gets pages, test fixtures included. */
export const allCities: City[] = buildRegistry(files, (p) => present.has(p));

/** The published cities: the city switcher, the landing page's list, the tests that read every city. Not fixtures or drafts. */
export const cities: City[] = allCities.filter((c) => !c.fixture && !c.draft);

/** The city whose figures the landing page shows. */
export const featuredCity: City = cities.find((c) => c.featured)!;

/** The folder a city's budget data is read from, by its site path (a fixture borrows another city's). */
export function dataDirOf(cityPath: string): string {
  return allCities.find((c) => c.path === cityPath)?.dataDir ?? `/data/cities${cityPath}`;
}

/** The pages this city gets, in nav order. */
export const cityPages = (city: City): CityPage[] => pagesFor(city);

/** getStaticPaths for a city route: one entry per city that has `page` (every city, for the overview). */
export function cityStaticPaths(page?: CityPageSlug) {
  return () =>
    allCities.filter((city) => !page || pagesFor(city).some((p) => p.slug === page)).map((city) => ({ params: city.slug, props: { city } }));
}
