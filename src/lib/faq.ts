/**
 * Questions people ask (#54), ready to render: the site-wide FAQ (data/site/faq.json, checked by the data
 * script) and a city's (budget.json's faq, from its faq.json). Each answer is segments: text, links and
 * figures, the figures filled from budget.json with their receipts, so an answer never types a number the
 * rest of the site shows. Also the FAQPage JSON-LD both pages carry.
 */
import siteFaqFile from '../../data/site/faq.json';
import type { SiteFaqFile } from '../data/faq.ts';
import { figureAt } from '../data/faq.ts';
import type { CityBudget, CoverageParagraph, DocRef, FaqQuestion, Source } from '../data/types.ts';
import type { City } from './cities.ts';
import { coverageFor, paragraphSegments, type Segment } from './coverage.ts';
import { fy } from './city-settings.ts';
import { familiesFor } from './families.ts';
import { shortMoney } from './format.ts';
import { cityOverview } from './overview.ts';
import type { Figure } from './receipts.ts';
import { revenueGroupsFor } from './revenue-groups.ts';
import { reportErrorUrl } from './site.ts';

export const siteFaq = siteFaqFile as SiteFaqFile;

/** Where an answer lives: the site-wide FAQ, or a city's. */
export const siteFaqHref = (id?: string) => `/faq/${id ? `#${id}` : ''}`;
export const cityFaqHref = (city: City, id?: string) => `${city.path}faq/${id ? `#${id}` : ''}`;

export interface FaqParagraph {
  segments: Segment[];
  cites: DocRef[];
}

export interface FaqItem {
  id: string;
  question: string;
  paragraphs: FaqParagraph[];
  /** Site-wide answers for the general part: their questions and links. */
  see: { id: string; question: string; href: string }[];
}

/** The site links an answer can name without a URL: the error report (for this page) and the city request form. */
const siteLinks = (pageUrl: URL) => (name: string) => {
  if (name === 'report-error') return { href: reportErrorUrl(pageUrl), external: true };
  if (name === 'request-city') return { href: '/#request', external: false };
  throw new Error(`no site link "${name}"`);
};

const seeOf = (q: FaqQuestion) =>
  (q.see ?? []).map((id) => {
    const general = siteFaq.questions.find((g) => g.id === id);
    if (!general) throw new Error(`FAQ ${q.id}: sees "${id}", which isn't a site-wide answer`);
    return { id, question: general.question, href: siteFaqHref(id) };
  });

/** The site-wide FAQ: no city's figures, and its sources are its own (S1… in data/site/faq.json). */
export function siteFaqItems(pageUrl: URL): { items: FaqItem[]; sources: Map<string, Omit<Source, 'number' | 'row'>> } {
  const link = siteLinks(pageUrl);
  const items = siteFaq.questions.map((q) => ({
    id: q.id,
    question: q.question,
    paragraphs: q.paragraphs.map((p) => ({ segments: paragraphSegments(undefined, p.text, {}, link), cites: p.cites ?? [] })),
    see: [],
  }));
  return { items, sources: new Map(siteFaq.sources.map((s) => [s.id, s])) };
}

/** A city's FAQ, or undefined when it has none. */
export function cityFaqItems(city: City, budget: CityBudget, pageUrl: URL): FaqItem[] | undefined {
  const faq = budget.faq;
  if (!faq) return undefined;
  const label = (y: number) => fy(city.budget.labels, y);
  const families = familiesFor(city, budget);
  const o = cityOverview(budget, families, revenueGroupsFor(city, budget), label);
  const uses = budget.generalFund[0];
  const year = label(uses.year);
  const coverage = coverageFor(city, budget, revenueGroupsFor(city, budget));

  const token = (t: string): Segment => {
    if (t === 'year') return { kind: 'text', text: year };
    if (t === 'depts') return { kind: 'figure', text: shortMoney(o.baseline.value), figure: o.baseline };
    if (t === 'allFunds' || t === 'generalFund' || t === 'propertyTax') {
      const f = coverage?.figures[t];
      if (!coverage) throw new Error(`FAQ: {${t}} needs the city's coverage block (#51)`);
      if (!f) throw new Error(`FAQ: {${t}} isn't available for ${city.name}: its budget has no such figure (#59)`);
      return { kind: 'figure', text: shortMoney(f.value), figure: f };
    }
    const [kind, arg] = t.split(':');
    if (kind === 'dept') {
      const line = uses.lines.find((l) => l.id === arg)!;
      const figure: Figure = { value: line.amount, label: `${line.name}, ${year}: General Fund ${uses.noun}`, ref: line, tone: 'neutral' };
      return { kind: 'figure', text: shortMoney(line.amount), figure };
    }
    if (kind === 'per100') {
      // The Departments page's own figure, from the same shares: "$45.14 of every $100". A family is the sum
      // of its departments as that page prints them, so Police $45.14 and Fire $27.46 make $72.60, not $72.59.
      const cents = (x: number) => Math.round(x * 100);
      const dept = o.shares.find((s) => s.item.id === arg);
      const members = dept ? [dept] : o.shares.filter((s) => families.of(s.item.id).id === arg);
      return { kind: 'text', text: `$${(members.reduce((a, s) => a + cents(s.exact), 0) / 100).toFixed(2)} of every $100` };
    }
    if (kind === 'amount') {
      const a = faq.amounts![arg];
      const figure: Figure = { value: a.amount, label: a.label, ref: a, tone: 'neutral' };
      return { kind: 'figure', text: shortMoney(a.amount), figure };
    }
    if (kind === 'fig') {
      const f = figureAt(budget, arg);
      if (!f) throw new Error(`FAQ: no figure at ${arg}`);
      const figure: Figure = { value: f.value, label: faq.labels?.[arg] ?? f.ref.label ?? f.ref.name ?? arg, ref: f.ref as unknown as DocRef, tone: 'neutral' };
      return { kind: 'figure', text: shortMoney(f.value), figure };
    }
    throw new Error(`FAQ: unknown token {${t}}`);
  };
  const link = siteLinks(pageUrl);
  const paragraph = (p: CoverageParagraph): FaqParagraph => {
    const tokens = Object.fromEntries([...p.text.matchAll(/\{(\w+(?::[\w.-]+)?)\}/g)].map((m) => [m[1], token(m[1])]));
    return { segments: paragraphSegments(city, p.text, tokens, link), cites: p.cites ?? [] };
  };
  return faq.questions.map((q) => ({ id: q.id, question: q.question, paragraphs: q.paragraphs.map(paragraph), see: seeOf(q) }));
}

/** Plain text of an answer, for JSON-LD: figures as shown, links as their words. */
export const plainText = (p: FaqParagraph) => p.segments.map((s) => s.text).join('');

/** FAQPage structured data (schema.org), so search engines can show the answers. */
export function faqJsonLd(items: FaqItem[]): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.paragraphs.map(plainText).join(' ') },
    })),
  };
  // Inside <script>, "</" would end the element early.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
