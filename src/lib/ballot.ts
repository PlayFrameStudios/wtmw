/**
 * Figures for a city's Ballot page. Strictly neutral: both outcomes are built
 * by the same function and rendered by the same template. Election results,
 * when they're in, are a data change in data/cities/{city}/ballot.json.
 */
import type { GapBudget, SourceId } from '../data/types.ts';
import { dataDirOf } from './cities.ts';
import type { Figure } from './receipts.ts';

export type Status = 'pending' | 'passed' | 'failed';
export type Outcome = 'passes' | 'fails';

/** A statement's source: the PDF page (none for a web page) and the sentence it says, checked against the excerpts at build time. */
export interface Cite {
  source: SourceId;
  page?: number;
  quote: string;
}

/** A City document a voter can open to read more about a measure. */
export interface ReadLink {
  label: string;
  source: SourceId;
}

export interface Measure {
  status: Status;
  yesShare: number | null;
  read: ReadLink[];
}

/** One line of a scenario card. Both outcomes cite the same documents. */
export interface Row {
  key: string;
  label: string;
  passes: { text: string; cite: Cite; also: SourceId[] };
  fails: { text: string; cite: Cite; also: SourceId[] };
}

export interface BallotFile {
  election: string;
  measures: Record<'salesTax' | 'bond', Measure>;
  rows: Row[];
  /** "as amended by subsequent Council action": the budget was adopted with changes the figures shown don't include. */
  adoption: { cite: Cite };
  /** Shown identically on both cards, under the position counts. */
  countsCaveat: { text: string; cites: Cite[] };
}

const files = import.meta.glob<BallotFile>('/data/cities/*/*/*/ballot.json', { eager: true, import: 'default' });

export function ballotFileFor(cityPath: string): BallotFile {
  const f = files[`${dataDirOf(cityPath)}ballot.json`];
  if (!f) throw new Error(`${cityPath} has no ballot.json`);
  return f;
}

const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Heading and per-outcome result marks, from the measures' status. `measure` is "Measure V", or "the sales tax" before it has a letter. */
export function ballotState(file: BallotFile, measure = 'the sales tax') {
  const status = file.measures.salesTax.status;
  const result: Outcome | null = status === 'passed' ? 'passes' : status === 'failed' ? 'fails' : null;
  return {
    decided: result !== null,
    result,
    heading: result ? `${measure.charAt(0).toUpperCase()}${measure.slice(1)} ${status}. Here's what the city's plan says happens now.` : `What changes if ${measure} passes or fails`,
    lede: result
      ? "The city's plan was built in two versions, one for each result. This is the one that now applies, with the other kept for comparison."
      : `The election is ${longDate(file.election)}. The City built its FY27-28 budget in two versions, one for each result. We don't take a side.`,
    bond: file.measures.bond.status,
  };
}

const STATUSES: Status[] = ['pending', 'passed', 'failed'];

/** Throws on a ballot.json the page can't render honestly. */
export function checkBallotFile(file: BallotFile, b: GapBudget, where = 'ballot.json') {
  for (const [k, m] of Object.entries(file.measures)) {
    if (!STATUSES.includes(m.status)) throw new Error(`${where}: ${k}.status must be one of ${STATUSES.join(', ')}, got "${m.status}"`);
  }
  const known = new Set(b.sources.map((s) => s.id));
  const cites = (c: Cite, at: string) => {
    if (!known.has(c.source)) throw new Error(`${where}: ${at} cites unknown source ${c.source}`);
    if (!c.quote) throw new Error(`${where}: ${at} needs a quote`);
  };
  for (const r of file.rows) {
    for (const o of ['passes', 'fails'] as const) {
      const x = r[o];
      if (!x?.text) throw new Error(`${where}: rows.${r.key}.${o} needs text`);
      cites(x.cite, `rows.${r.key}.${o}`);
      for (const id of x.also) if (!known.has(id)) throw new Error(`${where}: rows.${r.key}.${o} cites unknown source ${id}`);
    }
    // Neutral by construction: both outcomes cite the same documents, so neither reads as better sourced.
    const docs = (o: 'passes' | 'fails') => [r[o].cite.source, ...r[o].also].join();
    if (docs('passes') !== docs('fails')) throw new Error(`${where}: rows.${r.key} cites ${docs('passes')} if it passes but ${docs('fails')} if it fails`);
  }
  // Both measures offer the same kinds of document, in the same order: neither looks better documented.
  const reads = (k: 'salesTax' | 'bond') => file.measures[k].read.map((r) => r.label).join(', ');
  if (!file.measures.salesTax.read.length) throw new Error(`${where}: measures.salesTax.read is empty`);
  if (reads('salesTax') !== reads('bond')) throw new Error(`${where}: the sales tax links ${reads('salesTax')} but the bond links ${reads('bond')}`);
  for (const k of ['salesTax', 'bond'] as const)
    for (const r of file.measures[k].read) {
      const s = b.sources.find((x) => x.id === r.source);
      if (!s) throw new Error(`${where}: measures.${k}.read cites unknown source ${r.source}`);
      if (s.type !== 'city') throw new Error(`${where}: measures.${k}.read links ${r.source}, which isn't a City document`);
    }
  cites(file.adoption.cite, 'adoption');
  if (!file.countsCaveat.text || !file.countsCaveat.cites.length) throw new Error(`${where}: countsCaveat needs text and cites`);
  file.countsCaveat.cites.forEach((c, i) => cites(c, `countsCaveat.cites[${i}]`));
}

export function ballotPage(b: GapBudget, file: BallotFile, short: Record<string, string> = {}) {
  checkBallotFile(file, b);
  const fy27 = b.departmentReductions.find((y) => y.year === 2027)!;
  const t = b.citedFacts.salesTax;
  const bond = b.citedFacts.bond;
  const d = b.documentFacts;
  const cite = (r: { source: SourceId; page?: number; quote: string }): Cite => ({ source: r.source, ...(r.page ? { page: r.page } : {}), quote: r.quote });
  const pos = (k: 'with-sales-tax' | 'without-sales-tax') => b.fte.positions.find((p) => p.key === k)!;
  const fte = (k: 'with-sales-tax' | 'without-sales-tax') => b.fte.scenarios.find((s) => s.key === k)!;
  const bridge = b.oneTimeResources.uses.find((u) => /sales & use tax/i.test(u.label))!;

  // One builder for both outcomes: same fields, same order, same wording.
  const scenario = (outcome: Outcome) => {
    const key = outcome === 'passes' ? 'with-sales-tax' : 'without-sales-tax';
    const p = pos(key);
    const f = fte(key);
    const cuts = outcome === 'passes' ? fy27.total.netReduction : fy27.total.reduction;
    const cutsPct = outcome === 'passes' ? fy27.total.netReductionPct : fy27.total.reductionPct;
    const word = outcome === 'passes' ? 'passes' : 'fails';
    return {
      outcome,
      positions: { total: p.total, vacant: p.vacant, filled: p.filled, figure: { value: p.total, label: `Positions eliminated if the sales tax ${word} (${p.vacant} vacant, ${p.filled} filled)`, ref: p, format: 'number', tone: 'neutral' } satisfies Figure },
      cuts: { value: cuts, pct: cutsPct, figure: { value: cuts, label: `FY2027 department cuts if the sales tax ${word}`, ref: fy27.total, tone: 'short' } satisfies Figure },
      workforce: {
        after: f.netFte,
        before: f.adoptedFte,
        figure: { value: f.netFte, label: `City workforce (FTE) after FY2027 cuts if the sales tax ${word}`, ref: f, format: 'number', tone: 'neutral' } satisfies Figure,
      },
      rows: file.rows.map((r) => ({ key: r.key, label: r.label, ...r[outcome] })),
    };
  };
  const scenarios = [scenario('passes'), scenario('fails')];
  const softened = fy27.departments.filter((d) => d.salesTaxAllocation > 0).sort((a, c) => c.salesTaxAllocation - a.salesTaxAllocation);

  return {
    state: ballotState(file, `Measure ${d.salesTaxMeasure.letter}`),
    salesTax: {
      fact: t,
      letter: d.salesTaxMeasure.letter,
      letterCite: cite(d.salesTaxMeasure),
      /** The City's estimate, as the City Attorney's impartial analysis and the Council report both state it. */
      revenue: { low: d.salesTaxRevenue.low, high: d.salesTaxRevenue.high, cites: [cite(d.salesTaxRevenue), cite(d.salesTaxRevenueCouncil)] },
      term: { start: d.salesTaxTerm.start, until: d.salesTaxTerm.until, cite: cite(d.salesTaxTerm) },
      general: cite(d.salesTaxGeneral),
      official: { title: d.salesTaxTitle.title, cite: cite(d.salesTaxTitle) },
      read: file.measures.salesTax.read,
      figure: { value: t.rate, label: `Measure ${d.salesTaxMeasure.letter}: proposed local sales tax, ${t.election} ballot`, ref: t, format: 'percent', tone: 'neutral' } satisfies Figure,
      bridge: { value: bridge.amount, label: 'One-time money used as a bridge until the sales-tax vote, FY2027-28', ref: bridge, tone: 'one-time' } satisfies Figure,
    },
    bond: {
      fact: bond,
      letter: d.bondMeasure.letter,
      letterCite: cite(d.bondMeasure),
      official: { title: d.bondTitle.title, cite: cite(d.bondTitle) },
      read: file.measures.bond.read,
      cost: { perHundredK: d.bondCost.perHundredK, years: d.bondCost.years, perYear: d.bondCost.perYear, cite: cite(d.bondCost) },
      peak: { perHundredK: d.bondPeak.perHundredK, from: d.bondPeak.from, cite: cite(d.bondPeak) },
      audit: { everyYears: d.bondAudit.everyYears, cite: cite(d.bondAudit) },
      /** The FY27–31 CIP's unfunded capital and maintenance need: the City's newest figure. */
      need: { value: d.capitalNeed.amount, label: 'Unfunded capital and maintenance need, FY2027–31 CIP', ref: d.capitalNeed, tone: 'neutral' } satisfies Figure,
      figure: { value: bond.amount, label: `Measure ${d.bondMeasure.letter}: proposed infrastructure bond, ${bond.election} ballot`, ref: bond, tone: 'neutral' } satisfies Figure,
      /** The bond-planning page's earlier range, kept for comparison. */
      backlog: { value: b.citedFacts.backlog.low, label: 'Unfunded infrastructure and deferred maintenance, earlier City estimate (low end)', ref: b.citedFacts.backlog, tone: 'neutral' } satisfies Figure,
    },
    scenarios,
    /** True of both outcomes' counts alike, so the page says it once, under both. */
    countsCaveat: file.countsCaveat,
    /** Same scale for both pictograms: the larger layoff count, rounded up to a full row of 20. */
    pictogramSlots: Math.ceil(Math.max(...scenarios.map((s) => s.positions.filled)) / 20) * 20,
    softened: softened.map((d) => short[d.id] ?? d.name),
    plan: b.sources.find((s) => s.id === 'S1')!,
    adoption: { date: d.adoption.date, cite: file.adoption.cite },
    /** The City's own words: one-time funds hold off the cuts until the vote. */
    oneTimeDelay: cite(d.oneTimeDelay),
  };
}
