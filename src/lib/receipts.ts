/**
 * Receipts: everything the drawer shows for a figure, resolved at build time
 * from budget.json. Nothing here is typed in by hand. Labels and parts come
 * from the page that shows the figure; everything about the source comes from
 * the data.
 */
import { csvTables } from '../data/csv.ts';
import { folio } from './open-at.ts';
import type { CityBudget, DocRef, Ref, Source, SourceId } from '../data/types.ts';
import type { City } from './cities.ts';
import { SITE } from './site.ts';

export type FigureFormat = 'usd' | 'number' | 'percent';

export interface FigurePart {
  label: string;
  value: number;
}

/** A number shown on a page, and where it came from. */
export interface Figure {
  value: number;
  /** What the number is: "FY2027 General Fund gap, after adjustments". */
  label: string;
  /** The budget.json record it was read from: a workbook row (table, row) or a City PDF page (page, quote). */
  ref: Ref | DocRef;
  format?: FigureFormat;
  /** Color meaning: 'short' (deficits and cuts, red) or 'one-time' (gold). Negative values default to 'short'. */
  tone?: 'short' | 'one-time' | 'neutral';
  /** Sources the page adds, e.g. news that also reported the figure. */
  related?: SourceId[];
  /** For a derived figure: how it's built ("How this number is built"). */
  parts?: FigurePart[];
  /** Words after the total line's number: "= $12,113 left over". */
  partsTotal?: string;
}

export interface SourceView {
  id: SourceId;
  number: number;
  type: Source['type'];
  /** "Primary source" for City documents, "Reporting" for news. */
  badge: string;
  publisher: string;
  title: string;
  committee?: string;
  /** "April 16, 2026" or "May 2022". */
  date?: string;
  url: string;
  /** "PDF" or "Web page", from the URL. */
  format: string;
  host: string;
  citation: string;
  /** PDF pages before printed page 1, when there are any: receipts cite the printed page. */
  pageOffset?: number;
  /** An Internet Archive copy, for a City server that refuses automated requests. */
  archive?: { url: string; date: string };
}

/** Serialized onto a chip and rendered by the drawer. */
export interface Receipt {
  kind: 'figure' | 'source';
  value?: string;
  tone?: 'short' | 'one-time' | 'neutral';
  label?: string;
  /** Primary source first, then the rest in the order given. */
  sources: SourceId[];
  table?: string;
  row?: number;
  /** PDF page and the sentence the figure is read from, for figures from City documents. */
  page?: number;
  quote?: string;
  /** For a figure read from a table row, the printed heading of its column: the quote is the whole row. */
  column?: string;
  /** Download for the table this figure came from. */
  csv?: string;
  /** One sign per line, then the amount without one: "+ Operating Reserve $4,177,541", "− Proposed Sales & Use Tax $9,443,000". */
  parts?: { sign: '+' | '−'; label: string; value: string }[];
  /** "= $12,113 left over": the figure itself, closing the sum. */
  total?: string;
  /** The other cites behind the same statement, each with its page and sentence if known (#29). */
  also?: AlsoCite[];
  citation: string;
}

const MINUS = '−';

/** Full precision, with a real minus sign: −$29,249,339. */
export function formatValue(value: number, format: FigureFormat = 'usd'): string {
  const sign = value < 0 ? MINUS : '';
  const abs = Math.abs(value);
  if (format === 'percent') return `${sign}${(abs * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
  const digits = abs.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return format === 'usd' ? `${sign}$${digits}` : `${sign}${digits}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-04-16" → "April 16, 2026"; "2022-05" → "May 2022". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return d ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${y}`;
}

export function sourceView(s: Source): SourceView {
  const url = new URL(s.url);
  const committee = s.committee?.replace(/\bCmte\b/, 'Committee');
  const date = s.date ? longDate(s.date) : undefined;
  const by = [s.publisher, committee].filter(Boolean).join(', ');
  return {
    id: s.id,
    number: s.number,
    type: s.type,
    badge: s.type === 'city' ? 'Primary source' : 'Reporting',
    publisher: s.publisher,
    title: s.title,
    committee,
    date,
    url: s.url,
    format: s.format ?? (/\.pdf$/i.test(url.pathname) ? 'PDF' : 'Web page'),
    host: url.hostname.replace(/^www\./, ''),
    citation: `${by}. "${s.title}."${date ? ` ${date}.` : ''} ${s.url}`,
    ...(s.pageOffset ? { pageOffset: s.pageOffset } : {}),
    ...(s.archive ? { archive: { url: s.archive.url, date: longDate(s.archive.date) } } : {}),
  };
}

export function sourcesById(budget: CityBudget): Map<SourceId, SourceView> {
  return new Map(budget.sources.map((s) => [s.id, sourceView(s)]));
}

/** "/us/ca/berkeley/data/deficit-bridge.csv" for the table a record came from. */
export function csvHref(budget: CityBudget, city: City, ref: Ref | DocRef): string | undefined {
  // A workbook row by its table and row; a document row by its page and quoted line.
  const same = (r: Partial<Ref & DocRef>) =>
    'quote' in ref ? r.source === ref.source && r.page === ref.page && r.quote === ref.quote : r.table === ref.table && r.row === ref.row;
  for (const t of csvTables(budget)) {
    if ((t.rows as Partial<Ref & DocRef>[]).some(same)) return `${city.path}data/${t.name}.csv`;
  }
  return undefined;
}

export function figureReceipt(budget: CityBudget, city: City, figure: Figure, pageUrl: URL): Receipt {
  const ids = [...new Set([figure.ref.source, ...(figure.ref.related ?? []), ...(figure.related ?? [])])];
  const views = sourcesById(budget);
  for (const id of ids) if (!views.has(id)) throw new Error(`figure "${figure.label}": unknown source ${id}`);
  if (figure.parts) {
    const sum = figure.parts.reduce((a, p) => a + p.value, 0);
    if (Math.abs(sum - figure.value) > 0.5) {
      throw new Error(`figure "${figure.label}": parts sum to ${sum}, not ${figure.value}`);
    }
  }
  const value = formatValue(figure.value, figure.format);
  const ref = figure.ref;
  const where =
    'quote' in ref ? `${ref.page ? `p. ${folio(views.get(ref.source)!, ref.page)}` : 'web page'}${ref.column ? `, column “${ref.column}”` : ''}` : `${ref.table}, row ${ref.row}`;
  const citation = [
    `${figure.label}: ${value}.`,
    ...ids.map((id, i) => `${i === 0 ? 'Source' : 'Also'}: ${views.get(id)!.citation}${i === 0 ? ` (${where})` : ''}.`),
    `Via ${SITE.name}, ${pageUrl.href}`,
  ].join('\n');
  return {
    kind: 'figure',
    value,
    tone: figure.tone ?? (figure.value < 0 ? 'short' : 'neutral'),
    label: figure.label,
    sources: ids,
    ...('quote' in ref ? { page: ref.page, quote: ref.quote, ...(ref.column && { column: ref.column }) } : { table: ref.table, row: ref.row }),
    csv: csvHref(budget, city, figure.ref),
    parts: figure.parts?.map((p) => ({
      sign: p.value < 0 ? MINUS : '+',
      label: p.label,
      value: formatValue(Math.abs(p.value), figure.format),
    })),
    ...(figure.parts ? { total: [value, figure.partsTotal].filter(Boolean).join(' ') } : {}),
    citation,
  };
}

/** Where in a document a statement comes from: the PDF page (if any) and the sentence it says. */
export interface At {
  page?: number;
  quote?: string;
}

/** Another document (or another page of the same one) behind the same statement. */
export interface AlsoCite {
  source: SourceId;
  page?: number;
  quote?: string;
}

/**
 * The receipt for a statement: its document, page and sentence. `also` adds the other
 * documents or pages the same sentence rests on, so one trigger lists them all (#29).
 */
export function sourceReceipt(budget: CityBudget, id: SourceId, pageUrl: URL, at: At = {}, also: AlsoCite[] = []): Receipt {
  const views = sourcesById(budget);
  const view = views.get(id);
  if (!view) throw new Error(`unknown source ${id}`);
  const sources: SourceId[] = [id];
  const more: AlsoCite[] = [];
  for (const { source, page, quote } of also) {
    if (!views.has(source)) throw new Error(`unknown source ${source}`);
    if (!sources.includes(source)) sources.push(source);
    if (source === id && page === at.page && quote === at.quote) continue;
    if (source !== id || page || quote) more.push({ source, ...(page ? { page } : {}), ...(quote ? { quote } : {}) });
  }
  const cite = (c: { source: SourceId; page?: number; quote?: string }) =>
    `${views.get(c.source)!.citation}${c.page ? ` (p. ${folio(views.get(c.source)!, c.page)})` : ''}.${c.quote ? `\n"${c.quote}"` : ''}`;
  return {
    kind: 'source',
    sources,
    ...at,
    ...(more.length ? { also: more } : {}),
    citation: `${cite({ source: id, ...at })}${more.map((c) => `\nAlso: ${cite(c)}`).join('')}\nVia ${SITE.name}, ${pageUrl.href}`,
  };
}

/** PDF pages cited per source, from anything holding {source, page} (documentFacts, ballot.json): "1, 55, 96". */
export function pagesBySource(...values: unknown[]): Map<SourceId, number[]> {
  const pages = new Map<SourceId, Set<number>>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.source === 'string' && typeof o.page === 'number') {
      const set = pages.get(o.source as SourceId) ?? new Set<number>();
      pages.set(o.source as SourceId, set.add(o.page));
    }
    Object.values(o).forEach(walk);
  };
  values.forEach(walk);
  return new Map([...pages].map(([id, set]) => [id, [...set].sort((a, b) => a - b)]));
}
