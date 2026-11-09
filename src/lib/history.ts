/**
 * The "Over the years" section (#64): each panel of budget.json's `history` as charts and a table. Every point is a
 * Figure, so it is its own receipt; a line never leaves its panel, so figures on different bases (Berkeley's annual
 * report and its budget) are never one line.
 */
import type { CityBudget, HistoryAs, HistoryBasis, HistoryLine, HistoryPanel, StepNote } from '../data/types.ts';
import type { Figure } from './receipts.ts';

export interface HistoryPoint {
  year: number;
  value: number;
  basis: HistoryBasis;
  as: HistoryAs;
  figure: Figure;
}

export interface HistoryLineView {
  id: string;
  label: string;
  kind: HistoryLine['kind'];
  points: HistoryPoint[];
}

/** One chart: its lines on one scale, with the years across and round-number gridlines. */
export interface HistoryChart {
  kind: 'flow' | 'balance';
  lines: HistoryLineView[];
  years: number[];
  max: number;
  ticks: number[];
  /**
   * A line another one covers (within 1% of the scale in every year they share: a balanced budget's revenue under
   * its spending), drawn wider beneath it so both show.
   */
  under?: { line: string; over: string; gap: number };
}

export interface HistoryPanelView {
  id: string;
  title: string;
  basis: StepNote;
  notes: StepNote[];
  /** Revenue, spending and transfers; then the fund balance, on its own scale, where the City prints it. */
  charts: HistoryChart[];
  /** Every line, net lines included, for the table. */
  lines: HistoryLineView[];
  /** The table's columns: each year once, with the City's word for it. */
  columns: { year: number; as: HistoryAs }[];
  adjustments: { reason: string; figure: Figure }[];
}

/** The City's word for a column, for labels: "actual", "estimate", "adopted", "proposed". */
export const AS_WORD: Record<HistoryAs, string> = { actual: 'actual', estimate: 'estimate', adopted: 'adopted', proposed: 'proposed' };

/** Round gridlines: 0 and steps of 1, 2 or 5 × 10ⁿ, up to the first at or above the largest value. */
export function ticksFor(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const ticks = [0];
  while (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function lineView(l: HistoryLine, fy: (year: number) => string): HistoryLineView {
  const points = l.series
    .flatMap((s) =>
      Object.entries(s.years).map(([y, value]) => ({
        year: Number(y),
        value,
        basis: s.basis,
        as: s.as,
        figure: { value, label: `${l.label}, ${fy(Number(y))} (${AS_WORD[s.as]})`, ref: s.cite, tone: 'neutral' } satisfies Figure,
      })),
    )
    .sort((a, b) => a.year - b.year);
  return { id: l.id, label: l.label, kind: l.kind, points };
}

function chart(kind: HistoryChart['kind'], lines: HistoryLineView[]): HistoryChart {
  const years = [...new Set(lines.flatMap((l) => l.points.map((p) => p.year)))].sort((a, b) => a - b);
  const ticks = ticksFor(Math.max(...lines.flatMap((l) => l.points.map((p) => p.value))));
  const max = ticks[ticks.length - 1];
  // The largest gap between two lines in the years they share, if they share any.
  const gap = (a: HistoryLineView, b: HistoryLineView) => {
    const shared = a.points.flatMap((p) => b.points.filter((q) => q.year === p.year).map((q) => Math.abs(p.value - q.value)));
    return shared.length ? Math.max(...shared) : Infinity;
  };
  const pairs = lines.flatMap((a, i) => lines.slice(i + 1).map((b) => ({ line: a.id, over: b.id, gap: gap(a, b) })));
  const under = pairs.find((p) => p.gap < max / 100);
  return { kind, lines, years, max, ticks, ...(under ? { under } : {}) };
}

export function historyPanels(b: CityBudget, fy: (year: number) => string): HistoryPanelView[] {
  return (b.history?.panels ?? []).map((p: HistoryPanel) => {
    const lines = p.lines.map((l) => lineView(l, fy));
    const charts = (['flow', 'balance'] as const).flatMap((kind) => {
      const mine = lines.filter((l) => l.kind === kind);
      return mine.length ? [chart(kind, mine)] : [];
    });
    const byYear = new Map<number, HistoryAs>();
    for (const l of lines) for (const pt of l.points) if (!byYear.has(pt.year)) byYear.set(pt.year, pt.as);
    const columns = [...byYear].sort(([a], [b]) => a - b).map(([year, as]) => ({ year, as }));
    const adjustments = p.adjustments.map((a) => ({
      reason: a.reason,
      figure: {
        value: a.from.value - a.to.value,
        label: `${a.from.label}, ${fy(a.from.year)}, less ${a.to.label.charAt(0).toLowerCase()}${a.to.label.slice(1)}, ${fy(a.to.year)}`,
        ref: a.from.cite,
        tone: 'neutral',
        parts: [
          { label: `${a.from.label}, ${fy(a.from.year)}`, value: a.from.value },
          { label: `${a.to.label}, ${fy(a.to.year)}`, value: -a.to.value },
        ],
      } satisfies Figure,
    }));
    return { id: p.id, title: p.title, basis: p.basis, notes: p.notes, charts, lines, columns, adjustments };
  });
}
