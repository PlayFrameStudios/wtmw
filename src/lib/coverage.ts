/**
 * The "What this budget covers" block (#51), ready to render: each paragraph of coverage.json split
 * into text, links (to a glossary term or a source) and figures. Figures are filled from budget.json
 * with their receipts, so the block never types a number the rest of the site shows.
 */
import { COVERAGE_TOKENS, LINK } from '../data/coverage.ts';
import type { CityBudget, CoverageParagraph, DocRef } from '../data/types.ts';
import type { City } from './cities.ts';
import { hasPage, type CityPageSlug } from './city-pages.ts';
import { fy } from './city-settings.ts';
import { shortMoney } from './format.ts';
import { glossaryHref } from './glossary.ts';
import type { Figure } from './receipts.ts';
import type { RevenueGroup } from './revenue-groups.ts';

export type Segment = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string; external: boolean } | { kind: 'figure'; text: string; figure: Figure };

export interface CoverageBlockParagraph {
  segments: Segment[];
  cites: DocRef[];
}

/** Where the block is: the Sources page, at this anchor. */
export const coverageHref = (city: City) => `${city.path}sources/#what-this-covers`;

/**
 * A cited paragraph's text as segments: [words](target) links to a glossary term, one of the city's pages
 * (words alone when the city doesn't have that page) or a source; {token}s are what `tokens` fills them with.
 */
export function paragraphSegments(city: City, text: string, tokens: Record<string, Segment>): Segment[] {
  const pieces = new RegExp(`${LINK.source}|\\{(${Object.keys(tokens).join('|')})\\}`, 'g');
  const out: Segment[] = [];
  let at = 0;
  for (const m of text.matchAll(pieces)) {
    if (m.index > at) out.push({ kind: 'text', text: text.slice(at, m.index) });
    const [, words, target, token] = m;
    if (token) out.push(tokens[token]);
    else if (target.startsWith('glossary:')) out.push({ kind: 'link', text: words, href: glossaryHref(city, target.slice('glossary:'.length)), external: false });
    else if (target.startsWith('page:')) {
      const [slug, anchor] = target.slice('page:'.length).split('#');
      out.push(hasPage(city, slug as CityPageSlug) ? { kind: 'link', text: words, href: `${city.path}${slug}/${anchor ? `#${anchor}` : ''}`, external: false } : { kind: 'text', text: words });
    } else out.push({ kind: 'link', text: words, href: target, external: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) });
  // Neighbouring text (a link to a page the city lacks) reads as one run.
  return out.reduce<Segment[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (s.kind === 'text' && last?.kind === 'text') acc[acc.length - 1] = { kind: 'text', text: last.text + s.text };
    else acc.push(s);
    return acc;
  }, []);
}

export function coverageFor(city: City, budget: CityBudget, revenueGroups: RevenueGroup[]) {
  const coverage = budget.coverage;
  if (!coverage) return undefined;
  const year = budget.generalFund[0].year;
  const label = (y: number) => fy(city.budget.labels, y);
  const { size, revenue } = budget;
  const primary = revenue.columns.find((c) => c.key === revenue.primary)!;
  const property = revenueGroups.find((g) => g.id === 'property-tax')!;
  // The group's total, as the Revenue pages build it: one line's own receipt, or the lines as its parts.
  const [only] = property.lines;
  const propertyTax: Figure = {
    value: property.adopted,
    label: `${property.name}: the City's share, ${label(primary.year)} ${primary.basis}`,
    ref: property.lines.length === 1 ? (only.cites?.[revenue.primary] ?? only) : only,
    tone: 'neutral',
    ...(property.lines.length > 1 ? { parts: property.lines.map((l) => ({ label: l.name, value: l.values[revenue.primary] })) } : {}),
  };
  const sized = (s: typeof size.allFunds, what: string): Figure => ({
    value: s.amount,
    label: `${what}, ${label(year)}${s.note ? ` (${s.note})` : ''}`,
    ref: s,
    tone: 'neutral',
  });
  const figures: Record<string, Figure> = {
    allFunds: sized(size.allFunds, 'Citywide spending, all funds'),
    generalFund: sized(size.generalFund, 'General Fund spending'),
    propertyTax,
  };

  const tokens: Record<string, Segment> = Object.fromEntries(
    COVERAGE_TOKENS.map((t) => [t, t === 'year' ? { kind: 'text', text: label(year) } : { kind: 'figure', text: shortMoney(figures[t].value), figure: figures[t] }]),
  );
  const segments = (text: string) => paragraphSegments(city, text, tokens);
  const paragraph = (p: CoverageParagraph): CoverageBlockParagraph => ({ segments: segments(p.text), cites: p.cites ?? [] });

  return {
    questions: coverage.questions.map((q) => ({
      id: q.id,
      question: q.question,
      paragraphs: q.paragraphs.map(paragraph),
      agencies: q.agencies ?? [],
    })),
    overview: { ...paragraph(coverage.overview), href: coverageHref(city) },
  };
}
