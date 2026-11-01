/**
 * What a city's budget covers, and what it doesn't (#51): data/cities/{city}/coverage.json.
 * Its sources are other governments' documents and explainers, numbered after the City's own,
 * typed 'other' so no page can present them as the City's books. Every quote is checked against
 * its page excerpt, every number in the copy must be in a quote it cites (or come from a token the
 * pages fill from budget.json), and every link must go to a glossary term, one of the city's pages or
 * a registered source. The same paragraph checks serve the schools page (#52): paragraphChecks().
 */
import { CITY_PAGES } from '../lib/city-pages.ts';
import { checkQuote, normalize, type Excerpts } from './documents.ts';
import { COVERAGE_QUESTIONS, type CityBudget, type Coverage, type CoverageParagraph, type DocRef, type GlossaryEntry, type Source } from './types.ts';

export interface CoverageFile {
  sources: Omit<Source, 'number' | 'row'>[];
  glossary: (DocRef & { term: string; definition: string; also?: DocRef[] })[];
  questions: Coverage['questions'];
  overview: Coverage['overview'];
}

/** The figures a paragraph can name; the pages fill them from budget.json, each with its receipt. */
export const COVERAGE_TOKENS = ['allFunds', 'generalFund', 'propertyTax', 'year'] as const;
const TOKEN = /\{(\w+)\}/g;
/**
 * [words](target): a glossary term ("glossary:General Fund (GF)", so one level of parentheses), one of
 * the city's pages ("page:schools", "page:sources#what-this-covers") or a source's URL.
 */
export const LINK = /\[([^\]]+)\]\(((?:[^()]|\([^()]*\))+)\)/g;
const NUMBER = /\d[\d,.]*\d|\d/g;

/** The pages every city has; the schools page (#52) only where the city has its data. */
export const ALWAYS_PAGES: readonly string[] = CITY_PAGES.map((p) => p.slug).filter((s) => s !== 'schools');

/** "$68.8 million" and "$68.8M" share "68.8", and "$.2 million" is "0.2"; trailing punctuation isn't part of a number. */
const numbersIn = (s: string) => [...s.replace(/(?<!\d)\.(\d)/g, '0.$1').matchAll(NUMBER)].map((m) => m[0].replace(/[.,]+$/, ''));

/** What a paragraph's links and tokens may point at, and where its errors go. */
export interface ParagraphContext {
  known: Map<string, Source>;
  excerpts: Excerpts;
  glossaryTerms: Set<string>;
  /** Page slugs a "page:" link may name. */
  pages: readonly string[];
  tokens: readonly string[];
  errors: string[];
}

/** The checks every cited paragraph passes: its quotes, its numbers, its links and its tokens. */
export function paragraphChecks(ctx: ParagraphContext) {
  const { known, excerpts, glossaryTerms, pages, tokens: allowed, errors } = ctx;
  const urls = new Set([...known.values()].map((s) => s.url));
  const cite = (ref: DocRef, where: string) => {
    if (!known.has(ref.source)) return errors.push(`${where}: unknown source ${ref.source}`);
    try {
      checkQuote(ref, excerpts, where);
    } catch (e) {
      errors.push((e as Error).message);
    }
  };
  const paragraph = (p: CoverageParagraph, where: string) => {
    const tokens = [...p.text.matchAll(TOKEN)].map((m) => m[1]);
    for (const t of tokens) if (!allowed.includes(t)) errors.push(`${where}: unknown {${t}}`);
    for (const [, words, target] of p.text.matchAll(LINK)) {
      if (target.startsWith('glossary:')) {
        if (!glossaryTerms.has(target.slice('glossary:'.length))) errors.push(`${where}: "${words}" links to ${target}, which isn't in the glossary`);
      } else if (target.startsWith('page:')) {
        const slug = target.slice('page:'.length).split('#')[0];
        if (!pages.includes(slug)) errors.push(`${where}: "${words}" links to ${target}, which isn't one of this city's pages`);
      } else if (!urls.has(target)) errors.push(`${where}: "${words}" links to ${target}, which isn't a source's URL`);
    }
    const cites = p.cites ?? [];
    cites.forEach((c) => cite(c, where));
    if (!cites.length && !tokens.length && !p.unsourced?.trim()) errors.push(`${where}: no cites, no figures and no "unsourced" reason`);
    checkNumbers(p.text.replace(TOKEN, '').replace(LINK, '$1'), cites, where, errors);
  };
  return { cite, paragraph };
}

export function applyCoverage(
  budget: CityBudget,
  file: CoverageFile,
  excerpts: Excerpts,
  publisher: string,
  pages: readonly string[] = ALWAYS_PAGES,
): { budget: CityBudget; errors: string[] } {
  const errors: string[] = [];
  const first = budget.sources.length + 1;
  const added: Source[] = file.sources.map((s, i) => ({ ...s, number: first + i }));
  added.forEach((s, i) => {
    if (s.id !== `S${first + i}`) errors.push(`coverage.json: source ${i + 1} is ${s.id}, expected S${first + i} (it continues the City's numbering)`);
    if (s.type !== 'other') errors.push(`coverage.json ${s.id}: type "${s.type}", but coverage sources are other governments' documents ("other")`);
    if (s.publisher === publisher) errors.push(`coverage.json ${s.id}: published by ${publisher}; the City's own documents belong in its documents.json`);
  });
  const sources = [...budget.sources, ...added];
  const known = new Map(sources.map((s) => [s.id, s]));
  const glossaryTerms = new Set<string>();
  const { cite, paragraph: checkParagraph } = paragraphChecks({ known, excerpts, glossaryTerms, pages, tokens: COVERAGE_TOKENS, errors });

  const glossary: GlossaryEntry[] = [...(budget.glossary ?? [])];
  const terms = new Set(glossary.map((g) => g.term.toLowerCase()));
  for (const g of file.glossary) {
    const where = `coverage.json glossary "${g.term}"`;
    if (terms.has(g.term.toLowerCase())) errors.push(`${where}: already in the glossary`);
    terms.add(g.term.toLowerCase());
    for (const ref of [g, ...(g.also ?? [])]) cite(ref, where);
    checkNumbers(g.definition, [g, ...(g.also ?? [])], where, errors);
    glossary.push(g);
  }
  // A glossary that was alphabetical (Fremont's, as the City prints it) stays alphabetical.
  const sorted = (budget.glossary ?? []).every((g, i, a) => i === 0 || a[i - 1].term.localeCompare(g.term) <= 0);
  if (sorted) glossary.sort((a, b) => a.term.localeCompare(b.term));
  for (const g of glossary) glossaryTerms.add(g.term);

  const ids = file.questions.map((q) => q.id);
  if (ids.join() !== COVERAGE_QUESTIONS.join()) errors.push(`coverage.json: questions must be ${COVERAGE_QUESTIONS.join(', ')}, in that order; got ${ids.join(', ')}`);
  for (const q of file.questions) {
    if (!q.question.trim() || !q.paragraphs.length) errors.push(`coverage.json ${q.id}: needs a question and at least one paragraph`);
    q.paragraphs.forEach((p, i) => checkParagraph(p, `coverage.json ${q.id} paragraph ${i + 1}`));
    for (const a of q.agencies ?? []) {
      const where = `coverage.json ${q.id} agency "${a.name}"`;
      if (!a.cites.length) errors.push(`${where}: name an agency only with a source that says it serves the city`);
      a.cites.forEach((c) => cite(c, where));
      checkNumbers(`${a.name} ${a.does}`, a.cites, where, errors);
    }
  }

  if (!file.overview?.text?.trim()) errors.push('coverage.json overview: needs its line');
  else checkParagraph(file.overview, 'coverage.json overview');

  return { budget: { ...budget, sources, glossary, coverage: { questions: file.questions, overview: file.overview } }, errors };
}

/** Every number in our words must be in a quote they rest on: a typed-in "$68.9M" fails the build. */
function checkNumbers(text: string, cites: DocRef[], where: string, errors: string[]) {
  // Whole numbers, not substrings: "1" in "$1,000" doesn't vouch for a "1%".
  const quoted = new Set(cites.flatMap((c) => numbersIn(normalize(c.quote))));
  for (const n of numbersIn(text)) if (!quoted.has(n)) errors.push(`${where}: ${n} isn't in any quote it cites`);
}
