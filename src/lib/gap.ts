/**
 * Figures for a city's Gap page: the deficit bridge as a waterfall for each
 * year, how the city plans to close the FY2027 gap, and the one-time money in
 * and out. All from budget.json; the page only renders.
 */
import type { BridgeStep, GapBudget, StepNote } from '../data/types.ts';
import type { Figure } from './receipts.ts';

/** Plain-language step names, keyed by bridge step (the workbook's own labels are on each receipt). */
const LABELS: Record<string, string> = {
  'initial-estimate': 'Initial estimate',
  'revenue-projections': 'Revenue came in higher',
  'center-street-debt-service': '1947 Center St. debt service',
  // The City's term is stabilization; "propping up" put an adjective on money (#34).
  'parking-funds-stabilization': 'Support for parking funds',
  'non-departmental': 'Non-departmental costs',
  'before-one-time-resources': 'Before one-time money',
  'one-time-resources': 'One-time money',
  'final-gap': 'Gap to close',
};

export type StepKind = 'total' | 'subtotal' | 'up' | 'cost' | 'one-time' | 'final';

export interface WaterfallStep {
  key: string;
  label: string;
  kind: StepKind;
  value: number;
  /** Running position before and after this step (both ≤ 0 here: a deficit). */
  from: number;
  to: number;
  figure: Figure;
  /** "What is this step?", in plain words, with the City's wording it rests on. */
  note: StepNote;
}

/** The City's label for the bridge use, and what it is in plain words (#25). */
export const BRIDGE_PLAIN = 'Used to delay cuts until the sales-tax vote';

function waterfall(steps: BridgeStep[], year: number, label: string, notes: Record<string, StepNote>): WaterfallStep[] {
  const shown = steps.filter((s) => s.key !== 'after-revenue-projections'); // the mockup's 8 steps
  let running = 0;
  const out: WaterfallStep[] = [];
  for (const s of shown) {
    const value = s.years[year];
    const isTotal = s.kind === 'estimate' || s.kind === 'subtotal' || s.kind === 'total';
    const kind: StepKind =
      s.key === 'final-gap' ? 'final'
      : s.kind === 'subtotal' ? 'subtotal'
      : s.kind === 'estimate' ? 'total'
      : s.key === 'one-time-resources' ? 'one-time'
      : value >= 0 ? 'up' : 'cost';
    const from = isTotal ? 0 : running;
    const to = isTotal ? value : running + value;
    if (isTotal && Math.abs(value - running) > 0.5 && out.length) {
      throw new Error(`${label} ${s.key}: ${value} doesn't follow from the steps before it (${running})`);
    }
    running = to;
    // A subtotal's receipt shows how it's built: the last total and every step since.
    const since = out.slice(Math.max(0, out.findLastIndex((o) => o.kind === 'total' || o.kind === 'subtotal')));
    const parts =
      s.key === 'before-one-time-resources' || s.key === 'final-gap'
        ? since.map((o) => ({ label: o.label, value: o.value }))
        : undefined;
    const note = notes[s.key];
    if (!note) throw new Error(`${label} ${s.key}: no step note`);
    out.push({
      key: s.key,
      note,
      label: LABELS[s.key] ?? s.label,
      kind,
      value,
      from,
      to,
      figure: {
        value,
        label: `${label}: ${s.label}`,
        ref: s,
        tone: kind === 'up' ? 'neutral' : kind === 'one-time' ? 'one-time' : value < 0 ? 'short' : 'neutral',
        ...(parts ? { parts } : {}),
      },
    });
  }
  return out;
}

/**
 * `years` are the city's budget years (city.json), labeled in its own style ("FY2027"). Each year's
 * waterfall has a `key` ("fy2027") for the page's radios and ids.
 */
export function gapPage(b: GapBudget, years: number[], yearLabel: (year: number) => string) {
  const first = years[0];
  const views = years.map((year) => {
    const label = yearLabel(year);
    const steps = waterfall(b.deficitBridge.steps, year, label, b.documentFacts.stepNotes);
    return { year: `fy${year}`, label, steps, final: steps.at(-1)!, lowest: Math.min(...steps.flatMap((s) => [s.from, s.to])) };
  });

  const fy27 = b.departmentReductions.find((y) => y.year === first)!.total;
  const L = yearLabel(first);
  // Both budget years together: "FY2027-28".
  const span = `${L}-${String(years.at(-1)).slice(2)}`;
  const ot = b.oneTimeResources;
  const bridge = ot.uses.find((u) => /sales & use tax/i.test(u.label))!;
  const item = (i: (typeof ot.sources)[number], label: string): Figure => ({ value: i.amount, label, ref: i, tone: 'one-time' });

  return {
    years: views,
    close: {
      fails: {
        cuts: { value: fy27.reduction, label: `${L} department cuts if the sales tax fails`, ref: fy27, tone: 'short' } satisfies Figure,
        pct: fy27.reductionPct,
      },
      passes: {
        cuts: { value: fy27.netReduction, label: `${L} department cuts if the sales tax passes`, ref: fy27, tone: 'short' } satisfies Figure,
        pct: fy27.netReductionPct,
        softened: { value: fy27.salesTaxAllocation, label: `${L} cuts softened by one-time bridge money`, ref: fy27, tone: 'one-time' } satisfies Figure,
      },
      bridge: item(bridge, `One-time money used as a bridge until the sales-tax vote, ${span}`),
      total: fy27.reduction,
    },
    oneTime: {
      sources: ot.sources.map((s) => ({ ...s, figure: item(s, `One-time source: ${s.label}`) })),
      uses: ot.uses.map((u) => ({ ...u, figure: item(u, `One-time use: ${u.label}`) })),
      remaining: ot.remaining,
      remainingFigure: {
        value: ot.remaining,
        label: `One-time resources left over, ${span}`,
        ref: ot.uses.at(-1)!,
        tone: 'one-time',
        parts: [
          ...ot.sources.map((s) => ({ label: s.label, value: s.amount })),
          ...ot.uses.map((u) => ({ label: u === bridge ? `${BRIDGE_PLAIN} (City: "${u.label}")` : u.label, value: -u.amount })),
        ],
        partsTotal: 'left over',
      } satisfies Figure,
    },
  };
}
