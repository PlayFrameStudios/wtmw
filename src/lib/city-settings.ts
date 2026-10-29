/**
 * What a city's city.json says about which pages it gets and how it labels its years (#42).
 * Plain functions with no import.meta.glob, so the data check (scripts/build-data.ts), the
 * site build (src/lib/cities.ts) and the browser tests all read the same rules.
 *
 *   "budget":         { "cadence": "biennial", "years": [2027, 2028],
 *                       "labels": { "long": "FY{end}", "short": "FY{yy}", "spoken": "fiscal year {end}" } }
 *   "fiscalPosition": { "variant": "gap", "reason": { "text": "…", "cites": [{ "source": "S20", "page": 2, "quote": "…" }] } }
 *   "ballot":         true
 *   "featured":       true
 */
import { splitRow } from '../data/tables.ts';
import type { DocRef, StepNote } from '../data/types.ts';

/** The page explaining where a city stands: The Gap (a deficit) or Balance & Reserves (in balance). */
export type FiscalVariant = 'gap' | 'reserves';
export const FISCAL_VARIANTS: readonly FiscalVariant[] = ['gap', 'reserves'];

/** How a fiscal year is written: tokens {start} 2026, {end} 2027, {ss} 26, {yy} 27, for the year ending in 2027. */
export interface YearLabels {
  /** "FY2027", or "FY 2026/27" */
  long: string;
  /** "FY27", or "FY26/27" */
  short: string;
  /** In a sentence: "fiscal year 2027" */
  spoken: string;
}

export interface CitySettings {
  budget: {
    cadence: 'annual' | 'biennial';
    /** Fiscal years of the current budget, by the year each ends in: [2027] or [2027, 2028]. */
    years: number[];
    labels: YearLabels;
  };
  /** Chosen by an editor, not computed: a city can be balanced only because of cuts or one-time money. */
  fiscalPosition: { variant: FiscalVariant; reason: StepNote };
  /** On only while the city has a measure that matters to its budget. */
  ballot: boolean;
  /** The landing page's headline figures come from the featured city. */
  featured: boolean;
}

/** The data file each switchable page needs, in the folder its budget data comes from (or, for reserves, the city's own). */
export const PAGE_DATA = {
  gap: 'budget.json',
  reserves: 'reserves.json',
  ballot: 'ballot.json',
} as const;

const TOKEN = /\{(start|end|ss|yy)\}/g;

/** A fiscal year in the city's own style: fy(labels, 2027, 'long') is "FY2027" for Berkeley and "FY 2026/27" for Fremont. */
export function fy(labels: YearLabels, year: number, form: keyof YearLabels = 'long'): string {
  const parts: Record<string, string> = {
    start: String(year - 1),
    end: String(year),
    ss: String(year - 1).slice(-2),
    yy: String(year).slice(-2),
  };
  return labels[form].replace(TOKEN, (_, t: string) => parts[t]);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function docRef(v: unknown, where: string): DocRef {
  if (!isObject(v) || typeof v.source !== 'string' || !/^S\d+$/.test(v.source)) throw new Error(`${where}: needs a "source" like "S20"`);
  if (typeof v.quote !== 'string' || !v.quote.trim()) throw new Error(`${where}: needs the "quote" it rests on`);
  if (v.page !== undefined && !(Number.isInteger(v.page) && (v.page as number) > 0)) throw new Error(`${where}: "page" must be a PDF page number`);
  return v as unknown as DocRef;
}

/**
 * Reads and checks a city.json's settings. `exists(file)` says whether a data file is there for this
 * city (budget.json and ballot.json where its budget data lives, reserves.json in its own folder),
 * so a city can't switch on a page it has nothing to put on. Throws with the reason.
 */
export function parseSettings(file: string, raw: Record<string, unknown>, exists: (name: string) => boolean): CitySettings {
  const b = raw.budget;
  if (!isObject(b)) throw new Error(`${file}: missing "budget" (cadence, years and year labels)`);
  if (b.cadence !== 'annual' && b.cadence !== 'biennial') throw new Error(`${file}: budget.cadence must be "annual" or "biennial"`);
  const years = b.years;
  if (!Array.isArray(years) || !years.every((y) => Number.isInteger(y) && y > 1900)) throw new Error(`${file}: budget.years must list fiscal years, e.g. [2027]`);
  const want = b.cadence === 'annual' ? 1 : 2;
  if (years.length !== want) throw new Error(`${file}: a ${b.cadence} budget covers ${want} fiscal year${want > 1 ? 's' : ''}, but budget.years lists ${years.length}`);
  if (years.some((y, i) => i > 0 && y !== years[i - 1] + 1)) throw new Error(`${file}: budget.years must be consecutive`);
  const labels = b.labels;
  if (!isObject(labels)) throw new Error(`${file}: missing budget.labels (long, short, spoken)`);
  for (const form of ['long', 'short', 'spoken'] as const) {
    const l = labels[form];
    if (typeof l !== 'string' || !/\{(end|yy)\}/.test(l)) throw new Error(`${file}: budget.labels.${form} must name the year, e.g. "FY{end}"`);
  }

  const fp = raw.fiscalPosition;
  if (!isObject(fp)) throw new Error(`${file}: missing "fiscalPosition" (the variant and the cited reason for it)`);
  if (!FISCAL_VARIANTS.includes(fp.variant as FiscalVariant)) throw new Error(`${file}: fiscalPosition.variant must be one of ${FISCAL_VARIANTS.join(', ')}`);
  const reason = fp.reason;
  if (!isObject(reason) || typeof reason.text !== 'string' || !reason.text.trim()) {
    throw new Error(`${file}: fiscalPosition needs a "reason" with the text and the document it rests on`);
  }
  if (!Array.isArray(reason.cites) || reason.cites.length === 0) throw new Error(`${file}: fiscalPosition.reason must cite at least one document`);
  reason.cites.forEach((c, i) => docRef(c, `${file}: fiscalPosition.reason.cites[${i}]`));

  if (typeof raw.ballot !== 'boolean') throw new Error(`${file}: "ballot" must be true or false`);
  if (raw.featured !== undefined && typeof raw.featured !== 'boolean') throw new Error(`${file}: "featured" must be true or false`);

  const variant = fp.variant as FiscalVariant;
  if (!exists(PAGE_DATA[variant])) throw new Error(`${file}: fiscalPosition.variant "${variant}" needs ${PAGE_DATA[variant]}, and there isn't one`);
  if (raw.ballot && !exists(PAGE_DATA.ballot)) throw new Error(`${file}: "ballot" is on, but there is no ${PAGE_DATA.ballot}`);

  return {
    budget: { cadence: b.cadence, years: years as number[], labels: labels as unknown as YearLabels },
    fiscalPosition: { variant, reason: reason as unknown as StepNote },
    ballot: raw.ballot,
    featured: raw.featured === true,
  };
}

/* ---------- Reserves (reserves.json) ---------- */

export interface ReservesFile {
  /** The fiscal year the amounts are for, by the year it ends in. */
  year: number;
  /**
   * `amount` quotes a sentence holding one dollar figure, or a table row with `figure`, the cell to
   * read (1 is the first), and `unit`, what a printed figure is worth (1000 for a table in thousands).
   */
  reserves: { key: string; name: string; purpose: string; amount: DocRef & { figure?: number; unit?: number } }[];
}

export interface Reserve {
  key: string;
  name: string;
  /** What the reserve is for, in plain language. */
  purpose: string;
  /** Parsed from the quote, never typed in. */
  value: number;
  ref: DocRef;
}

/** Checks a reserves.json and reads each amount from its quote: its one dollar figure, or the table row's `figure`th cell times `unit`. */
export function parseReserves(file: string, raw: unknown): { year: number; reserves: Reserve[] } {
  if (!isObject(raw) || !Number.isInteger(raw.year)) throw new Error(`${file}: needs "year", the fiscal year the amounts are for`);
  if (!Array.isArray(raw.reserves) || raw.reserves.length === 0) throw new Error(`${file}: "reserves" must list at least one reserve`);
  const seen = new Set<string>();
  const reserves = raw.reserves.map((r: unknown, i: number) => {
    const where = `${file}: reserves[${i}]`;
    if (!isObject(r)) throw new Error(`${where}: expected an object`);
    for (const k of ['key', 'name', 'purpose'] as const) {
      if (typeof r[k] !== 'string' || !(r[k] as string).trim()) throw new Error(`${where}: missing "${k}"`);
    }
    if (seen.has(r.key as string)) throw new Error(`${where}: duplicate key "${r.key}"`);
    seen.add(r.key as string);
    const { figure, unit, ...ref } = docRef(r.amount, `${where}.amount`) as DocRef & { figure?: unknown; unit?: unknown };
    let value: number;
    if (figure !== undefined || unit !== undefined) {
      if (!Number.isInteger(figure) || (figure as number) < 1) throw new Error(`${where}.amount: "figure" must say which of the row's figures to read (1 is the first)`);
      if (!(typeof unit === 'number' && unit > 0)) throw new Error(`${where}.amount: "unit" must say what a printed figure is worth (1000 for thousands)`);
      const { cells } = splitRow(ref.quote);
      if ((figure as number) > cells.length) throw new Error(`${where}.amount: the row has ${cells.length} figures, so there is no figure ${figure}`);
      value = Math.round(cells[(figure as number) - 1] * unit);
    } else {
      const amounts = [...ref.quote.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)];
      if (amounts.length !== 1) throw new Error(`${where}.amount: the quote must hold exactly one dollar figure (or name the row's "figure" and "unit"), and it has ${amounts.length}`);
      value = Number(amounts[0][1].replace(/,/g, ''));
    }
    return { key: r.key as string, name: r.name as string, purpose: r.purpose as string, value, ref };
  });
  return { year: raw.year as number, reserves };
}
