/**
 * Shape of data/cities/{country}/{state}/{city}/budget.json.
 *
 * Every figure the site shows comes from here, and every record says where
 * it came from: `source` is the primary document (an S-number from the
 * Sources table), `related` lists other documents that report the same
 * figure, and `table` + `row` point at the workbook cell row it was read
 * from, so a receipt can say "Deficit Bridge FY27-28, row 13".
 *
 * Bump SCHEMA_VERSION when a field is renamed or removed.
 */

export const SCHEMA_VERSION = 1;

export type SourceId = `S${number}`;

/** One amount per fiscal year, keyed by the year the fiscal year ends in: `{ "2027": …, "2028": … }`. */
export type ByYear = Record<number, number>;

export interface Ref {
  source: SourceId;
  related?: SourceId[];
  /** Workbook tab name. */
  table: string;
  /** 1-based workbook row number. */
  row: number;
}

/**
 * Where a fact read from a City PDF came from: the source, the PDF page (as the
 * PDF viewer numbers it, "Page N of 260", not the printed folio) and the exact
 * sentence, which the build checks against source/excerpts/{source}.json.
 */
/** A plain-language explanation and the City wording it rests on. */
export interface StepNote {
  text: string;
  cites: DocRef[];
}

export interface DocRef {
  source: SourceId;
  related?: SourceId[];
  /** Absent for a web page. */
  page?: number;
  quote: string;
}

export interface Source {
  id: SourceId;
  number: number;
  /** "City of Berkeley", "Berkeleyside", … */
  publisher: string;
  title: string;
  /** The body that issued it, when the source names one ("Budget & Finance Cmte"). */
  committee?: string;
  /** ISO date, as precise as the source gives it: "2026-04-16" or "2026-04". */
  date?: string;
  /** The date exactly as the workbook writes it ("Apr 16 2026"). */
  dateLabel?: string;
  url: string;
  /** city = a City of Berkeley document (primary); news = reporting (context). */
  type: 'city' | 'news';
  usedFor: string;
  /** Row on the Sources & Links tab; absent for sources added from documents.json. */
  row?: number;
}

export interface RevenueLine extends Ref {
  name: string;
  fy2026Adopted: number;
  fy2026MidYearActual: number;
  fy2025MidYearActual: number;
  /** Derived: fy2026MidYearActual / fy2026Adopted; null when nothing was budgeted. */
  pctOfAdoptedReceived: number | null;
  /** Derived: fy2026MidYearActual - fy2025MidYearActual. */
  changeVsFy2025: number;
  /** Derived: changeVsFy2025 / fy2025MidYearActual; null when FY2025 was zero. */
  changeVsFy2025Pct: number | null;
}

export interface Revenue {
  title: string;
  /** The tab's note on how to read it (mid-year = Jul–Dec, …). */
  note: string;
  lines: RevenueLine[];
  /** The workbook's TOTAL row, tied against the sum of `lines` by validation. */
  total: RevenueLine;
}

export type BridgeStepKind = 'estimate' | 'change' | 'subtotal' | 'total';

export interface BridgeStep extends Ref {
  key: string;
  label: string;
  kind: BridgeStepKind;
  years: ByYear;
}

export interface DeficitBridge {
  title: string;
  note: string;
  steps: BridgeStep[];
}

export interface DepartmentReduction extends Ref {
  /** Stable slug for URLs: "police", "odpa", "city-attorney". */
  id: string;
  name: string;
  /** Charter office (sets its own reductions; named in the tab's note). */
  charter: boolean;
  baseline: number;
  reduction: number;
  /** One-time money (reserves, Successor Agency transfer) softening this department's cut until the sales-tax vote; not tax revenue. */
  salesTaxAllocation: number;
  /** Derived: baseline - reduction. */
  budgetAfterReduction: number;
  /** Derived: reduction / baseline. */
  reductionPct: number;
  /** Derived: reduction - salesTaxAllocation (the cut if the sales tax passes). */
  netReduction: number;
  /** Derived: netReduction / baseline. */
  netReductionPct: number;
}

export interface DepartmentReductionTotal extends Ref {
  baseline: number;
  reduction: number;
  salesTaxAllocation: number;
  budgetAfterReduction: number;
  reductionPct: number;
  netReduction: number;
  netReductionPct: number;
}

export interface DepartmentReductions {
  /** The fiscal year, by the year it ends in (2027 = FY2027). */
  year: number;
  title: string;
  note: string;
  departments: DepartmentReduction[];
  total: DepartmentReductionTotal;
}

export interface FteScenario extends Ref {
  key: 'without-sales-tax' | 'with-sales-tax';
  label: string;
  /** The budget year the scenario is for; `adoptedFte` and `rif` are the year before. */
  year: number;
  adoptedFte: number;
  rif: number;
  baselineFte: number;
  reduction: number;
  /** Derived: baselineFte - reduction. */
  netFte: number;
  /** Derived: rif + reduction. */
  cumulativeRif: number;
  /** Derived: cumulativeRif / adoptedFte. */
  cumulativeReductionPct: number;
}

export interface PositionReduction extends Ref {
  key: 'without-sales-tax' | 'with-sales-tax';
  label: string;
  vacant: number;
  filled: number;
  /** Derived: vacant + filled. */
  total: number;
}

export interface Fte {
  title: string;
  note: string;
  scenarios: FteScenario[];
  positions: PositionReduction[];
}

export interface OneTimeItem extends Ref {
  label: string;
  amount: number;
}

export interface OneTimeResources {
  title: string;
  sources: OneTimeItem[];
  uses: OneTimeItem[];
  /** Derived sums. */
  totalSources: number;
  totalUses: number;
  remaining: number;
}

export interface CapitalLine extends Ref {
  name: string;
  category: string;
  years: ByYear;
  /** Derived: the sum of `years`. */
  total: number;
}

export interface CapitalProgram {
  title: string;
  lines: CapitalLine[];
  total: CapitalLine;
}

export interface CostComponent extends Ref {
  label: string;
  amount: number;
  note: string;
}

export interface UnfundedLiability extends Ref {
  asOf: string;
  amount: number;
  note: string;
}

export interface PersonnelAndPension {
  title: string;
  note: string;
  /** FY2026 General Fund cost composition (approximate, as cited). */
  composition: CostComponent[];
  compositionTotal: CostComponent;
  personnelSubtotal: CostComponent;
  unfundedLiabilities: UnfundedLiability[];
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  table: string;
  row: number;
}

/** A figure stated in a sentence of the workbook rather than a table cell. */
export interface CitedFact extends Ref {
  /** The sentence, verbatim. */
  text: string;
}

export interface CitedFacts {
  /** "Over 10 years: spending grew ~8%/yr vs revenue ~6.5%/yr". */
  growth: CitedFact & { years: number; spendingRate: number; revenueRate: number };
  /** The proposed local sales tax on the ballot: rate 0.005 = 0.5%. */
  salesTax: CitedFact & {
    rate: number;
    election: string;
    /** Berkeley's total sales-tax rate if it passes: 0.1075 = 10.75%. */
    newRate: number;
    /** Votes needed to pass: "simple majority". */
    threshold: string;
  };
  /** The proposed infrastructure bond on the ballot. */
  bond: CitedFact & { amount: number; election: string; threshold: string; repaidBy: string };
  /** Unfunded infrastructure and deferred maintenance, as a range. */
  backlog: CitedFact & {
    low: number;
    high: number;
    /** The asset inventory behind the estimate. Miles is text: the workbook says "300+". */
    sidewalkMiles: string;
    parks: number;
    buildings: number;
  };
}

/** One row of a City PDF table: `quote` is the row exactly as printed, so it's checked on its page like any quote. */
export interface DocCapitalPart extends DocRef {
  name: string;
  years: ByYear;
  /** Derived: the sum of `years`. */
  total: number;
}

export interface DocCapitalLine extends DocCapitalPart {
  /** "Enterprise Funds", "Special Revenue Funds", … as the table groups them. */
  fundType: string;
  /** For the General Fund's CIP fund: its program categories (Streets, Facilities, …), from the table that breaks it down. */
  parts?: DocCapitalPart[];
}

/** Facts from City documents published after the workbook (documents.json), each parsed from its quote. */
export interface DocumentFacts {
  salesTaxMeasure: DocRef & { letter: string };
  /** The City's estimate of yearly revenue. */
  salesTaxRevenue: DocRef & { low: number; high: number };
  salesTaxRevenueCouncil: DocRef & { low: number; high: number };
  /** ISO start date; `until` as the City Attorney words it. */
  salesTaxTerm: DocRef & { start: string; until: string };
  salesTaxGeneral: DocRef;
  bondMeasure: DocRef & { letter: string };
  /** Average yearly cost per $100,000 of assessed value, over `years`, raising `perYear`. */
  bondCost: DocRef & { perHundredK: number; years: number; perYear: number };
  bondPeak: DocRef & { perHundredK: number; from: string };
  bondAudit: DocRef & { everyYears: number };
  /** Adopted "as amended by subsequent Council action": amendments made at the meeting aren't in the staff report. */
  adoption: DocRef & { date: string };
  /** The gap as restated in the adoption staff report, in dollars (rounded to $10k, as written). */
  adoptionGap: DocRef & { years: ByYear };
  /** FY27–31 CIP "Capital & Maint. Need" total, and its stated yearly growth. */
  capitalNeed: DocRef & { amount: number };
  /** FY27 spending, all funds and General Fund (adoption report p.1): the sentence's rounded figure, the table's exact one. */
  allFunds: DocRef & { amount: number };
  generalFund: DocRef & { amount: number };
  capitalNeedGrowth: DocRef & { rate: number };
  /** "What is this step?": a plain sentence per deficit-bridge step (and the overview's grouped adjustments), with the S1 wording it rests on. */
  stepNotes: Record<string, StepNote>;
  /** Other cited sentences, keyed by where they're used: overview card 2's "Why?" (costDrivers, payAndBenefits); a Sources page known gap (auditorRevenues). */
  notes: Record<string, StepNote>;
  /** The City's official ballot titles ("Measure V - Transactions and Use (Sales) General Tax Measure (majority)"), split up. */
  salesTaxTitle: DocRef & { letter: string; title: string; vote: string };
  bondTitle: DocRef & { letter: string; title: string; vote: string };
  /** The adoption report: one-time funds delay cuts until the vote (the FY27 "bridge" is that money, not tax revenue). */
  oneTimeDelay: DocRef;
  /** The FY27–28 capital program by funding source, all funds: every fund with money in either year. */
  /** `quote` is the table's title as printed. */
  capitalProgram: DocRef & {
    lines: DocCapitalLine[];
    /** Derived: the sum of the lines (the table prints subtotals per fund type, which the build ties out, but no grand total). */
    total: { years: ByYear; total: number };
    /** The fund that is the General Fund's capital money ("Capital Improvements", the CIP fund). */
    generalFund: string;
  };
}

export interface CityBudget {
  schemaVersion: number;
  workbook: { file: string; sha256: string };
  /** From the workbook's README note; shown on every receipt. */
  notes: {
    /** Years the workbook covers, from its title: "FY2025–FY2028". */
    coverage: string;
    /** "Budgetary/cash basis" */
    basis: string;
    /** "Figures are from budget/planning documents … subject to revision. Not for investment-decision use." */
    caveat: string;
    table: string;
    row: number;
  };
  sources: Source[];
  revenue: Revenue;
  deficitBridge: DeficitBridge;
  departmentReductions: DepartmentReductions[];
  fte: Fte;
  oneTimeResources: OneTimeResources;
  capitalProgram: CapitalProgram;
  personnelAndPension: PersonnelAndPension;
  glossary: GlossaryEntry[];
  citedFacts: CitedFacts;
  documentFacts: DocumentFacts;
}

/** budget.json as the workbook alone produces it, before documents.json is merged in. */
export type WorkbookBudget = Omit<CityBudget, 'documentFacts'>;

/** A formula cell the workbook computed, next to what we computed for it. */
export interface CrossCheck {
  what: string;
  computed: number | null;
  cached: number;
}
