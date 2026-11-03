/**
 * The "What staff cost" section (#65): each block of budget.json's `staffCosts` as figures and bars. Every figure and
 * every bar segment is its own receipt. A block holds one document's figures on one basis, and the section holds one
 * city's blocks only: these numbers are never set beside another city's (see the site FAQ, why-not-compare-staff-costs).
 */
import type { CityBudget, HistoryBasis, StaffAs, StaffFigure, StaffSection, StepNote } from '../data/types.ts';
import { shortMoney } from './format.ts';
import type { Figure } from './receipts.ts';

export const STAFF_FAQ = 'why-not-compare-staff-costs';

/** The City's word for a column, for labels. */
export const STAFF_AS_WORD: Record<StaffAs, string> = { actual: 'actual', estimate: 'estimate', adopted: 'adopted', proposed: 'proposed', baseline: 'baseline' };

export interface StaffSegment {
  name: string;
  /** 0, 1, 2: its legend entry, for its color. */
  index: number;
  figure: Figure;
  text: string;
  /** Its length on the block's scale, in percent. */
  width: number;
  /** Its share of the year's General Fund total, where the block shows one. */
  share?: { figure: Figure; text: string };
}

export interface StaffBar {
  year: number;
  /** "FY2027 proposed". */
  label: string;
  basis: HistoryBasis;
  segments: StaffSegment[];
  /** The stacked bar's total: as printed, or the sum of its parts (built, with the parts in its receipt). */
  total?: { figure: Figure; text: string };
}

export interface StaffSectionView {
  id: string;
  title: string;
  basis: StepNote;
  notes: StepNote[];
  figures: { name: string; asOf: string; figure: Figure; text: string }[];
  bars?: { layout: 'stacked' | 'grouped'; legend: string[]; rows: StaffBar[] };
}

export interface StaffCostsView {
  sections: StaffSectionView[];
  unpublished: string[];
}

const figureOf = (f: StaffFigure, label: string): Figure => ({
  value: f.value,
  label,
  ref: f.cite,
  tone: 'neutral',
  ...(f.percent ? { format: 'percent' as const } : {}),
});
/** "70.4%" as printed (one decimal); a share we divide is shown whole ("66%"), its receipt exact. */
const printedPercent = (v: number) => `${(v * 100).toFixed(1)}%`;
const wholePercent = (v: number) => `${Math.round(v * 100)}%`;
const text = (f: StaffFigure) => (f.percent ? printedPercent(f.value) : shortMoney(f.value));
/** A figure on its own: under $1M, to the dollar ($842,472, not $842K), as the City prints it. */
const cardText = (f: StaffFigure) => (!f.percent && Math.abs(f.value) < 1e6 ? full(f.value) : text(f));
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const full = (v: number) => `$${v.toLocaleString('en-US')}`;

function bars(s: StaffSection, fy: (year: number) => string): StaffSectionView['bars'] {
  if (!s.bars) return undefined;
  const { layout, legend, periods } = s.bars;
  const length = (p: (typeof periods)[number]) => (layout === 'stacked' ? (p.total?.value ?? p.parts.reduce((t, x) => t + x.value, 0)) : Math.max(...p.parts.map((x) => x.value)));
  const max = Math.max(...periods.map(length));
  const rows = periods.map((p): StaffBar => {
    const label = `${fy(p.year)} ${STAFF_AS_WORD[p.as]}`;
    const segments = p.parts.map((f, i) => {
      const of = p.of;
      return {
        name: legend[i],
        index: i,
        figure: figureOf(f, `${legend[i]}, ${label}`),
        text: text(f),
        width: (f.value / max) * 100,
        ...(of
          ? {
              share: {
                figure: {
                  value: f.value / of.value,
                  format: 'percent',
                  label: `${legend[i]} as a share of ${lower(of.label)}, ${label}: ${full(f.value)} ÷ ${full(of.value)}`,
                  ref: f.cite,
                  tone: 'neutral',
                } satisfies Figure,
                text: wholePercent(f.value / of.value),
              },
            }
          : {}),
      };
    });
    let total: StaffBar['total'];
    if (layout === 'stacked' && p.parts.length > 1) {
      const value = p.total?.value ?? p.parts.reduce((t, x) => t + x.value, 0);
      const figure: Figure = p.total
        ? figureOf(p.total, `${p.total.label}, ${label}`)
        : {
            value,
            label: `${legend.join(' plus ')}, ${label}`,
            ref: p.parts[0].cite,
            tone: 'neutral',
            parts: p.parts.map((f, i) => ({ label: legend[i], value: f.value })),
          };
      total = { figure, text: shortMoney(value) };
    }
    return { year: p.year, label, basis: p.basis, segments, ...(total ? { total } : {}) };
  });
  return { layout, legend, rows };
}

export function staffCostsView(b: CityBudget, fy: (year: number) => string): StaffCostsView | undefined {
  if (!b.staffCosts) return undefined;
  return {
    unpublished: b.staffCosts.unpublished ?? [],
    sections: b.staffCosts.sections.map((s) => ({
      id: s.id,
      title: s.title,
      basis: s.basis,
      notes: s.notes,
      figures: s.figures.map((f) => ({ name: f.name, asOf: f.asOf, figure: figureOf(f, `${f.name}, ${f.asOf}`), text: cardText(f) })),
      bars: bars(s, fy),
    })),
  };
}
