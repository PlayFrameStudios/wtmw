/**
 * Questions people ask (#54): one site-wide FAQ (data/site/faq.json, at /faq/) and one per city
 * (data/cities/{city}/faq.json, at {city}/faq/). Both pass the paragraph checks the coverage block uses (#51):
 * every quote is on its cited page, every number in our words is in a quote the paragraph cites or comes
 * from a token the page fills from budget.json with its receipt, and a paragraph with neither says why.
 * The site-wide answers cite only sources that aren't any one city's books; a city's answers give that
 * city's numbers and link the site-wide answer (faq:id) for the general part instead of repeating it.
 */
import { COVERAGE_TOKENS, paragraphChecks } from './coverage.ts';
import { checkQuote, normalize, type Excerpts } from './documents.ts';
import { nextNumber } from './source-numbers.ts';
import type { CityBudget, CityFaq, DocRef, FaqAmount, FaqQuestion, Source } from './types.ts';

type NewSource = Omit<Source, 'number' | 'row'>;

export interface SiteFaqFile {
  note?: string;
  sources: NewSource[];
  questions: FaqQuestion[];
}

export interface CityFaqFile {
  note?: string;
  /** Sources this FAQ adds, numbered after the city's others: the City's own documents ("city") or anyone else's ("other"). */
  sources: NewSource[];
  labels?: CityFaq['labels'];
  amounts?: Record<string, FaqAmount>;
  questions: FaqQuestion[];
}

const NUMBER = /\d[\d,.]*\d|\d/g;
const withCommas = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 });
/**
 * Whether a quote prints `amount`: in dollars ("130,915,603"), in thousands ("130,915") or in millions
 * ("64.915"), the ways budget tables do. A thousands or millions reading must be exact, not rounded.
 */
export function quotePrints(quote: string, amount: number): boolean {
  const printed = new Set([...normalize(quote).matchAll(NUMBER)].map((m) => m[0].replace(/[.,]+$/, '')));
  const ways = [withCommas(amount)];
  if (amount % 1000 === 0) ways.push(withCommas(amount / 1000));
  // Millions, as tables print them ("6.690", "64.915"): only to as many places as the amount is exact.
  for (const places of [1, 2, 3]) if (Math.round(amount / 10 ** (6 - places)) * 10 ** (6 - places) === amount) ways.push((amount / 1e6).toFixed(places));
  return ways.some((w) => printed.has(w));
}

/** Links a site-wide answer can make without a URL that changes per page: the issue templates. */
export const SITE_LINKS = ['report-error', 'request-city'] as const;
/** The tokens a city answer may use besides the coverage block's: a department's General Fund amount, the departments' total, a share per $100, a figure in budget.json. */
export const FAQ_TOKENS = [...COVERAGE_TOKENS, 'depts'] as const;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A path in budget.json ("pension.contribution", "personnelAndPension.composition.0"), or undefined. */
export function atPath(budget: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), budget);
}

/** A figure a {fig:path} token can show: an amount with the document it came from. */
export const isFigureAt = (v: unknown): v is { amount: number; source: string; label?: string; name?: string } =>
  !!v && typeof v === 'object' && typeof (v as { amount?: unknown }).amount === 'number' && typeof (v as { source?: unknown }).source === 'string';

/**
 * What a {fig:path} token shows: a record with an amount and its source, or a number inside one
 * ("capitalProgram.lines.1.years.2027"), whose receipt is the nearest record above it that names a source.
 */
export function figureAt(budget: unknown, path: string): { value: number; ref: { source: string; label?: string; name?: string }; leaf: boolean } | undefined {
  const v = atPath(budget, path);
  if (isFigureAt(v)) return { value: v.amount, ref: v, leaf: false };
  if (typeof v !== 'number') return undefined;
  const keys = path.split('.');
  for (let n = keys.length - 1; n > 0; n--) {
    const up = atPath(budget, keys.slice(0, n).join('.'));
    if (up && typeof up === 'object' && typeof (up as { source?: unknown }).source === 'string') return { value: v, ref: up as { source: string }, leaf: true };
  }
  return undefined;
}

function checkQuestions(questions: FaqQuestion[], file: string, errors: string[], paragraph: (p: FaqQuestion['paragraphs'][number], where: string) => void, siteIds?: readonly string[]) {
  const seen = new Set<string>();
  if (!questions.length) errors.push(`${file}: needs at least one question`);
  for (const q of questions) {
    const where = `${file} ${q.id}`;
    if (!ID.test(q.id)) errors.push(`${where}: an id is the answer's anchor, so lowercase words joined by hyphens`);
    if (seen.has(q.id)) errors.push(`${where}: a second question with this id`);
    seen.add(q.id);
    if (!q.question.trim().endsWith('?')) errors.push(`${where}: the question should be one, ending with "?"`);
    if (!q.paragraphs.length) errors.push(`${where}: needs an answer`);
    q.paragraphs.forEach((p, i) => paragraph(p, `${where} paragraph ${i + 1}`));
    if (q.see?.length && !siteIds) errors.push(`${where}: "see" links a city's answer to the site-wide one; the site-wide FAQ has nothing to point to`);
    for (const s of q.see ?? []) if (siteIds && !siteIds.includes(s)) errors.push(`${where}: sees "${s}", which isn't a site-wide FAQ answer`);
  }
}

function numbered(sources: NewSource[], first: number, file: string, errors: string[]): Source[] {
  return sources.map((s, i) => {
    if (s.id !== `S${first + i}`) errors.push(`${file}: source ${i + 1} is ${s.id}, expected S${first + i}`);
    return { ...s, number: first + i };
  });
}

/** The site-wide FAQ: its own sources (S1…), none of them a city's books, and no figures from any city. */
export function checkSiteFaq(file: SiteFaqFile, excerpts: Excerpts): string[] {
  const errors: string[] = [];
  const where = 'data/site/faq.json';
  const sources = numbered(file.sources, 1, where, errors);
  for (const s of sources) if (s.type !== 'other') errors.push(`${where} ${s.id}: type "${s.type}"; the site-wide FAQ cites only sources that aren't a city's own books ("other")`);
  const { paragraph } = paragraphChecks({
    known: new Map(sources.map((s) => [s.id, s])),
    excerpts,
    glossaryTerms: new Set(),
    pages: [],
    tokens: [],
    errors,
    anchors: file.questions.map((q) => q.id),
    siteLinks: SITE_LINKS,
  });
  checkQuestions(file.questions, where, errors, paragraph);
  return errors;
}

/**
 * A city's FAQ into its budget.json: sources after the city's others, answers checked against its pages,
 * glossary, budget.json figures and the site-wide FAQ's ids (`siteIds`).
 */
export function applyFaq(
  budget: CityBudget,
  file: CityFaqFile,
  excerpts: Excerpts,
  ctx: { publisher: string; pages: readonly string[]; siteIds: readonly string[]; families: readonly string[] },
): { budget: CityBudget; errors: string[] } {
  const errors: string[] = [];
  const where = 'faq.json';
  const added = numbered(file.sources, nextNumber(budget.sources), where, errors);
  for (const s of added) {
    const own = s.publisher === ctx.publisher;
    if (own && s.type !== 'city') errors.push(`${where} ${s.id}: published by ${ctx.publisher}, so type "city"`);
    if (!own && s.type === 'city') errors.push(`${where} ${s.id}: type "city", but published by ${s.publisher}, not ${ctx.publisher}`);
  }
  const sources = [...budget.sources, ...added];
  const departments = budget.generalFund[0].lines.filter((l) => l.kind === 'department').map((l) => l.id);
  const labels = file.labels ?? {};
  const amounts = file.amounts ?? {};
  const used = new Set<string>();
  const usedAmounts = new Set<string>();
  const checkToken = (t: string): string | undefined => {
    const [kind, arg] = t.split(':');
    if (kind === 'dept') return departments.includes(arg) ? undefined : `no department "${arg}" in the General Fund table`;
    if (kind === 'per100') return departments.includes(arg) || ctx.families.includes(arg) ? undefined : `no department or family "${arg}"`;
    if (kind === 'amount') {
      if (!amounts[arg]) return `no "${arg}" in amounts`;
      usedAmounts.add(arg);
      return undefined;
    }
    if (kind === 'fig') {
      const f = figureAt(budget, arg);
      if (!f) return `budget.json has no figure (an amount, or a number inside a record that names its source) at ${arg}`;
      used.add(arg);
      // A number inside a record (one year of a line) needs words of its own; a record can lend its name.
      return labels[arg] || (!f.leaf && (f.ref.label || f.ref.name)) ? undefined : `its receipt needs a label: add "${arg}" to labels`;
    }
    return 'not a token here';
  };
  const { paragraph } = paragraphChecks({
    known: new Map(sources.map((s) => [s.id, s])),
    excerpts,
    glossaryTerms: new Set((budget.glossary ?? []).map((g) => g.term)),
    pages: ctx.pages,
    tokens: FAQ_TOKENS,
    errors,
    checkToken,
    faqIds: ctx.siteIds,
    anchors: file.questions.map((q) => q.id),
    sitePaths: true,
  });
  const known = new Set(sources.map((s) => s.id));
  for (const [id, a] of Object.entries(amounts)) {
    const at = `${where} amounts.${id}`;
    if (!a.label?.trim()) errors.push(`${at}: needs a label for its receipt`);
    if (!known.has(a.source)) errors.push(`${at}: unknown source ${a.source}`);
    else {
      try {
        checkQuote(a, excerpts, at);
      } catch (e) {
        errors.push((e as Error).message);
      }
      if (!quotePrints(a.quote, a.amount)) errors.push(`${at}: ${a.amount} isn't printed in its quote, in dollars, thousands or millions`);
    }
  }
  checkQuestions(file.questions, where, errors, paragraph, ctx.siteIds);
  for (const id of Object.keys(amounts)) if (!usedAmounts.has(id)) errors.push(`${where} amounts: "${id}" is used by no {amount:${id}} token`);
  for (const k of Object.keys(labels)) if (!used.has(k)) errors.push(`${where} labels: "${k}" labels no {fig:${k}} token`);
  const faq: CityFaq = { questions: file.questions, ...(file.labels ? { labels: file.labels } : {}), ...(file.amounts ? { amounts: file.amounts } : {}) };
  return { budget: { ...budget, sources, faq }, errors };
}

/** Every cite in a FAQ, for the excerpt script and tests. */
export const faqCites = (questions: FaqQuestion[]): DocRef[] => questions.flatMap((q) => q.paragraphs.flatMap((p) => p.cites ?? []));
