/** Glossary anchors: each term's id on the city's Glossary page, so other pages can link to a definition. */
import type { City } from './cities.ts';

export const glossaryAnchor = (term: string) =>
  term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const glossaryHref = (city: City, term: string) => `${city.path}glossary/#${glossaryAnchor(term)}`;
