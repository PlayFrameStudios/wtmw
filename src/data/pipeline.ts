/**
 * One entry per city that has budget data and how to turn it into budget.json:
 * from a workbook (Berkeley) or from City documents alone (Fremont).
 * `npm run data` runs every entry.
 */
import { createHash } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractBerkeley } from './berkeley/extract.ts';
import { validateBerkeley } from './berkeley/validate.ts';
import { ALWAYS_PAGES, applyCoverage, type CoverageFile } from './coverage.ts';
import { applyDocuments, checkQuotesIn, type DocumentsFile, type Excerpts } from './documents.ts';
import { buildFremont, type FremontDocuments } from './fremont/build.ts';
import { applySchools, type SchoolsFile } from './schools.ts';
import type { CityBudget, GapBudget } from './types.ts';
import { openWorkbook } from './workbook.ts';

type Pipeline =
  | { workbook: string; build: (path: string, meta: GapBudget['workbook'], cityDir: string) => Promise<Result> }
  | { workbook?: undefined; build: (cityDir: string) => Promise<Result> };

export const PIPELINES: Record<string, Pipeline> = {
  'us/ca/berkeley': {
    workbook: 'source/Berkeley_Budget_FY25-FY28.xlsx',
    build: async (path, meta, cityDir) => {
      const { budget, checks } = await extractBerkeley(await openWorkbook(path), meta);
      const errors = validateBerkeley(budget, checks);
      const docs = await readDocuments(cityDir);
      const merged = applyDocuments(budget, docs.file, docs.excerpts);
      const ballot = JSON.parse(await readFile(join(cityDir, 'ballot.json'), 'utf8'));
      const known = new Set<string>(merged.budget.sources.map((s) => s.id));
      const quotes = checkQuotesIn(ballot, docs.excerpts, known, 'ballot.json');
      return { budget: merged.budget, errors: [...errors, ...merged.errors, ...quotes] };
    },
  },
  'us/ca/fremont': {
    build: async (cityDir) => {
      const docs = await readDocuments(cityDir);
      return buildFremont(docs.file as unknown as FremontDocuments, docs.excerpts);
    },
  },
};

/** documents.json and the page excerpts it quotes (source/excerpts/S{n}.json). */
export async function readDocuments(cityDir: string): Promise<{ file: DocumentsFile; excerpts: Excerpts }> {
  const file = JSON.parse(await readFile(join(cityDir, 'documents.json'), 'utf8')) as DocumentsFile;
  const dir = join(cityDir, 'source/excerpts');
  const excerpts: Excerpts = {};
  for (const name of await readdir(dir)) {
    if (name.endsWith('.json')) excerpts[name.replace(/\.json$/, '') as keyof Excerpts] = JSON.parse(await readFile(join(dir, name), 'utf8'));
  }
  return { file, excerpts };
}

export interface Result {
  budget: CityBudget;
  /** Failed tie-out checks; empty means the data is good. */
  errors: string[];
}

/** Runs one city's pipeline; a workbook city's runs against `workbookPath` (defaults to the committed workbook). */
export async function buildCity(root: string, city: string, workbookPath?: string): Promise<Result> {
  const pipeline = PIPELINES[city];
  if (!pipeline) throw new Error(`no data pipeline for ${city}`);
  const cityDir = join(root, 'data/cities', city);
  if (pipeline.workbook === undefined) return withCoverage(await pipeline.build(cityDir), cityDir);
  const path = workbookPath ?? join(root, 'data/cities', city, pipeline.workbook);
  const sha256 = createHash('sha256').update(await readFile(path)).digest('hex');
  return withCoverage(await pipeline.build(path, { file: pipeline.workbook, sha256 }, cityDir), cityDir);
}

const present = (path: string) => access(path).then(() => true, () => false);

/**
 * What the budget covers and what it doesn't (#51), when the city has a coverage.json: its sources follow
 * the City's own. Then the school district's budget (#52), when there is a schools.json, which cites them.
 */
async function withCoverage(result: Result, cityDir: string): Promise<Result> {
  const path = join(cityDir, 'coverage.json');
  if (!(await present(path))) return result;
  const file = JSON.parse(await readFile(path, 'utf8')) as CoverageFile;
  const { excerpts } = await readDocuments(cityDir);
  const publisher = result.budget.sources.find((s) => s.type === 'city')?.publisher ?? '';
  const schoolsPath = join(cityDir, 'schools.json');
  const hasSchools = await present(schoolsPath);
  const pages = hasSchools ? [...ALWAYS_PAGES, 'schools'] : ALWAYS_PAGES;
  const covered = applyCoverage(result.budget, file, excerpts, publisher, pages);
  if (!hasSchools) return { budget: covered.budget, errors: [...result.errors, ...covered.errors] };
  const schools = applySchools(covered.budget, JSON.parse(await readFile(schoolsPath, 'utf8')) as SchoolsFile, excerpts, pages);
  return { budget: schools.budget, errors: [...result.errors, ...covered.errors, ...schools.errors] };
}

/** budget.json exactly as committed: stable key order, trailing newline. */
export const serialize = (budget: CityBudget) => JSON.stringify(budget, null, 2) + '\n';
