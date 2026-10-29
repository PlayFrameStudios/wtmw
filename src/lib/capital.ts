/**
 * Figures for a city's Capital page: the two-year capital program against the
 * repair backlog, and a squarified treemap of where the program's money comes
 * from. Legend groups are editorial, in data/cities/{city}/capital-groups.json.
 */
import type { CityBudget, DocCapitalLine } from '../data/types.ts';
import { shortMoney } from './format.ts';
import { dataDirOf } from './cities.ts';
import type { Figure } from './receipts.ts';

export interface CapitalGroupDef {
  id: string;
  name: string;
  color: string;
  /** Fund names exactly as the City's table prints them. */
  funds: string[];
  merge?: boolean;
  blockName?: string;
}
export interface CapitalGroupsFile {
  otherBelowShare: number;
  groups: CapitalGroupDef[];
  /** Readable names for funds the table abbreviates. */
  names?: Record<string, string>;
}

/** A line inside a block, as the receipt and screen readers list it. */
export interface BlockLine {
  name: string;
  total: number;
}

const files = import.meta.glob<CapitalGroupsFile>('/data/cities/*/*/*/capital-groups.json', { eager: true, import: 'default' });

export function capitalGroupsFor(cityPath: string): CapitalGroupsFile {
  const f = files[`${dataDirOf(cityPath)}capital-groups.json`];
  if (!f) throw new Error(`${cityPath} has no capital-groups.json`);
  return f;
}

export const OTHER_COLOR = '#9a9ea5';

/* ---------- Squarified treemap (Bruls, Huizing & van Wijk) ---------- */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Lays values (sorted biggest first) into a w×h box; returns one rect per value, same order. */
export function squarify(values: number[], w: number, h: number): Rect[] {
  const total = values.reduce((a, v) => a + v, 0);
  const scale = (w * h) / total;
  const areas = values.map((v) => v * scale);
  const out: Rect[] = [];
  let box = { x: 0, y: 0, w, h };
  let row: number[] = [];
  const worst = (r: number[], side: number) => {
    const s = r.reduce((a, v) => a + v, 0);
    const max = Math.max(...r);
    const min = Math.min(...r);
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const layRow = (r: number[]) => {
    const s = r.reduce((a, v) => a + v, 0);
    if (box.w >= box.h) {
      // Column on the left, full height.
      const cw = s / box.h;
      let y = box.y;
      for (const a of r) {
        const rh = a / cw;
        out.push({ x: box.x, y, w: cw, h: rh });
        y += rh;
      }
      box = { x: box.x + cw, y: box.y, w: box.w - cw, h: box.h };
    } else {
      // Row along the top, full width.
      const rh = s / box.w;
      let x = box.x;
      for (const a of r) {
        const cw = a / rh;
        out.push({ x, y: box.y, w: cw, h: rh });
        x += cw;
      }
      box = { x: box.x, y: box.y + rh, w: box.w, h: box.h - rh };
    }
  };
  for (const a of areas) {
    const side = Math.min(box.w, box.h);
    if (row.length === 0 || worst([...row, a], side) <= worst(row, side)) row.push(a);
    else {
      layRow(row);
      row = [a];
    }
  }
  if (row.length) layRow(row);
  return out;
}

/* ---------- Contrast: white or ink label on a block color ---------- */

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
export const INK = '#16191d';
/** White if it reaches 4.5:1 on the color, else ink. */
export const labelColor = (bg: string) => (contrast('#ffffff', bg) >= 4.5 ? '#ffffff' : INK);

/* ---------- The page ---------- */

/**
 * Box shapes the treemap is laid out for, in px, at the SMALLEST size each is
 * shown at (labels must fit there): wide from 64rem (a ~960px box), tall below
 * (a 358px box at 390px; capped at 40rem wide in the page CSS).
 */
export const LAYOUTS = { wide: { w: 960, h: 416 }, tall: { w: 358, h: 636 } } as const;
type LayoutKey = keyof typeof LAYOUTS;
export type Fit = 'full' | 'small' | 'none';
/** Label sizes per layout, matching the page CSS: font px and padding px for full and small labels. */
const TYPE = { wide: { full: [15, 12], small: [12, 8] }, tall: { full: [13, 8], small: [12, 8] } } as const;
/** Rough width of bold sans text: 0.62em per character, generous for this font. */
const textW = (s: string, px: number) => s.length * px * 0.62;
/** Does "name / $value" fit in r at this size? Greedy word wrap, 1.25 line height, 2px border. */
const fitsAt = (name: string, value: string, r: Rect, px: number, pad: number) => {
  const inner = r.w - 2 * pad - 4;
  const words = name.split(' ');
  if (Math.max(...words.map((w) => textW(w, px)), textW(value, px)) > inner) return false;
  let lines = 1;
  let line = 0;
  for (const w of words) {
    const add = textW((line ? ' ' : '') + w, px);
    if (line + add > inner) {
      lines += 1;
      line = textW(w, px);
    } else line += add;
  }
  return (lines + 1) * px * 1.25 + 2 * pad + 4 + 2 <= r.h;
};
const fit = (k: LayoutKey, name: string, value: string, r: Rect): Fit =>
  fitsAt(name, value, r, TYPE[k].full[0], TYPE[k].full[1]) ? 'full' : fitsAt(name, value, r, TYPE[k].small[0], TYPE[k].small[1]) ? 'small' : 'none';

export interface Block {
  id: string;
  name: string;
  value: number;
  color: string;
  text: string;
  group: string | null;
  lines: BlockLine[];
  figure: Figure;
  rect: Record<LayoutKey, Rect>;
  fit: Record<LayoutKey, Fit>;
}

export function capitalPage(b: CityBudget, file: CapitalGroupsFile) {
  const c = b.documentFacts.capitalProgram;
  const total = c.total.total;
  const sum = c.lines.reduce((a, l) => a + l.total, 0);
  if (sum !== total) throw new Error(`capital lines sum to ${sum}, but the total says ${total}`);

  const groupOf = new Map<string, CapitalGroupDef>();
  for (const g of file.groups)
    for (const fund of g.funds) {
      if (groupOf.has(fund)) throw new Error(`capital-groups.json: "${fund}" is in both ${groupOf.get(fund)!.id} and ${g.id}`);
      groupOf.set(fund, g);
    }
  const unmapped = c.lines.map((l) => l.name).filter((f) => !groupOf.has(f));
  if (unmapped.length) throw new Error(`capital-groups.json: no group for ${unmapped.join(', ')}`);
  const stale = [...groupOf.keys(), ...Object.keys(file.names ?? {})].filter((f) => !c.lines.some((l) => l.name === f));
  if (stale.length) throw new Error(`capital-groups.json: no fund named ${stale.join(', ')} in the City's table`);
  const nameOf = (l: DocCapitalLine) => file.names?.[l.name] ?? l.name;

  const fig = (value: number, label: string, ref: DocCapitalLine, lines: BlockLine[]): Figure => ({
    value,
    label,
    ref,
    ...(lines.length > 1 ? { parts: lines.map((l) => ({ label: l.name, value: l.total })) } : {}),
  });

  type Raw = Omit<Block, 'rect' | 'fit'>;
  const raws: Raw[] = [];
  const small: DocCapitalLine[] = [];
  for (const g of file.groups.filter((x) => x.merge)) {
    const funds = c.lines.filter((l) => g.funds.includes(l.name));
    // A merged block lists its programs when the City breaks the fund down, otherwise its funds.
    const lines: BlockLine[] = funds.length === 1 && funds[0].parts ? funds[0].parts : funds.map((l) => ({ name: nameOf(l), total: l.total }));
    const value = funds.reduce((a, l) => a + l.total, 0);
    const name = `${g.blockName ?? g.name} (${lines.length} programs)`;
    raws.push({ id: g.id, name, value, color: g.color, text: labelColor(g.color), group: g.id, lines, figure: fig(value, `${name}, FY2027 + FY2028 capital funding`, funds[0], lines) });
  }
  for (const l of c.lines) {
    const g = groupOf.get(l.name)!;
    if (g.merge) continue;
    if (l.total / total < file.otherBelowShare) {
      small.push(l);
      continue;
    }
    const name = nameOf(l);
    raws.push({ id: name, name, value: l.total, color: g.color, text: labelColor(g.color), group: g.id, lines: [{ name, total: l.total }], figure: fig(l.total, `${name}, FY2027 + FY2028 capital funding`, l, []) });
  }
  raws.sort((x, y) => y.value - x.value);
  if (small.length) {
    const value = small.reduce((a, l) => a + l.total, 0);
    const name = `Other sources (${small.length})`;
    small.sort((x, y) => y.total - x.total);
    const lines = small.map((l) => ({ name: nameOf(l), total: l.total }));
    // Other always goes last (bottom-right), whatever its size.
    raws.push({ id: 'other', name, value, color: OTHER_COLOR, text: labelColor(OTHER_COLOR), group: null, lines, figure: fig(value, `${name}, FY2027 + FY2028 capital funding`, small[0], lines) });
  }
  const pctRect = (r: Rect, L: { w: number; h: number }): Rect => ({ x: (r.x / L.w) * 100, y: (r.y / L.h) * 100, w: (r.w / L.w) * 100, h: (r.h / L.h) * 100 });
  const laid = Object.fromEntries((Object.keys(LAYOUTS) as LayoutKey[]).map((k) => [k, squarify(raws.map((r) => r.value), LAYOUTS[k].w, LAYOUTS[k].h)])) as Record<LayoutKey, Rect[]>;
  const blocks: Block[] = raws.map((r, i) => ({
    ...r,
    rect: { wide: pctRect(laid.wide[i], LAYOUTS.wide), tall: pctRect(laid.tall[i], LAYOUTS.tall) },
    fit: { wide: fit('wide', r.name, shortMoney(r.value), laid.wide[i]), tall: fit('tall', r.name, shortMoney(r.value), laid.tall[i]) },
  }));

  const visibleGroups = new Set(blocks.map((x) => x.group));
  const legend = file.groups.filter((g) => visibleGroups.has(g.id)).map((g) => ({ id: g.id, name: g.name, color: g.color }));
  const gf = blocks.find((x) => file.groups.find((g) => g.id === x.id)?.merge)!;

  const need = b.documentFacts.capitalNeed;
  const bl = b.citedFacts.backlog;
  const max = Math.max(need.amount, bl.high);
  const gap = b.deficitBridge.steps.find((s) => s.key === 'final-gap')!;
  return {
    total: {
      value: total,
      fy2027: c.total.years[2027],
      fy2028: c.total.years[2028],
      figure: {
        value: total,
        label: 'Capital program, FY2027 + FY2028, all funding sources',
        ref: c,
        tone: 'neutral',
        parts: [
          { label: 'FY2027', value: c.total.years[2027] },
          { label: 'FY2028', value: c.total.years[2028] },
        ],
      } satisfies Figure,
    },
    /** The FY27–31 CIP's unfunded capital and maintenance need: the City's newest figure. */
    need: {
      value: need.amount,
      growth: b.documentFacts.capitalNeedGrowth.rate,
      figure: { value: need.amount, label: 'Unfunded capital and maintenance need, FY2027–31 CIP', ref: need, tone: 'neutral' } satisfies Figure,
      growthCite: b.documentFacts.capitalNeedGrowth,
    },
    /** The bond-planning page's earlier range, and what it counted. */
    backlog: {
      fact: bl,
      figure: { value: bl.low, label: 'Unfunded infrastructure and deferred maintenance, earlier City estimate (low end)', ref: bl, tone: 'neutral' } satisfies Figure,
    },
    /** Scale: one axis from 0 to the larger of the two need estimates. */
    scale: { program: total / max, need: need.amount / max },
    blocks,
    legend,
    generalFund: gf,
    gap: { value: Math.abs(gap.years[2027]), figure: { value: gap.years[2027], label: 'FY2027 General Fund gap, after adjustments', ref: gap } satisfies Figure },
  };
}
