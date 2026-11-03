/**
 * Staff positions (#60): the figures stay as each city's budget prints them, fractions and all, and a city's scope
 * sentence ("regular positions only") is in its own words: every quote it cites must be on its page. Each check is
 * also broken on purpose, against the real excerpts, so a passing test proves the check runs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Excerpts } from '../../src/data/documents';
import { buildFremont, type FremontDocuments } from '../../src/data/fremont/build';
import { buildLafayette, type LafayetteDocuments } from '../../src/data/lafayette/build';
import { readDocuments } from '../../src/data/pipeline';
import type { CityBudget, StepNote } from '../../src/data/types';

const root = join(import.meta.dirname, '../..');
const budgetOf = (city: string): CityBudget => JSON.parse(readFileSync(join(root, `data/cities/us/ca/${city}/budget.json`), 'utf8'));
const siteFaq: { questions: { id: string; question: string; paragraphs: { text: string; cites?: unknown[]; unsourced?: string }[] }[] } = JSON.parse(
  readFileSync(join(root, 'data/site/faq.json'), 'utf8'),
);

let fremont: { file: FremontDocuments; excerpts: Excerpts };
let lafayette: { file: LafayetteDocuments; excerpts: Excerpts };

beforeAll(async () => {
  const f = await readDocuments(join(root, 'data/cities/us/ca/fremont'));
  fremont = { file: f.file as unknown as FremontDocuments, excerpts: f.excerpts };
  const l = await readDocuments(join(root, 'data/cities/us/ca/lafayette'));
  lafayette = { file: l.file as unknown as LafayetteDocuments, excerpts: l.excerpts };
});

const withScope = <T extends { staffingScope?: StepNote }>(file: T, scope: StepNote): T => ({ ...file, staffingScope: scope });

describe('staffing figures (#60: unchanged, as printed)', () => {
  it('Fremont 994.24, Lafayette 50.10, Berkeley 1,559.54', () => {
    expect(budgetOf('fremont').staffing.fte).toBe(994.24);
    expect(budgetOf('lafayette').staffing.fte).toBe(50.1);
    expect(budgetOf('berkeley').staffing.fte).toBe(1559.54);
  });
});

describe('staffing scope', () => {
  it("Fremont's and Lafayette's come from their own documents; Berkeley's source doesn't say, so it has none", () => {
    expect(budgetOf('fremont').staffing.scope).toMatchObject({
      text: expect.stringMatching(/^The count covers regular positions only/),
      cites: [{ source: 'S1', page: 39 }, { source: 'S1', page: 282 }],
    });
    expect(budgetOf('lafayette').staffing.scope).toMatchObject({
      text: expect.stringMatching(/temporary and seasonal staff who aren't counted\.$/),
      cites: [{ source: 'S3', page: 12, quote: 'The City employs 50.1 FTE regular employees as well as many temporary and seasonal' }],
    });
    expect(budgetOf('berkeley').staffing.scope).toBeUndefined();
  });

  it('builds clean as it stands', () => {
    expect(buildFremont(fremont.file, fremont.excerpts).errors).toEqual([]);
    expect(buildLafayette(lafayette.file, lafayette.excerpts).errors).toEqual([]);
  });

  it('a quote that is not on its cited page fails the build', () => {
    const f = fremont.file.staffingScope!;
    const wrongPage = { ...f, cites: [{ ...f.cites[0], page: 40 }, f.cites[1]] };
    expect(() => buildFremont(withScope(fremont.file, wrongPage), fremont.excerpts)).toThrow(
      'documents.json staffingScope: "The total authorized regular staffing level of 994.24" is not on S1 page 40',
    );
    const l = lafayette.file.staffingScope!;
    const misquoted = { ...l, cites: [{ ...l.cites[0], quote: 'The City employs 50.1 FTE regular employees and no temporary or seasonal' }] };
    expect(() => buildLafayette(withScope(lafayette.file, misquoted), lafayette.excerpts)).toThrow(/staffingScope: ".*" is not on S3 page 12/);
  });

  it('…and so does a page whose text no longer has it', () => {
    const copy = structuredClone(fremont.excerpts);
    copy.S1!['39'] = copy.S1!['39'].replace('regular staffing level', 'staffing level');
    expect(() => buildFremont(fremont.file, copy)).toThrow(/staffingScope: "The total authorized regular staffing level of 994.24" is not on S1 page 39/);
  });

  it('needs a cite, and every number in its text must be in a quote it cites', () => {
    const l = lafayette.file.staffingScope!;
    expect(buildLafayette(withScope(lafayette.file, { ...l, cites: [] }), lafayette.excerpts).errors).toContain('documents.json staffingScope: needs a cite');
    const numbered = { ...l, text: 'The count covers 52 regular positions.' };
    expect(buildLafayette(withScope(lafayette.file, numbered), lafayette.excerpts).errors).toContain("documents.json staffingScope: 52 isn't in a quote it cites");
  });

  it('an unknown source is an error', () => {
    const l = lafayette.file.staffingScope!;
    const unknown = { ...l, cites: [{ ...l.cites[0], source: 'S99' as const }] };
    expect(buildLafayette(withScope(lafayette.file, unknown), lafayette.excerpts).errors).toContain('documents.json staffingScope: unknown source S99');
  });
});

describe('site FAQ: staff-positions-fte', () => {
  it('follows the General Fund answer, and is marked unsourced (a definition, not any city’s figure)', () => {
    const ids = siteFaq.questions.map((q) => q.id);
    expect(ids[ids.indexOf('general-fund') + 1]).toBe('staff-positions-fte');
    const q = siteFaq.questions.find((x) => x.id === 'staff-positions-fte')!;
    expect(q.question).toBe('Why are staff positions shown as fractions?');
    expect(q.paragraphs).toHaveLength(1);
    expect(q.paragraphs[0].unsourced).toBe('Definition of the unit budgets use to count staff.');
    expect(q.paragraphs[0].cites ?? []).toEqual([]);
    expect(q.paragraphs[0].text).toMatch(/FTE counts budgeted positions, not people/);
  });
});
