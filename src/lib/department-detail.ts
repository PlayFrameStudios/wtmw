/**
 * The view model for a city's department subpages (Fremont): each department's total operating
 * budget, its funding sources, spending by category, and, where the budget prints them, its major
 * service areas — plus the Administrative Departments hub for the six offices grouped under that
 * General Fund row. Every number is a typed Figure that opens its receipt; tone is 'neutral'
 * throughout (neither money short nor one-time money).
 */
import type { CityBudget, DepartmentBudgetDetail, DepartmentExpenseLine, DepartmentFundingLine, DepartmentLine, DocRef, StepNote } from '../data/types.ts';
import type { Families } from './families.ts';
import type { Figure } from './receipts.ts';
import { per100 } from './waffle.ts';

/** One piece of a page's lede: prose, or prose ending in a figure that opens its receipt. */
export interface LedeFragment {
  text: string;
  figure?: Figure;
}

/** One row of a funding / category / service-area list: its figure, printed share, and bar. */
export interface DepartmentLineView {
  name: string;
  figure: Figure;
  /** "98.6%": the printed share for a funding source, else the line's share of its total. */
  sharePct: string;
  /** Bar width relative to the section's biggest line. */
  barRatio: number;
  /** A $0 line: shown as $0 with an empty bar, still reachable and accountable. */
  isZero: boolean;
}

/** A department's subpage: everything the template renders. */
export interface DepartmentDetailView {
  kind: 'department';
  id: string;
  name: string;
  group: 'department' | 'administrative';
  yearLabel: string;
  /** The family swatch: the department's own, or the administrative hub's for the six offices. */
  color: string;
  /** The hub, for the six administrative offices. */
  parent?: { label: string; href: string };
  allDepartmentsHref: string;
  total: Figure;
  /** Exact dollars of every $100 of the city's General Fund department budgets (undefined for Information Technology Services: an internal service fund). */
  per100?: number;
  /** "…of every $100 of General Fund department budgets · FY 2026/27", or the internal-service explanation. */
  per100Text: string;
  /** The lede paragraph: the total, then the General Fund reconciliation, prose and figures. */
  lede: LedeFragment[];
  funding: { lines: DepartmentLineView[]; total: Figure; max: number };
  categories: { lines: DepartmentLineView[]; allocationNote: StepNote; total: Figure; max: number };
  serviceAreas?: { lines: DepartmentLineView[]; total: Figure; max: number };
}

/** One office on the hub: its link, total budget, General Fund row slice, and how it is funded. */
export interface AdminHubOfficeView {
  id: string;
  name: string;
  href: string;
  /** The administrative family's swatch, shared by all six offices. */
  color: string;
  /** All-funds operating budget ($18.1M for City Attorney, $25.3M for IT Services). */
  total: Figure;
  /** Amount counted in the $23.6M General Fund summary row: General Fund + overhead charges (undefined for IT Services). */
  generalFundRow?: Figure;
  /** Prose and figures: "General Fund $4.9M plus $795K in overhead charged to other funds." */
  note: LedeFragment[];
  /** This office's slice of every $100 of the city's General Fund department budgets (undefined for IT Services: an internal service fund). */
  per100?: number;
  /** General Fund plus overhead charges to other funds, for ordering and bar-scaling the five offices. */
  gfPlusOverhead: number;
}

/** The Administrative Departments hub. */
export interface AdminHubView {
  kind: 'hub';
  id: 'administrative-departments';
  name: string;
  yearLabel: string;
  allDepartmentsHref: string;
  /** The family swatch, matching the six offices' squares on the $100 waffle. */
  color: string;
  /** Exact dollars of every $100 of the city's General Fund department budgets. */
  per100: number;
  /** "$8.25 of every $100 of General Fund department budgets · FY 2026/27". */
  per100Text: string;
  /** The S1 page naming the six offices. */
  description: DocRef;
  /** The $23.6M General Fund summary row the five General Fund offices share. */
  summary: Figure;
  /** Sum of the five offices' General Fund lines ($19,767,060 = $19.8M), before overhead charges. */
  generalFundOnly: Figure;
  /** Sum of the five offices' Overhead Charges to Other Funds lines ($3,838,722 = $3.8M). */
  overheadOnly: Figure;
  /** Largest General Fund + overhead office amount, for scaling the five bars. */
  generalFundMax: number;
  /** The five General Fund offices, biggest General Fund + overhead share first. */
  generalFundOffices: AdminHubOfficeView[];
  /** Information Technology Services, the internal service fund. */
  internalService: AdminHubOfficeView;
}

export type DepartmentPageView = DepartmentDetailView | AdminHubView;

/** A city has department subpages when its budget carries per-department operating details. */
export function hasDepartmentSubpages(b: CityBudget): boolean {
  return Boolean(b.departmentDetails);
}

/**
 * Every slug a city's department routes cover: its departments, plus the Administrative Departments hub where the
 * data carries one. A city without departmentDetails has no subpages, so the route emits none.
 */
export function departmentSubpageSlugs(b: CityBudget): string[] {
  if (!b.departmentDetails) return [];
  return [...b.departmentDetails.departments.map((d) => d.id), ...(b.departmentDetails.adminHub ? [b.departmentDetails.adminHub.id] : [])];
}

/** The page for a department, by its slug ("police", "administrative-departments") or its printed staffing-table name ("City Manager’s Office"). */
export function departmentHref(cityPath: string, b: CityBudget, idOrStaffName: string): string | undefined {
  if (!b.departmentDetails) return undefined;
  const byId = new Map<string, string>();
  for (const d of b.departmentDetails.departments) {
    byId.set(d.id, d.id);
    byId.set(d.name, d.id);
  }
  if (b.departmentDetails.adminHub) byId.set(b.departmentDetails.adminHub.id, b.departmentDetails.adminHub.id);
  const id = byId.get(idOrStaffName) ?? byId.get(idOrStaffName.replace(/['’]s Office$/, ''));
  return id ? `${cityPath}departments/${id}/` : undefined;
}

/** "General Fund department budgets" — the noun for the city's General Fund departments (solely from budget.json, no Vite glob). */
function gfNoun(b: CityBudget): string {
  const noun = typeof b.generalFund[0].noun === 'string' ? b.generalFund[0].noun.trim() : '';
  if (!noun) throw new Error(`department-detail: budget.json's General Fund table has no "noun"`);
  return /general fund/i.test(noun) ? noun : `General Fund ${noun}`;
}

/** Exact dollars of every $100 of the city's General Fund department budgets, keyed by the department row's id. */
function per100ByDepartment(b: CityBudget): { total: number; shares: Map<string, number> } {
  const depts = b.generalFund[0].lines.filter((l) => l.kind === 'department');
  const shares = new Map(per100(depts, (l: DepartmentLine) => l.amount).map((s) => [s.item.id, s.exact]));
  return { total: depts.reduce((a, l) => a + l.amount, 0), shares };
}

/** "$45.14 of every $100 of General Fund department budgets · FY 2026/27". */
const per100TextOf = (per100: number, noun: string, y: string) => `$${per100.toFixed(2)} of every $100 of ${noun} · ${y}`;

/** A department's all-funds operating budget, citing its printed Total row (never a parts array: #31's rounding pitfall). */
function totalFigure(d: DepartmentBudgetDetail, y: string): Figure {
  return { value: d.funding.total.amount, label: `${d.name}, ${y}: adopted operating budget, all funds`, ref: d.funding.total, tone: 'neutral' };
}

/** One *Sources of Funding* line's figure. */
function fundingFigure(d: DepartmentBudgetDetail, y: string, line: DepartmentFundingLine): Figure {
  return { value: line.amount, label: `${d.name}, ${y}: funding from ${line.name}`, ref: line, tone: 'neutral' };
}

/** One *Expenditures by Category* line's figure. */
function categoryFigure(d: DepartmentBudgetDetail, y: string, line: DepartmentExpenseLine): Figure {
  return { value: line.amount, label: `${d.name}, ${y}: ${line.name}`, ref: line, tone: 'neutral' };
}

/** One *Major Service Area* line's figure. */
function serviceAreaFigure(d: DepartmentBudgetDetail, y: string, line: DepartmentExpenseLine): Figure {
  return { value: line.amount, label: `${d.name}, ${y}: ${line.name} service area`, ref: line, tone: 'neutral' };
}

/** The General Fund summary's row for a department, in $1,000s as printed. */
function summaryFigure(b: CityBudget, y: string, id: string): Figure {
  const line = b.generalFund[0].lines.find((l) => l.id === id);
  if (!line) throw new Error(`department-detail: no General Fund summary line "${id}"`);
  return { value: line.amount, label: `${line.name}, ${y}: General Fund summary line`, ref: line, tone: 'neutral' };
}

/** A line's printed share as its own figure ("98.6%"). */
function shareFigure(d: DepartmentBudgetDetail, y: string, line: DepartmentFundingLine): Figure {
  return { value: line.share, label: `${d.name}, ${y}: share of funding from ${line.name}`, ref: line, format: 'percent', tone: 'neutral' };
}

/** An `also` cite for each line but the figure's own ref, so the drawer lists every line a sum reads. */
const otherLines = (lines: DepartmentFundingLine[], ref: DepartmentFundingLine) =>
  lines
    .filter((l) => l !== ref)
    .map(({ source, page, quote }) => ({ source, page, quote }));

/** City Attorney's Risk Management internal service fund: its two direct-charge lines, summed. */
function riskFigure(d: DepartmentBudgetDetail, y: string): Figure {
  const gfCharge = d.funding.lines.find((l) => l.name.startsWith('Direct Charges to General Fund'))!;
  const otherCharge = d.funding.lines.find((l) => l.name.startsWith('Direct Charges to Other Funds'))!;
  return {
    value: gfCharge.amount + otherCharge.amount,
    label: `${d.name}, ${y}: Risk Management internal service fund`,
    ref: gfCharge,
    tone: 'neutral',
    also: otherLines([gfCharge, otherCharge], gfCharge),
    parts: [
      { label: 'Direct charges to the General Fund', value: gfCharge.amount },
      { label: 'Direct charges to other funds', value: otherCharge.amount },
    ],
  };
}

/** An administrative office's slice of the $23.6M General Fund summary row: General Fund + overhead charges. */
function officeGeneralFundFigure(d: DepartmentBudgetDetail, y: string, gf: DepartmentFundingLine, overhead: DepartmentFundingLine): Figure {
  return {
    value: gf.amount + overhead.amount,
    label: `${d.name}, ${y}: General Fund and overhead charges to other funds`,
    ref: gf,
    tone: 'neutral',
    also: otherLines([gf, overhead], gf),
    parts: [
      { label: 'General Fund', value: gf.amount },
      { label: 'Overhead charges to other funds', value: overhead.amount },
    ],
  };
}

/** A name in the possessive: "Police's", but "Human Services'" (no doubled s after a plural name). */
export const possessive = (name: string) => `${name}${/s$/i.test(name) ? '’' : '’s'}`;

const frag = (text: string, figure?: Figure): LedeFragment => (figure ? { text, figure } : { text });

/** The lede's General Fund reconciliation, in the City's own terms, per how the department funds itself. */
function reconciliation(d: DepartmentBudgetDetail, b: CityBudget, y: string, name: string): LedeFragment[] {
  const total = totalFigure(d, y);
  const gf = d.funding.lines.find((l) => l.name === 'General Fund');
  const overhead = d.funding.lines.find((l) => l.name.startsWith('Overhead Charges'));
  switch (d.generalFundTie.kind) {
    case 'direct':
      // A chapter listing one source is 100% General Fund: Economic Development.
      if (d.funding.lines.length === 1) {
        return [
          frag(`${possessive(name)} ${y} adopted operating budget is `, total),
          frag(', all of it from the General Fund. On the General Fund summary, that budget is the '),
          frag('', summaryFigure(b, y, d.generalFundTie.summaryId!)),
          frag(' line — the same figure, rounded to the nearest thousand.'),
        ];
      }
      return [
        frag(`${possessive(name)} ${y} adopted operating budget is `, total),
        frag(' across all funds. Of that, ', fundingFigure(d, y, gf!)),
        frag(' comes from the General Fund — ', shareFigure(d, y, gf!)),
        frag(" of the total. The rest is paid from the department's own cost centers, dedicated fees, grants and special revenue funds."),
      ];
    case 'with-overhead':
      return [
        frag(`${possessive(name)} ${y} adopted operating budget is `, total),
        frag(' across all funds. Of that, ', fundingFigure(d, y, gf!)),
        frag(' comes from the General Fund and ', fundingFigure(d, y, overhead!)),
        frag(' is overhead the City charges to its other funds. Together those two match the ', summaryFigure(b, y, d.generalFundTie.summaryId!)),
        frag(' row on the General Fund summary, rounded to the nearest thousand.'),
      ];
    case 'admin-group':
      if (d.funding.lines.length === 2) {
        return [
          frag(`${possessive(name)} ${y} adopted operating budget is `, total),
          frag(': ', fundingFigure(d, y, gf!)),
          frag(' from the General Fund and ', fundingFigure(d, y, overhead!)),
          frag(' in overhead charged to other funds. Both count toward the ', summaryFigure(b, y, 'administrative-departments')),
          frag(' Administrative Departments row on the General Fund summary, shared across five offices.'),
        ];
      }
      return [
        frag(`${possessive(name)} ${y} adopted operating budget is `, total),
        frag(' across all funds. Of that, ', fundingFigure(d, y, gf!)),
        frag(' comes from the General Fund and ', fundingFigure(d, y, overhead!)),
        frag(' is overhead charged to other funds — ', officeGeneralFundFigure(d, y, gf!, overhead!)),
        frag(' toward the ', summaryFigure(b, y, 'administrative-departments')),
        frag(' Administrative Departments row on the General Fund summary, shared across five offices.'),
        ...dedicatedFunding(d, y),
      ];
    case 'internal-service':
      return [
        frag(`${name} is budgeted as an internal service fund: its ${y} adopted operating budget is `, total),
        frag('. Instead of a line on the General Fund summary, it is funded by ', fundingFigure(d, y, d.funding.lines[0])),
        frag(' in direct charges to the General Fund (', shareFigure(d, y, d.funding.lines[0])),
        frag(') and ', fundingFigure(d, y, d.funding.lines[1])),
        frag(' in direct charges to other funds (', shareFigure(d, y, d.funding.lines[1])),
        frag(').'),
      ];
  }
}

/** The offices that carry dedicated funds besides the General Fund and overhead lines. */
function dedicatedFunding(d: DepartmentBudgetDetail, y: string): LedeFragment[] {
  if (d.id === 'city-manager') {
    const line = d.funding.lines.find((l) => l.name === 'Homeless Services')!;
    return [frag(' It also carries ', fundingFigure(d, y, line)), frag(' in dedicated Homeless Services funding.')];
  }
  if (d.id === 'city-attorney') {
    return [frag(' The rest is the ', riskFigure(d, y)), frag(' Risk Management internal service fund, charged directly to the General Fund and other funds.')];
  }
  return [];
}

/** One list row: its name, figure, printed share and bar. */
function viewOf(name: string, figure: Figure, share: number, max: number): DepartmentLineView {
  return { name, figure, sharePct: `${(share * 100).toFixed(1)}%`, barRatio: max > 0 ? figure.value / max : 0, isZero: figure.value === 0 };
}

/** A department's subpage view: the totals, funding sources, categories, and service areas where printed. */
export function departmentDetailView(cityPath: string, b: CityBudget, families: Families, names: Record<string, string>, slug: string, yearLabel: string): DepartmentDetailView {
  const d = b.departmentDetails?.departments.find((x) => x.id === slug);
  if (!d) throw new Error(`departmentDetailView: no department "${slug}" in ${cityPath}'s departmentDetails`);
  const y = yearLabel;
  const name = names[d.id] ?? d.name;
  const total = totalFigure(d, y);
  const gf = d.funding.lines.find((l) => l.name === 'General Fund');
  const overhead = d.funding.lines.find((l) => l.name.startsWith('Overhead Charges'));
  const gfDepts = per100ByDepartment(b);
  let per100: number | undefined;
  if (d.generalFundTie.kind === 'admin-group') {
    // An office's slice of the "Administrative Departments" row, against every $100 of the departments' budgets.
    per100 = (((gf?.amount ?? 0) + (overhead?.amount ?? 0)) / gfDepts.total) * 100;
  } else if (d.generalFundTie.kind !== 'internal-service') {
    // The department's own row on the General Fund summary (internally, the exact share /departments/ and /faq/ print).
    per100 = gfDepts.shares.get(d.generalFundTie.summaryId!);
    if (per100 === undefined) throw new Error(`departmentDetailView: no General Fund summary row "${d.generalFundTie.summaryId}" for "${d.name}"`);
  }
  const per100Text =
    per100 === undefined
      ? `Internal service fund — charged across departments' budgets rather than a separate slice of every $100 · ${y}`
      : per100TextOf(per100, gfNoun(b), y);
  const fundingMax = Math.max(...d.funding.lines.map((l) => l.amount));
  const categoriesMax = Math.max(...d.categories.lines.map((l) => l.amount));
  const serviceAreas = d.serviceAreas && (() => {
    const max = Math.max(...d.serviceAreas!.lines.map((l) => l.amount));
    return {
      lines: [...d.serviceAreas!.lines].sort((a, z) => z.amount - a.amount).map((l) => viewOf(l.name, serviceAreaFigure(d, y, l), l.amount / d.serviceAreas!.total.amount, max)),
      total: { value: d.serviceAreas!.total.amount, label: `${d.name}, ${y}: total by major service area`, ref: d.serviceAreas!.total, tone: 'neutral' } satisfies Figure,
      max,
    };
  })();
  return {
    kind: 'department',
    id: d.id,
    name,
    group: d.group,
    yearLabel: y,
    color: d.group === 'administrative' ? families.color('administrative-departments') : families.color(d.id),
    ...(d.group === 'administrative' ? { parent: { label: 'Administrative Departments', href: `${cityPath}departments/administrative-departments/` } } : {}),
    allDepartmentsHref: `${cityPath}departments/`,
    total,
    per100,
    per100Text,
    lede: reconciliation(d, b, y, name),
    funding: {
      lines: [...d.funding.lines].sort((a, z) => z.amount - a.amount).map((l) => viewOf(l.name, fundingFigure(d, y, l), l.share, fundingMax)),
      total,
      max: fundingMax,
    },
    categories: {
      lines: d.categories.lines.map((l) => viewOf(l.name, categoryFigure(d, y, l), l.amount / d.categories.total.amount, categoriesMax)),
      allocationNote: { text: b.departmentDetails!.allocationNote.text, cites: [d.allocationNote] },
      total: { value: d.categories.total.amount, label: `${d.name}, ${y}: total expenditures by category`, ref: d.categories.total, tone: 'neutral' } satisfies Figure,
      max: categoriesMax,
    },
    ...(serviceAreas ? { serviceAreas } : {}),
  };
}

/** The hub for the six administrative offices: the summary row, the naming quote, and each office's budget. */
export function adminHubView(cityPath: string, b: CityBudget, families: Families, yearLabel: string): AdminHubView {
  const hub = b.departmentDetails?.adminHub;
  if (!hub) throw new Error(`adminHubView: ${cityPath} has no administrative-departments hub`);
  const y = yearLabel;
  const gfDepts = per100ByDepartment(b);
  const noun = gfNoun(b);
  const byId = new Map(b.departmentDetails!.departments.map((d) => [d.id, d]));
  const office = (d: DepartmentBudgetDetail): AdminHubOfficeView => {
    const gf = d.funding.lines.find((l) => l.name === 'General Fund');
    const overhead = d.funding.lines.find((l) => l.name.startsWith('Overhead Charges'));
    const note: LedeFragment[] = [];
    let gfPlusOverhead = 0;
    let per100: number | undefined;
    let generalFundRow: Figure | undefined;
    if (gf && overhead) {
      // The General Fund row on p.66 counts this office's General Fund line and its overhead charges, not its all-funds total.
      gfPlusOverhead = gf.amount + overhead.amount;
      per100 = (gfPlusOverhead / gfDepts.total) * 100;
      generalFundRow = officeGeneralFundFigure(d, y, gf, overhead);
      note.push({ text: 'General Fund ', figure: fundingFigure(d, y, gf) });
      note.push({ text: ' plus ', figure: fundingFigure(d, y, overhead) });
      note.push({ text: ' in overhead charged to other funds.' });
    } else {
      // Information Technology Services: an internal service fund, charged across departments.
      note.push({ text: 'Rather than a line on the General Fund summary, its costs are charged across departments as direct charges — ', figure: fundingFigure(d, y, d.funding.lines[0]) });
      note.push({ text: ' to the General Fund and ', figure: fundingFigure(d, y, d.funding.lines[1]) });
      note.push({ text: ' to other funds.' });
    }
    // Funds the office carries outside the General Fund row: City Manager's Homeless Services, City Attorney's Risk Management.
    const homeless = d.funding.lines.find((l) => l.name === 'Homeless Services');
    if (homeless) {
      note.push({ text: ' Its ', figure: totalFigure(d, y) });
      note.push({ text: ' all-funds total adds ', figure: fundingFigure(d, y, homeless) });
      note.push({ text: ' in Homeless Services funding outside the General Fund row.' });
    }
    if (d.id === 'city-attorney') {
      note.push({ text: ' Its ', figure: totalFigure(d, y) });
      note.push({ text: ' all-funds total includes the ', figure: riskFigure(d, y) });
      note.push({ text: ' Risk Management internal service fund outside the General Fund row.' });
    }
    return { id: d.id, name: d.name, href: `${cityPath}departments/${d.id}/`, color: families.color('administrative-departments'), total: totalFigure(d, y), ...(generalFundRow ? { generalFundRow } : {}), note, per100, gfPlusOverhead };
  };
  const offices = hub.memberIds.map((id) => office(byId.get(id)!));
  const generalFundOffices = offices
    .filter((o) => o.id !== 'information-technology-services')
    .sort((a, z) => z.gfPlusOverhead - a.gfPlusOverhead);
  const internalService = offices.find((o) => o.id === 'information-technology-services');
  if (!internalService) throw new Error(`adminHubView: ${hub.name} has no internal service fund`);
  const hubPer100 = gfDepts.shares.get(hub.id);
  if (hubPer100 === undefined) throw new Error(`adminHubView: no General Fund summary row "${hub.id}"`);

  // The five offices' General Fund lines and their overhead charges, each summing to the row p.66 prints.
  const members = generalFundOffices.map((o) => {
    const d = byId.get(o.id)!;
    const gf = d.funding.lines.find((l) => l.name === 'General Fund');
    const overhead = d.funding.lines.find((l) => l.name.startsWith('Overhead Charges'));
    if (!gf || !overhead) throw new Error(`adminHubView: ${d.name} has no General Fund and overhead lines`);
    return { name: d.name, gf, overhead };
  });
  const sum = (of: (m: (typeof members)[number]) => DepartmentFundingLine) => members.reduce((a, m) => a + of(m).amount, 0);
  const allGf = members.map((m) => m.gf);
  const allOverhead = members.map((m) => m.overhead);
  const generalFundOnly: Figure = {
    value: sum((m) => m.gf),
    label: `${hub.name}, ${y}: General Fund, five offices`,
    ref: members[0].gf,
    tone: 'neutral',
    also: otherLines(allGf, members[0].gf),
    parts: members.map((m) => ({ label: m.name, value: m.gf.amount })),
  };
  const overheadOnly: Figure = {
    value: sum((m) => m.overhead),
    label: `${hub.name}, ${y}: overhead charges to other funds, five offices`,
    ref: members[0].overhead,
    tone: 'neutral',
    also: otherLines(allOverhead, members[0].overhead),
    parts: members.map((m) => ({ label: m.name, value: m.overhead.amount })),
  };

  return {
    kind: 'hub',
    id: hub.id,
    name: hub.name,
    yearLabel: y,
    allDepartmentsHref: `${cityPath}departments/`,
    color: families.color('administrative-departments'),
    per100: hubPer100,
    per100Text: per100TextOf(hubPer100, noun, y),
    description: hub.description,
    summary: summaryFigure(b, y, 'administrative-departments'),
    generalFundOnly,
    overheadOnly,
    generalFundMax: Math.max(...generalFundOffices.map((o) => o.gfPlusOverhead)),
    generalFundOffices,
    internalService,
  };
}
