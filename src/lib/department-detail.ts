/**
 * The view model for a city's department subpages (Fremont): each department's total operating
 * budget, its funding sources, spending by category, and, where the budget prints them, its major
 * service areas — plus the Administrative Departments hub for the six offices grouped under that
 * General Fund row. Every number is a typed Figure that opens its receipt; tone is 'neutral'
 * throughout (neither money short nor one-time money).
 */
import type { CityBudget, DepartmentBudgetDetail, DepartmentExpenseLine, DepartmentFundingLine, DocRef, StepNote } from '../data/types.ts';
import type { Families } from './families.ts';
import type { Figure } from './receipts.ts';

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
  /** The lede paragraph: the total, then the General Fund reconciliation, prose and figures. */
  lede: LedeFragment[];
  funding: { lines: DepartmentLineView[]; total: Figure; max: number };
  categories: { lines: DepartmentLineView[]; allocationNote: StepNote; total: Figure; max: number };
  serviceAreas?: { lines: DepartmentLineView[]; total: Figure; max: number };
}

/** One office on the hub: its link, total budget, and how it is funded. */
export interface AdminHubOfficeView {
  id: string;
  name: string;
  href: string;
  /** The administrative family's swatch, shared by all six offices. */
  color: string;
  total: Figure;
  /** Prose and figures: "General Fund $4.9M plus $795K in overhead charged to other funds." */
  note: LedeFragment[];
  /** General Fund plus overhead charges to other funds, for ordering the five offices. */
  gfPlusOverhead: number;
}

/** The Administrative Departments hub. */
export interface AdminHubView {
  kind: 'hub';
  id: 'administrative-departments';
  name: string;
  yearLabel: string;
  allDepartmentsHref: string;
  /** The S1 page naming the six offices. */
  description: DocRef;
  /** The $23.6M General Fund summary row the six offices share. */
  summary: Figure;
  /** The five General Fund offices, biggest General Fund cost first. */
  generalFundOffices: AdminHubOfficeView[];
  /** Information Technology Services, the internal service fund. */
  internalService: AdminHubOfficeView;
}

export type DepartmentPageView = DepartmentDetailView | AdminHubView;

/** A city has department subpages when its budget carries per-department operating details. */
export function hasDepartmentSubpages(b: CityBudget): boolean {
  return Boolean(b.departmentDetails);
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

/** City Attorney's Risk Management internal service fund: its two direct-charge lines, summed. */
function riskFigure(d: DepartmentBudgetDetail, y: string): Figure {
  const gfCharge = d.funding.lines.find((l) => l.name.startsWith('Direct Charges to General Fund'))!;
  const otherCharge = d.funding.lines.find((l) => l.name.startsWith('Direct Charges to Other Funds'))!;
  return {
    value: gfCharge.amount + otherCharge.amount,
    label: `${d.name}, ${y}: Risk Management internal service fund`,
    ref: gfCharge,
    tone: 'neutral',
    parts: [
      { label: 'Direct charges to the General Fund', value: gfCharge.amount },
      { label: 'Direct charges to other funds', value: otherCharge.amount },
    ],
  };
}

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
          frag(`${name}'s ${y} adopted operating budget is `, total),
          frag(', all of it from the General Fund. On the General Fund summary, that budget is the '),
          frag('', summaryFigure(b, y, d.generalFundTie.summaryId!)),
          frag(' line — the same figure, rounded to the nearest thousand.'),
        ];
      }
      return [
        frag(`${name}'s ${y} adopted operating budget is `, total),
        frag(' across all funds. Of that, ', fundingFigure(d, y, gf!)),
        frag(' comes from the General Fund — ', shareFigure(d, y, gf!)),
        frag(" of the total. The rest is paid from the department's own cost centers, dedicated fees, grants and special revenue funds."),
      ];
    case 'with-overhead':
      return [
        frag(`${name}'s ${y} adopted operating budget is `, total),
        frag(' across all funds. Of that, ', fundingFigure(d, y, gf!)),
        frag(' comes from the General Fund and ', fundingFigure(d, y, overhead!)),
        frag(' is overhead the City charges to its other funds. Together those two match the ', summaryFigure(b, y, d.generalFundTie.summaryId!)),
        frag(' row on the General Fund summary, rounded to the nearest thousand.'),
      ];
    case 'admin-group':
      return [
        frag(`${name}'s ${y} adopted operating budget is `, total),
        frag(' across all funds. On the General Fund summary, this office is grouped under Administrative Departments — a ', summaryFigure(b, y, 'administrative-departments')),
        frag(' row across five offices. The General Fund provides ', fundingFigure(d, y, gf!)),
        frag(' of its budget, and ', fundingFigure(d, y, overhead!)),
        frag(' is overhead charged to other funds.'),
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
    lede: reconciliation(d, b, y, name),
    funding: {
      lines: [...d.funding.lines].sort((a, z) => z.amount - a.amount).map((l) => viewOf(l.name, fundingFigure(d, y, l), l.share, fundingMax)),
      total,
      max: fundingMax,
    },
    categories: {
      lines: d.categories.lines.map((l) => viewOf(l.name, categoryFigure(d, y, l), l.amount / d.categories.total.amount, categoriesMax)),
      allocationNote: b.departmentDetails!.allocationNote,
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
  const byId = new Map(b.departmentDetails!.departments.map((d) => [d.id, d]));
  const office = (d: DepartmentBudgetDetail): AdminHubOfficeView => {
    const gf = d.funding.lines.find((l) => l.name === 'General Fund');
    const overhead = d.funding.lines.find((l) => l.name.startsWith('Overhead Charges'));
    const note: LedeFragment[] = [];
    let gfPlusOverhead = 0;
    if (gf) {
      gfPlusOverhead = gf.amount + overhead!.amount;
      note.push({ text: 'General Fund ', figure: fundingFigure(d, y, gf) });
      note.push({ text: ' plus ', figure: fundingFigure(d, y, overhead!) });
      note.push({ text: ' in overhead charged to other funds.' });
    } else {
      // Information Technology Services: an internal service fund, charged across departments.
      note.push({ text: 'Rather than a line on the General Fund summary, its costs are charged across departments as direct charges — ', figure: fundingFigure(d, y, d.funding.lines[0]) });
      note.push({ text: ' to the General Fund and ', figure: fundingFigure(d, y, d.funding.lines[1]) });
      note.push({ text: ' to other funds.' });
    }
    if (d.id === 'city-attorney') {
      note.push({ text: ' Its ', figure: totalFigure(d, y) });
      note.push({ text: ' total includes the ', figure: riskFigure(d, y) });
      note.push({ text: ' Risk Management internal service fund.' });
    }
    return { id: d.id, name: d.name, href: `${cityPath}departments/${d.id}/`, color: families.color('administrative-departments'), total: totalFigure(d, y), note, gfPlusOverhead };
  };
  const offices = hub.memberIds.map((id) => office(byId.get(id)!));
  return {
    kind: 'hub',
    id: hub.id,
    name: hub.name,
    yearLabel: y,
    allDepartmentsHref: `${cityPath}departments/`,
    description: hub.description,
    summary: summaryFigure(b, y, 'administrative-departments'),
    generalFundOffices: offices
      .filter((o) => o.id !== 'information-technology-services')
      .sort((a, z) => z.gfPlusOverhead - a.gfPlusOverhead),
    internalService: offices.find((o) => o.id === 'information-technology-services')!,
  };
}
