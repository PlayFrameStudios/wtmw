/**
 * "Money voters set aside" (#66): budget.json's `voterTaxes`, grouped as the City's own words make them. A special tax
 * may pay only for its stated purpose; a general tax goes to the General Fund; a bond is borrowing a property tax repays.
 * A cell no City document we use fills says so, in the same words everywhere, and is never estimated.
 */
import type { CityBudget, DocRef, StepNote, VoterTax, VoterTaxGroup } from '../data/types.ts';
import { shortMoney } from './format.ts';
import type { Figure } from './receipts.ts';

export const NOT_IN_SOURCES = "Not in the City's documents we use";

export const GROUP_TITLES: Record<VoterTaxGroup, string> = {
  special: 'Special taxes: can pay only for their stated purpose',
  general: 'General taxes: go to the General Fund',
  bonds: 'Bonds voters approved: repaid by a property tax',
};
const ORDER: VoterTaxGroup[] = ['special', 'general', 'bonds'];

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const countWord = (n: number) => WORDS[n] ?? String(n);

/** "$23.5M"; under $1M, whole dollars. */
const money = (v: number) => (Math.abs(v) >= 1e6 ? shortMoney(v) : `$${v.toLocaleString('en-US')}`);

export interface VoterTaxView {
  tax: VoterTax;
  amount?: { figure: Figure; text: string };
}

export interface VoterTaxGroupView {
  group: VoterTaxGroup;
  title: string;
  taxes: VoterTaxView[];
  /** The special taxes' amounts added up, by us: the City prints no total. */
  sum?: { figure: Figure; text: string; label: string; missing: string[] };
}

export function voterTaxesView(b: CityBudget): VoterTaxGroupView[] | undefined {
  const v = b.voterTaxes;
  if (!v?.taxes.length) return undefined;
  return ORDER.flatMap((group) => {
    const taxes = v.taxes.filter((t) => t.group === group);
    if (!taxes.length) return [];
    const views = taxes.map((tax): VoterTaxView => ({
      tax,
      ...(tax.amount
        ? { amount: { figure: { value: tax.amount.value, label: `${tax.name}, ${tax.amount.as}`, ref: tax.amount.cite, tone: 'neutral' }, text: money(tax.amount.value) } }
        : {}),
    }));
    const s = group === 'special' ? v.specialSum : undefined;
    const counted = taxes.filter((t) => t.amount);
    const sum: VoterTaxGroupView['sum'] = s && {
      figure: {
        value: s.value,
        label: `Our sum of the City's ${countWord(s.count)} estimates, ${s.as}`,
        ref: s.cites[0],
        related: [...new Set(s.cites.slice(1).map((c) => c.source))],
        tone: 'neutral',
        parts: counted.map((t) => ({ label: t.name, value: t.amount!.value })),
      },
      text: money(s.value),
      label: `our sum of the City's ${countWord(s.count)} estimates (${s.as})`,
      missing: taxes.filter((t) => !t.amount).map((t) => t.name),
    };
    return [{ group, title: GROUP_TITLES[group], taxes: views, ...(sum ? { sum } : {}) }];
  });
}

/**
 * Berkeley's Safe Streets tax (#66): the City's property-tax page prints its residential rate as 0.17482, the FY 2027
 * levy ordinance as $0.17842. The page uses the ordinance; the Sources page's known-gap card shows both, each cited.
 */
export function safeStreetsRates(b: CityBudget): { web: StepNote; ordinance: DocRef; rate: string } | undefined {
  const tax = b.voterTaxes?.taxes.find((t) => t.id === 'safe-streets');
  const web = tax?.notes.find((n) => n.cites.some((c) => c.page === undefined));
  const ordinance = tax?.rate?.cites.find((c) => c.page !== undefined);
  const rate = ordinance && /\$0\.\d+/.exec(ordinance.quote)?.[0];
  return web && ordinance && rate ? { web, ordinance, rate } : undefined;
}
