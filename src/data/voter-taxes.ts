/**
 * Money voters set aside (#66), from documents.json's `voterTaxes`: each voter-approved City tax, with what kind it
 * is and what it may pay for in its source's own words, when voters approved it, its rate and its FY2027 amount.
 *
 * Every quote is checked against its page, and the amount is parsed from its quote, never typed in. The group is not
 * our judgment either: a special tax's kind quote must say "special", a general tax's "general" or "General Fund", a
 * bond's "general obligation". A cell no City document we use fills is `{ "unsourced": true }` and nothing else, so
 * the page can say so; the build fails if one also carries a figure or a quote.
 */
import { checkNote, checkQuote, normalize, type Excerpts } from './documents.ts';
import { printedNumbers } from './staff-costs.ts';
import type { CityBudget, DocRef, SourceId, StepNote, VoterTax, VoterTaxGroup, VoterTaxes } from './types.ts';

export interface Unsourced {
  unsourced: true;
}

export interface VoterTaxAmountSpec {
  source: SourceId;
  page?: number;
  quote: string;
  /** The start of the quote: a row's label as printed, or a sentence's opening words. Its figures follow it. */
  label: string;
  /** Which of the figures after the label is the amount, from 0. */
  figure: number;
  /** 1000 for a table in thousands of dollars. */
  unit?: number;
  /** What kind of figure it is ("FY2027 estimate"); every number in it must be on the cited page. */
  as: string;
}

export interface VoterTaxSpec {
  id: string;
  name: string;
  group: VoterTaxGroup;
  kind: DocRef;
  purpose: DocRef | Unsourced;
  approved: StepNote | Unsourced;
  rate: StepNote | Unsourced;
  amount: VoterTaxAmountSpec | Unsourced;
  notes?: StepNote[];
}

export interface VoterTaxesSpec {
  taxes: VoterTaxSpec[];
}

/** What a kind quote must say for each group. */
export const KIND_WORDS: Record<VoterTaxGroup, RegExp> = {
  special: /\bspecial (parcel )?tax/i,
  general: /\bgeneral (tax|municipal purposes|fund)\b/i,
  bonds: /\bgeneral obligation\b/i,
};

const isUnsourced = (v: unknown): v is Unsourced => !!v && typeof v === 'object' && 'unsourced' in v;

export function applyVoterTaxes(budget: CityBudget, spec: VoterTaxesSpec | undefined, excerpts: Excerpts, where: string): { budget: CityBudget; errors: string[] } {
  if (!spec) return { budget, errors: [] };
  const errors: string[] = [];
  const known = new Set<string>(budget.sources.map((s) => s.id));
  const at = `${where} voterTaxes`;
  const quoted = (ref: DocRef, here: string) => {
    if (!known.has(ref.source)) {
      errors.push(`${here}: unknown source ${ref.source}`);
      return false;
    }
    try {
      checkQuote(ref, excerpts, here);
      return true;
    } catch (e) {
      errors.push((e as Error).message);
      return false;
    }
  };
  // An unsourced cell says only that: a figure or quote beside it would be shown as "not in the City's documents".
  const cell = <T>(v: T | Unsourced, here: string): T | null => {
    if (!isUnsourced(v)) return v;
    if (v.unsourced !== true || Object.keys(v).length !== 1) errors.push(`${here}: an unsourced cell can't carry anything else`);
    return null;
  };
  const note = (n: StepNote | null, here: string) => {
    if (n) errors.push(...checkNote(n, excerpts, known, here));
    return n;
  };

  const ids = new Set<string>();
  const taxes = spec.taxes.map((t): VoterTax => {
    const here = `${at} ${t.id}`;
    if (ids.has(t.id)) errors.push(`${here}: two taxes have this id`);
    ids.add(t.id);
    if (!(t.group in KIND_WORDS)) errors.push(`${here}: group must be special, general or bonds`);
    else if (quoted(t.kind, `${here} kind`) && !KIND_WORDS[t.group].test(normalize(t.kind.quote)))
      errors.push(`${here} kind: "${t.kind.quote}" doesn't say it's ${t.group === 'bonds' ? 'a general obligation bond' : `a ${t.group} tax`}`);

    const purpose = cell(t.purpose, `${here} purpose`);
    if (purpose) quoted(purpose, `${here} purpose`);
    const approved = note(cell(t.approved, `${here} approved`), `${here} approved`);
    const rate = note(cell(t.rate, `${here} rate`), `${here} rate`);

    let amount: VoterTax['amount'] = null;
    const a = cell(t.amount, `${here} amount`);
    if (a) {
      const cite: DocRef = { source: a.source, ...(a.page !== undefined ? { page: a.page } : {}), quote: a.quote };
      if (quoted(cite, `${here} amount`)) {
        const page = normalize(excerpts[a.source]![String(a.page ?? 1)]);
        if (!normalize(a.quote).startsWith(normalize(a.label))) errors.push(`${here} amount: the quote doesn't start with its label "${a.label}"`);
        else {
          const figures = printedNumbers(a.quote.replace(/\s+/g, ' ').trim().slice(a.label.replace(/\s+/g, ' ').trim().length));
          const f = figures[a.figure];
          if (!f || f.percent) errors.push(`${here} amount: the quote has no dollar figure ${a.figure} after its label`);
          else amount = { value: Math.round(f.value * (a.unit ?? 1)), as: a.as, cite };
        }
        for (const d of a.as.match(/\d+/g) ?? []) if (!page.includes(d)) errors.push(`${here} amount: "${a.as}": ${d} isn't on ${a.source} page ${a.page ?? 1}`);
      }
    }
    const notes = (t.notes ?? []).map((n, i) => note(n, `${here} note ${i + 1}`)!);
    return { id: t.id, name: t.name, group: t.group, kind: t.kind, purpose, approved, rate, amount, notes };
  });

  // Our sum of the special taxes, when they are the same kind of figure: the City prints no total.
  const special = taxes.filter((t) => t.group === 'special' && t.amount);
  const kinds = new Set(special.map((t) => t.amount!.as));
  const specialSum: VoterTaxes['specialSum'] =
    special.length > 1 && kinds.size === 1
      ? { value: special.reduce((s, t) => s + t.amount!.value, 0), count: special.length, as: [...kinds][0], cites: special.map((t) => t.amount!.cite) }
      : undefined;

  return { budget: { ...budget, voterTaxes: { taxes, ...(specialSum ? { specialSum } : {}) } }, errors };
}
