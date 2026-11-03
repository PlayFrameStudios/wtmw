/**
 * What the Council restored at adoption (#63), for the department notes on The Gap's cuts and the Ballot page. The
 * department figures stay the proposal's, as printed; a restoration is shown beside its cut, never netted against it.
 */
import { hasGapPlan, type CityBudget, type DocRef, type Restoration } from '../data/types.ts';
import type { Figure } from './receipts.ts';

export interface RestorationNote {
  r: Restoration;
  /** FY2027's amount, built from the motion's lines when there are several. */
  figure: Figure;
  /** The motion that carried, which says the positions are funded in both years when they are. */
  motion: DocRef;
}

/** Each restored department's note, by department id; empty for a city with no adoption amendments. */
export function restorationsFor(b: CityBudget): Map<string, RestorationNote> {
  if (!hasGapPlan(b)) return new Map();
  const { restored, motion } = b.documentFacts.adoptionAmendments;
  const names = new Map(b.departmentReductions[0].departments.map((d) => [d.id, d.name]));
  return new Map(
    restored.map((r) => [
      r.department,
      {
        r,
        motion,
        figure: {
          value: r.amount,
          label: `${names.get(r.department)}: restored at adoption, FY2027`,
          ref: r.cite,
          tone: 'neutral',
          ...(r.lines.length > 1 ? { parts: r.lines.map((l) => ({ label: l.label, value: l.amount })) } : {}),
        } satisfies Figure,
      },
    ]),
  );
}

/** "$1.73M", "$236,000": enough digits that the reader can find the amount in the motion's table. */
export function restoredMoney(v: number): string {
  return v >= 1e6 ? `$${(Math.round(v / 1e4) / 100).toFixed(2)}M` : `$${v.toLocaleString('en-US')}`;
}
