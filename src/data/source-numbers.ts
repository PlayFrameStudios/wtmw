/**
 * Source numbers run S1…Sn across a city's files, each file continuing where the ones before it stopped
 * (workbook, documents.json, coverage.json, faq.json). documents.json may also number a City document past the
 * files after it, so a document found later doesn't renumber every source after it (#63: the May 19 proposed
 * budget is S40). checkNumbering runs once every file has added its sources.
 */
import type { Source } from './types.ts';

/** The first number no source has taken yet. */
export function nextNumber(sources: Pick<Source, 'number'>[]): number {
  const taken = new Set(sources.map((s) => s.number));
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

/**
 * A file's sources, numbered from their ids: the first continues at `first`, and each later one follows the one
 * before it or jumps past the files numbered after this one (a document found later, #63 and #64). Returns errors
 * for an id that would go back.
 */
export function numberFromIds<S extends Pick<Source, 'id'>>(sources: S[], first: number, file: string): { sources: (S & { number: number })[]; errors: string[] } {
  const errors: string[] = [];
  const numbered = sources.map((s) => ({ ...s, number: Number(s.id.slice(1)) }));
  numbered.forEach((s, i) => {
    const expected = i === 0 ? first : numbered[i - 1].number + 1;
    if (!/^S\d+$/.test(s.id) || s.number < expected) errors.push(`${file}: source ${i + 1} is ${s.id}, expected S${expected} or later (it continues the numbering)`);
  });
  return { sources: numbered, errors };
}

/** S1…Sn, each once, and each id matching its number; returns errors. */
export function checkNumbering(sources: Pick<Source, 'id' | 'number'>[]): string[] {
  const errors: string[] = [];
  const seen = new Map<number, string>();
  for (const s of sources) {
    if (s.id !== `S${s.number}`) errors.push(`source ${s.id} is numbered ${s.number}`);
    const before = seen.get(s.number);
    if (before) errors.push(`two sources are numbered ${s.number}: ${before} and ${s.id}`);
    seen.set(s.number, s.id);
  }
  const missing = Array.from({ length: Math.max(0, ...seen.keys()) }, (_, i) => i + 1).filter((n) => !seen.has(n));
  if (missing.length) errors.push(`no source is numbered ${missing.join(', ')}: the numbers must run S1–S${Math.max(...seen.keys())} with no gaps`);
  return errors;
}

/** In number order, for the Sources page and the downloads. */
export const byNumber = <T extends Pick<Source, 'number'>>(sources: T[]): T[] => [...sources].sort((a, b) => a.number - b.number);
