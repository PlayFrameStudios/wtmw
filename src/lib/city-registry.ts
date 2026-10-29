/**
 * Reading city.json files into Cities: plain functions with no import.meta.glob, so the
 * data check (scripts/build-data.ts) applies the same rules as the site build.
 */
import { parseSettings, type CitySettings } from './city-settings.ts';

export interface CityMeta {
  name: string;
  state: string;
  stateCode: string;
  country: string;
  countryCode: string;
  government: string;
}

export interface City extends CityMeta, CitySettings {
  /** URL segments, lowercase: { country: 'us', state: 'ca', city: 'berkeley' } */
  slug: { country: string; state: string; city: string };
  /** Site path with trailing slash, e.g. /us/ca/berkeley/ */
  path: string;
  /** The folder holding its city.json: /data/cities/us/ca/berkeley/ */
  dir: string;
  /** The folder its budget data comes from: its own, or for a fixture, the city it borrows from. */
  dataDir: string;
  /** A test fixture: noindex, and in no list of cities. */
  fixture: boolean;
  /** Built and tested but not launched ("draft": true in city.json): noindex, and in no list of cities. */
  draft: boolean;
}

const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUIRED: (keyof CityMeta)[] = ['name', 'state', 'stateCode', 'country', 'countryCode', 'government'];

/**
 * Turns a registry file path plus its parsed JSON into a City, or throws with the reason.
 * `exists(path)` says whether a data file is there, so a city can't switch on a page it has no data for.
 */
export function parseCity(file: string, meta: unknown, exists: (path: string) => boolean): City {
  const real = file.match(/data\/cities\/([^/]+)\/([^/]+)\/([^/]+)\/city\.json$/);
  const test = file.match(/data\/fixtures\/([^/]+)\/city\.json$/);
  if (!real && !test) throw new Error(`${file}: not at data/cities/{country}/{state}/{city}/city.json`);
  const [country, state, city] = real ? real.slice(1) : ['test', 'cities', test![1]];
  for (const seg of [country, state, city]) {
    if (!SEGMENT.test(seg)) throw new Error(`${file}: path segment "${seg}" must be lowercase letters, digits and hyphens`);
  }
  if (typeof meta !== 'object' || meta === null) throw new Error(`${file}: expected a JSON object`);
  const record = meta as Record<string, unknown>;
  for (const key of REQUIRED) {
    if (typeof record[key] !== 'string' || record[key] === '') throw new Error(`${file}: missing "${key}"`);
  }
  const typed = record as unknown as CityMeta;
  const dir = real ? `/data/cities/${country}/${state}/${city}/` : `/data/fixtures/${city}/`;
  let dataDir = dir;
  if (real) {
    if (typed.countryCode.toLowerCase() !== country) {
      throw new Error(`${file}: countryCode "${typed.countryCode}" does not match folder "${country}"`);
    }
    if (typed.stateCode.toLowerCase() !== state) {
      throw new Error(`${file}: stateCode "${typed.stateCode}" does not match folder "${state}"`);
    }
  } else {
    const from = (record.fixture as { data?: unknown } | undefined)?.data;
    if (typeof from !== 'string' || !/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/.test(from)) {
      throw new Error(`${file}: a fixture needs "fixture": { "data": "{country}/{state}/{city}" }, the city whose budget data it borrows`);
    }
    dataDir = `/data/cities/${from}/`;
  }
  // reserves.json is the city's own; everything else comes from where its budget data lives.
  const settings = parseSettings(file, record, (name) => exists(`${name === 'reserves.json' ? dir : dataDir}${name}`));
  if (!real && settings.featured) throw new Error(`${file}: a fixture can't be the featured city`);
  if (record.draft !== undefined && typeof record.draft !== 'boolean') throw new Error(`${file}: "draft" must be true or false`);
  const draft = record.draft === true;
  if (draft && settings.featured) throw new Error(`${file}: a draft city can't be the featured city`);
  const { name, state: stateName, stateCode, country: countryName, countryCode, government } = typed;
  return {
    name,
    state: stateName,
    stateCode,
    country: countryName,
    countryCode,
    government,
    ...settings,
    slug: { country, state, city },
    path: `/${country}/${state}/${city}/`,
    dir,
    dataDir,
    fixture: !real,
    draft,
  };
}

/** Builds the registry from {path: json} entries; rejects duplicates, sorts by path; exactly one real city is featured. */
export function buildRegistry(entries: Record<string, unknown>, exists: (path: string) => boolean): City[] {
  const cities = Object.entries(entries).map(([file, json]) => parseCity(file, json, exists));
  const seen = new Set<string>();
  for (const c of cities) {
    if (seen.has(c.path)) throw new Error(`duplicate city ${c.path}`);
    seen.add(c.path);
  }
  const featured = cities.filter((c) => c.featured);
  if (cities.some((c) => !c.fixture) && featured.length !== 1) {
    throw new Error(`exactly one city.json must say "featured": true (the landing page's city); found ${featured.length}`);
  }
  return cities.sort((a, b) => a.path.localeCompare(b.path));
}
