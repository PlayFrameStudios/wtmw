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

export const SCHEMA_VERSION = 2;

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
  /** For a figure read from a table row: the heading of its column, as printed. */
  column?: string;
  /**
   * Set when the page is a scanned image with no text to check against (#59): the quote is our reading of the
   * printed line, not checked, and `image` is the rendered page the site serves ("/us/ca/lafayette/scans/S1-p17.png").
   * The build accepts one only on a page whose extracted text is empty, so a figure with a text page is always quoted.
   */
  scanned?: { image: string };
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
  /** city = a document the City published (primary); news = reporting (context); other = another government's document or an explainer (#51), never the City's books. */
  type: 'city' | 'news' | 'other';
  usedFor: string;
  /** Row on the Sources & Links tab; absent for sources added from documents.json. */
  row?: number;
  /** Set when the URL doesn't say (fremont.gov serves PDFs from /showpublisheddocument/{id}). */
  format?: 'PDF';
  /** The printed page number is the PDF page minus this (front matter before printed page 1). Receipts cite printed pages. */
  pageOffset?: number;
  /** An Internet Archive copy, when the City's server refuses automated requests. */
  archive?: { url: string; date: string };
}

/** Where a figure came from: a workbook row, or a quoted line on a page of a City document. */
export type Cite = Ref | DocRef;

/** A column of a budget table: what kind of figure, for which fiscal year (by the year it ends in). */
export interface BudgetColumn {
  /** Basis and year, unique within the table: "adopted-2027". */
  key: string;
  year: number;
  basis: 'adopted' | 'revised' | 'estimate' | 'actual' | 'mid-year-actual' | 'projected';
}

/**
 * One line of the General Fund's uses for a year. 'department' lines make the "where every $100 goes"
 * chart; 'citywide' lines (debt service, non-departmental, a citywide savings assumption) are in the
 * table's total but not the chart.
 */
export type DepartmentLine = Cite & {
  /** Stable slug for URLs: "police", "maintenance-operations". */
  id: string;
  name: string;
  kind: 'department' | 'citywide';
  amount: number;
  /**
   * Who actually provides the service, where that isn't City staff (#59): Lafayette's police are a contract with the
   * County Sheriff. From coverage.json's `lines`, quote-checked; shown on the line wherever the reader sees its number.
   */
  providedBy?: CoverageParagraph & {
    /** The same in a few words, with no figures, for the chart's square ("A contract with the County Sheriff"). */
    short?: string;
  };
};

/** General Fund uses for one budget year, by department. */
export interface GeneralFundUses {
  year: number;
  /** What the department lines add up to, for figure labels: "General Fund department baseline before proposed cuts". */
  basis: string;
  /** A qualifier the labels add: "planning figure". */
  note?: string;
  /** The same in a few words, for chart labels and captions: "department baseline". */
  noun: string;
  /** What one line is, when it isn't a department: Lafayette's are "program"s (#59). */
  unit?: string;
  lines: DepartmentLine[];
  /** The table's own total of every line, which the build ties to the lines. */
  total: Cite & { amount: number };
}

/** Staff positions (FTE) for a budget year. */
export type Staffing = Cite & {
  year: number;
  fte: number;
  /** For labels: "baseline, all funds". */
  basis: string;
  /** By department, where the budget lists them. */
  byDepartment?: (DocRef & { name: string; fte: number })[];
  /** What the count leaves out (#60), where the City's own document says: "regular positions only". */
  scope?: StepNote;
};

/** The budget's size: all funds, and the General Fund (the part the Council can spend on anything). */
export interface BudgetSize {
  /** Absent when the City's books don't give one all-funds total we can stand behind (Lafayette's two differ, #59). */
  allFunds?: DocRef & { amount: number; note?: string };
  generalFund: DocRef & { amount: number; note?: string };
}

/** A capital plan by program category and year, from a table in a City document. */
export interface CapitalPlan {
  title: string;
  /** What one line is: "program" (a program category, the default), or "project" (#59). */
  unit?: string;
  years: number[];
  /** The ref is the five-year total's; `cites` holds each year's. */
  lines: (DocRef & { name: string; years: ByYear; cites?: Record<number, DocRef>; total: number })[];
  total: DocRef & { years: ByYear; cites?: Record<number, DocRef>; total: number };
}

/**
 * Pension obligations as the budget reports them: a defined-benefit plan's unfunded liability (Fremont), or for a City
 * with no defined-benefit plan (Lafayette, #59) what it pays into employees' own accounts. That variant never has an
 * unfunded liability to show, rather than a zero one.
 */
export type Pension = DefinedBenefitPension | DefinedContributionPension;

export interface DefinedContributionPension {
  plan: 'defined-contribution';
  /** The City saying it has no defined-benefit plan. */
  noDefinedBenefit: DocRef;
  /** What the City pays in, as a share of base pay. */
  rate: DocRef & { rate: number };
  /** What the City paid in, in a fiscal year (the audited one). */
  contribution: DocRef & { amount: number; year: number };
  /** The liability for retiree health care (OPEB), its only retiree liability, as of a date. */
  opeb: DocRef & { amount: number; asOf: string };
}

export interface DefinedBenefitPension {
  plan?: 'defined-benefit';
  /** The actuarial valuation date: "6/30/2024". */
  asOf: string;
  unfunded: DocRef & { amount: number };
  fundedRatio: DocRef & { rate: number };
  /** The employer's contribution in the budget year. */
  contribution: DocRef & { amount: number; year: number };
}

/**
 * Where a City's reserve stands against its own policy (#59), for a city whose budget states it as a share of
 * spending: Lafayette's core cash ends FY 2026/27 at 72% of General Fund spending against a 60% minimum. Each figure
 * is its own receipt; `change` is what the budget year draws from (negative) or adds to the reserve.
 */
export interface ReservePosition {
  year: number;
  /** The reserve at the end of the year, in dollars and as a share of spending. */
  balance: DocRef & { amount: number };
  level: DocRef & { rate: number };
  /** The minimum the City's policy sets, as a share of the same spending. */
  policy: DocRef & { rate: number };
  change?: DocRef & { amount: number };
  /** The share the City's forecast shows in its last year. */
  outlook?: DocRef & { rate: number; year: number };
  /** What the City has said about it, each sentence with the words it rests on. */
  notes?: StepNote[];
}

/** A figure a city's pages quote from a sentence or table row, parsed from the quote. */
export type Fact = DocRef & { value: number; format: 'money' | 'percent' | 'number' };

export type RevenueLine = Cite & {
  name: string;
  /** One figure per column, by column key. */
  values: Record<string, number>;
  /** Where each column's figure is quoted, when the columns come from different pages; otherwise the line is the cite. */
  cites?: Record<string, DocRef>;
  /** Berkeley's mid-year report only. Derived: mid-year actual / adopted; null when nothing was budgeted. */
  pctOfAdoptedReceived?: number | null;
  /** Derived: this year's mid-year actual - last year's. */
  changeVsFy2025?: number;
  /** Derived: changeVsFy2025 / last year's mid-year actual; null when that was zero. */
  changeVsFy2025Pct?: number | null;
};

export interface Revenue {
  title: string;
  /** How to read it (mid-year = Jul–Dec, …). */
  note: string;
  columns: BudgetColumn[];
  /** The column the $100 chart, the groups and the totals use (the adopted budget). */
  primary: string;
  /** What the total row counts, for labels: "General Fund revenue and transfers". */
  totalName: string;
  lines: RevenueLine[];
  /** The table's own total row, tied against the sum of `lines` by validation. */
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
  /** Where a later City document prints the same row (#63: FY2028's are Item 21's): its PDF page and the row as printed. */
  page?: number;
  quote?: string;
}

export interface DepartmentReductionTotal extends Ref {
  baseline: number;
  reduction: number;
  salesTaxAllocation: number;
  budgetAfterReduction: number;
  reductionPct: number;
  netReduction: number;
  netReductionPct: number;
  page?: number;
  quote?: string;
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

/**
 * A defined term: from the workbook's Glossary tab (table, row), or quoted from a City document's glossary, or (#51)
 * defined in our words from another document, with `also` for more of what it rests on.
 */
export type GlossaryEntry = { term: string; definition: string } & ({ table: string; row: number } | (DocRef & { also?: DocRef[] }));

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
  /** What the Council changed at adoption, from the annotated agenda (#63). */
  adoptionAmendments: AdoptionAmendments;
}

/** A position the Council funded at adoption that the proposal had cut (#63). Amounts are FY2027's, as the motion's table lists them. */
export interface Restoration {
  /** The department whose proposed cut it softens: "fire". */
  department: string;
  /** Derived: the sum of `lines`. */
  amount: number;
  /** Derived: the FTE the lines name. */
  positions: number;
  /** The positions in our words, every number in the quote: "a fire inspector, 5 firefighters and 3 paramedics". */
  what: string;
  /** Each line of the motion's table as printed: "5.0 FTE Fire Fighters (Step 1)", 1,109,795. */
  lines: { label: string; amount: number }[];
  /** The motion funds them in FY2028 too; its table lists FY2027 amounts only. */
  bothYears: boolean;
  /** How the motion pays for them, when it says: "paid for with revenue transfers that include more ambulance transport revenue". */
  funding?: string;
  cite: DocRef;
}

export interface AdoptionAmendments {
  /** The motion that carried. */
  motion: DocRef;
  /** The motion's General Fund spending and revenue transfers, FY2027: equal, so the gap didn't change. */
  spending: DocRef & { amount: number };
  transfers: DocRef & { amount: number };
  restored: Restoration[];
}

/**
 * Every city's budget.json. The first group is what every city has and every page can read; the
 * rest are a city's own modules (Berkeley's deficit plan, cuts by ballot outcome and workbook
 * tables; Fremont's reserves facts and capital plan), and the pages that show them check for them.
 */
export interface CityBudget {
  schemaVersion: number;
  /** Shown on every receipt. */
  notes: {
    /** The years the data covers: "FY2025–FY2028". */
    coverage: string;
    /** "Budgetary/cash basis" */
    basis: string;
    /** "Figures are from budget/planning documents … subject to revision. Not for investment-decision use." */
    caveat: string;
    /** Where Berkeley's workbook states them. */
    table?: string;
    row?: number;
  };
  sources: Source[];
  /** General Fund uses by department, one entry per budget year. */
  generalFund: GeneralFundUses[];
  revenue: Revenue;
  staffing: Staffing;
  size: BudgetSize;

  /** Built from a workbook (Berkeley); absent for a city built from documents alone. */
  workbook?: { file: string; sha256: string };
  glossary?: GlossaryEntry[];
  deficitBridge?: DeficitBridge;
  departmentReductions?: DepartmentReductions[];
  fte?: Fte;
  oneTimeResources?: OneTimeResources;
  capitalProgram?: CapitalProgram;
  personnelAndPension?: PersonnelAndPension;
  citedFacts?: CitedFacts;
  documentFacts?: DocumentFacts;
  /** Figures quoted from sentences and table rows, keyed by what they are ("contingencyPolicy"). */
  facts?: Record<string, Fact>;
  /** Sentences the pages cite that state no figure ("contextYears"), each checked against its page. */
  statements?: Record<string, DocRef>;
  capitalPlan?: CapitalPlan;
  pension?: Pension;
  reservePosition?: ReservePosition;
  /** What the City's budget covers and what it doesn't (#51), from coverage.json. */
  coverage?: Coverage;
  /** The school district's budget (#52), from schools.json: another government's, on a page of its own. */
  schools?: Schools;
  /** Questions people ask about this budget (#54), from faq.json; the general part of each lives in the site-wide FAQ. */
  faq?: CityFaq;
  /** The General Fund over the years (#64), from documents.json's history rows. */
  history?: History;
  /** What staff cost (#65): pay and benefits, pensions and retiree health, from documents.json's staffCosts rows. */
  staffCosts?: StaffCosts;
}

/** A staff-cost column's word: the History words, and "baseline" for a forecast before any decisions (Berkeley's January deck). */
export type StaffAs = HistoryAs | 'baseline';
export const staffBasisOf = (as: StaffAs): HistoryBasis => (as === 'baseline' ? 'budget' : basisOf(as));

/** One printed figure: a dollar amount, or a percent as a fraction (70.4% is 0.704), with its row as its receipt. */
export interface StaffFigure {
  value: number;
  percent?: boolean;
  /** The row's label as printed. */
  label: string;
  cite: DocRef;
}

/** One year's bar: its parts (stacked, or side by side), the total they sum to, and the total it is a share of. */
export interface StaffPeriod {
  year: number;
  as: StaffAs;
  basis: HistoryBasis;
  parts: StaffFigure[];
  total?: StaffFigure;
  of?: StaffFigure;
}

/**
 * One block of the "What staff cost" section: one document's figures, on one basis, which it names (General Fund, or
 * citywide in all funds). A block never holds another city's figures, and the page never sets two cities side by side.
 */
export interface StaffSection {
  id: string;
  title: string;
  basis: StepNote;
  figures: (StaffFigure & { name: string; asOf: string })[];
  bars?: { layout: 'stacked' | 'grouped'; legend: string[]; periods: StaffPeriod[] };
  notes: StepNote[];
}

export interface StaffCosts {
  sections: StaffSection[];
  /** What the City doesn't publish, said plainly rather than estimated. */
  unpublished?: string[];
}

/** What a printed column is, in the City's word: an actual result, an estimate, or an adopted or proposed budget. */
export type HistoryAs = 'actual' | 'estimate' | 'adopted' | 'proposed';
/** Actual years are drawn solid; estimates and budgets hollow. */
export type HistoryBasis = 'actual' | 'estimate' | 'budget';
export const basisOf = (as: HistoryAs): HistoryBasis => (as === 'adopted' || as === 'proposed' ? 'budget' : as);

/** One printed row's figures of one kind: by year (the year the fiscal year ends in), with the row as its receipt. */
export interface HistorySeries {
  label: string;
  basis: HistoryBasis;
  as: HistoryAs;
  years: Record<string, number>;
  cite: DocRef;
}

/**
 * A measure drawn as one line (revenue, spending, transfers, fund balance), from one or more printed rows. A line
 * never joins two panels, so figures on different bases are never one line. 'net' lines are in the table only.
 */
export interface HistoryLine {
  id: string;
  label: string;
  kind: 'flow' | 'balance' | 'net';
  series: HistorySeries[];
}

/** A year-to-year step the City's own figures don't make (a restated opening balance), and why. */
export interface HistoryAdjustment {
  reason: string;
  from: { label: string; year: number; value: number; cite: DocRef };
  to: { label: string; year: number; value: number; cite: DocRef };
}

/** One document's figures, on one basis: what they are (basis) and the City's notes printed with them. */
export interface HistoryPanel {
  id: string;
  title: string;
  basis: StepNote;
  lines: HistoryLine[];
  notes: StepNote[];
  adjustments: HistoryAdjustment[];
}

export interface History {
  panels: HistoryPanel[];
}

/**
 * One question of a FAQ (#54), its id the anchor a reply links to. The first paragraph is the direct answer;
 * `see` names site-wide answers (/faq/#id) that explain the general part, so a city page doesn't repeat them.
 */
export interface FaqQuestion {
  id: string;
  question: string;
  paragraphs: CoverageParagraph[];
  see?: string[];
}

/** A city's FAQ (#54). Figure tokens that name a budget.json path ({fig:pension.contribution}) take their receipt label from `labels`. */
export interface CityFaq {
  questions: FaqQuestion[];
  labels?: Record<string, string>;
  /** Figures read from a quote that budget.json doesn't otherwise hold, named for {amount:id} tokens. */
  amounts?: Record<string, FaqAmount>;
}

/** An amount an answer shows ({amount:id}), read from its quote: in dollars, thousands or millions, as the table prints it. */
export interface FaqAmount extends DocRef {
  label: string;
  amount: number;
}

/**
 * A paragraph of the "What this budget covers" block. `text` may name {allFunds}, {generalFund}, {propertyTax}
 * and {year} (filled from this file, with their receipts) and link [words](glossary:Term) or [words](a source URL).
 * Every other number in it is in one of its cites' quotes; a paragraph with no cites says why in `unsourced`.
 */
export interface CoverageParagraph {
  text: string;
  cites?: DocRef[];
  unsourced?: string;
}

/** Another government that serves the city, with what it does and the documents that say it serves the city. */
export interface CoverageAgency {
  name: string;
  does: string;
  cites: DocRef[];
}

export const COVERAGE_QUESTIONS = ['everything', 'schools', 'else', 'property-tax', 'city-pays'] as const;

export interface CoverageQuestion {
  id: (typeof COVERAGE_QUESTIONS)[number];
  question: string;
  paragraphs: CoverageParagraph[];
  agencies?: CoverageAgency[];
}

/**
 * A service the City's General Fund doesn't pay for, which a reader comparing cities would look for (#59): Lafayette's
 * fire service is a separate district's. Shown as a muted row with no squares wherever the departments are listed.
 */
export interface NotInBudget {
  id: string;
  name: string;
  /** Who provides it, in a few words: "Contra Costa County Fire Protection District". */
  provider: string;
  /** Why it isn't in these numbers, with its cites. */
  paragraph: CoverageParagraph;
}

/** The five reader questions, in order: is this everything, where are the schools, what else isn't here, where does property tax go, does the City pay for schools. */
export interface Coverage {
  questions: CoverageQuestion[];
  /** Services the General Fund doesn't pay for (#59); the block leads with them. */
  notInBudget?: NotInBudget[];
  /** What kind of city this is, in one cited line for the overview: "a limited service city" (#59). */
  profile?: CoverageParagraph;
  /** The overview's line under the property-tax card; the whole line links to the block. */
  overview: CoverageParagraph;
}

/** A city with a deficit plan built from a workbook (Berkeley): every module the Gap and Ballot pages read. */
export type GapBudget = CityBudget &
  Required<Pick<CityBudget, 'workbook' | 'glossary' | 'deficitBridge' | 'departmentReductions' | 'fte' | 'oneTimeResources' | 'capitalProgram' | 'personnelAndPension' | 'citedFacts' | 'documentFacts'>>;

export const hasGapPlan = (b: CityBudget): b is GapBudget => b.deficitBridge !== undefined && b.departmentReductions !== undefined && b.documentFacts !== undefined;

/** The budget as a page that needs the deficit-plan modules reads it: throws if the city has none. */
export function gapPlan(b: CityBudget, where: string): GapBudget {
  if (!hasGapPlan(b)) throw new Error(`${where} needs a deficit plan (deficit bridge, department reductions, documents), and this city's budget has none`);
  return b;
}

/** budget.json as the workbook alone produces it, before documents.json is merged in. */
export type WorkbookBudget = Omit<GapBudget, 'documentFacts' | 'size'>;

/** A formula cell the workbook computed, next to what we computed for it. */
export interface CrossCheck {
  what: string;
  computed: number | null;
  cached: number;
}

/**
 * A figure in the school district's book (#52), read from its quote, never typed: the quote's one dollar
 * amount ("$248.2 million"), or the `figure`th of several, or for a table row (`row`) its `figure`th cell.
 */
export type SchoolsAmount = DocRef & { value: number; figure?: number; row?: boolean };

export interface SchoolsPart {
  id: string;
  name: string;
  /** Its squares in the $100 chart (revenue parts). */
  color?: string;
  amount: SchoolsAmount;
  /** What it is, in plain words with its own cites. */
  about?: CoverageParagraph;
}

export interface SchoolsParcelTax {
  id: string;
  name: string;
  /** Which measure it is now, and what it replaced. */
  measure: CoverageParagraph;
  amount: SchoolsAmount;
  pays: CoverageParagraph;
}

/** The school district's General Fund budget (#52). Every part reconciles to its total, or the build fails. */
export interface Schools {
  district: string;
  short: string;
  /** The district's budget year, as it writes it: "2026-27". */
  fiscalYear: string;
  banner: CoverageParagraph;
  /** Its fiscal year, against the City's. */
  year: CoverageParagraph;
  revenue: {
    /** The narrative's total, which its parts add up to. */
    total: SchoolsAmount;
    /** The State budget form's exact total, which the narrative's rounds. */
    exact: SchoolsAmount;
    /** The State form's parcel-tax line, which differs from the narrative's parcel-tax figure. */
    parcelForm: SchoolsAmount;
    parts: SchoolsPart[];
    notes: CoverageParagraph[];
  };
  spending: {
    total: SchoolsAmount;
    /** The State form's rows add up to its total exactly. */
    exact: SchoolsAmount;
    rows: SchoolsPart[];
    notes: CoverageParagraph[];
  };
  balance: { paragraphs: CoverageParagraph[]; quotes: DocRef[] };
  parcelTaxes: SchoolsParcelTax[];
  /** The district's own pages to read next: its budget page and the book. */
  links: SourceId[];
}
