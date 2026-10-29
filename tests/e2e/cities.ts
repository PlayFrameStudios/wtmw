/**
 * The city registry, read from disk: Playwright doesn't run through Vite, so no import.meta.glob.
 * Each city's routes follow its own page set (#42), and test fixture cities come last.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pagesFor } from '../../src/lib/city-pages';
import type { CitySettings } from '../../src/lib/city-settings';

const data = join(import.meta.dirname, '../../data');
const dirs = (p: string) => readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
const settings = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as CitySettings;
const city = (path: string, file: string, fixture: boolean) => {
  const pages = pagesFor(settings(file));
  return { path, fixture, routes: [path, ...pages.map((p) => `${path}${p.slug}/`)], navLabels: pages.filter((p) => p.nav).map((p) => p.label) };
};

export const cities = [
  ...dirs(join(data, 'cities')).flatMap((country) =>
    dirs(join(data, 'cities', country)).flatMap((state) =>
      dirs(join(data, 'cities', country, state)).map((c) => city(`/${country}/${state}/${c}/`, join(data, 'cities', country, state, c, 'city.json'), false)),
    ),
  ),
  ...dirs(join(data, 'fixtures')).map((f) => city(`/test/cities/${f}/`, join(data, 'fixtures', f, 'city.json'), true)),
];

/** Every city page, fixtures included. */
export const cityRoutes = cities.flatMap((c) => c.routes);
export const berkeley = cities.find((c) => c.path === '/us/ca/berkeley/')!;
/** A city in balance, with no ballot, budgeting each year: the 6-link nav. */
export const fixture = cities.find((c) => c.fixture)!;
