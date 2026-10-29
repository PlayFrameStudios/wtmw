import type { CitySettings } from './city-settings.ts';

/**
 * Every sub-page a city can have, besides its overview at the city root, in nav order
 * (the mockup's: Overview, Revenue, The Gap, Departments, Ballot, Capital, Sources).
 * `label` is the nav link; pages with `nav: false` are linked from the footer only.
 * Which of them a city gets is `pagesFor()`: The Gap and Balance & Reserves share one
 * slot, chosen by the city's fiscal-position variant, and Ballot is on only while the
 * city switches it on (#42).
 */
export const CITY_PAGES = [
  { slug: 'revenue', title: 'Revenue', label: 'Revenue', nav: true },
  { slug: 'gap', title: 'The gap', label: 'The Gap', nav: true },
  { slug: 'reserves', title: 'Balance & reserves', label: 'Balance & Reserves', nav: true },
  { slug: 'departments', title: 'Departments', label: 'Departments', nav: true },
  { slug: 'ballot', title: 'Your ballot', label: 'Ballot', nav: true },
  { slug: 'capital', title: 'Capital program', label: 'Capital', nav: true },
  { slug: 'sources', title: 'Sources & methods', label: 'Sources', nav: true },
  { slug: 'glossary', title: 'Glossary', label: 'Glossary', nav: false },
] as const;

export type CityPage = (typeof CITY_PAGES)[number];
export type CityPageSlug = CityPage['slug'];

type Switches = Pick<CitySettings, 'fiscalPosition' | 'ballot'>;

/** The pages a city gets, in nav order. */
export function pagesFor(city: Switches): CityPage[] {
  return CITY_PAGES.filter((p) => {
    if (p.slug === 'gap' || p.slug === 'reserves') return p.slug === city.fiscalPosition.variant;
    if (p.slug === 'ballot') return city.ballot;
    return true;
  });
}

export const hasPage = (city: Switches, slug: CityPageSlug) => pagesFor(city).some((p) => p.slug === slug);
