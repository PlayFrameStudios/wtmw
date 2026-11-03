/**
 * One entry per city that has budget data and how to turn it into budget.json:
 * from a workbook (Berkeley) or from City documents alone (Fremont).
 * `npm run data` runs every entry.
 */
import { createHash } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractBerkeley } from './berkeley/extract.ts';
import { applyPrintedRows } from './berkeley/printed-rows.ts';
import { validateBerkeley } from './berkeley/validate.ts';
import { ALWAYS_PAGES, applyCoverage, type CoverageFile } from './coverage.ts';
import { applyDocuments, checkQuotesIn, type DocumentsFile, type Excerpts } from './documents.ts';
import { buildFremont, type FremontDocuments } from './fremont/build.ts';
import { buildLafayette, type LafayetteDocuments } from './lafayette/build.ts';
import { applyFaq, type CityFaqFile, type SiteFaqFile } from './faq.ts';
import { applySchools, type SchoolsFile } from './schools.ts';
import { byNumber, checkNumbering } from './source-numbers.ts';
import type { CityBudget, DocRef, GapBudget } from './types.ts';
import { openWorkbook } from './workbook.ts';

type Pipeline =
  | { workbook: string; build: (path: string, meta: GapBudget['workbook'], cityDir: string) => Promise<Result> }
  | { workbook?: undefined; build: (cityDir: string) => Promise<Result> };

export const PIPELINES: Record<string, Pipeline> = {
  'us/ca/berkeley': {
    workbook: 'source/Berkeley_Budget_FY25-FY28.xlsx',
    build: async (path, meta, cityDir) => {
      const docs = await readDocuments(cityDir);
      const { budget, checks } = await extractBerkeley(await openWorkbook(path), meta, docs.file.sources);
      const errors = validateBerkeley(budget, checks, docs.file.sources.map((s) => s.id));
      const merged = applyDocuments(budget, docs.file, docs.excerpts);
      const ballot = JSON.parse(await readFile(join(cityDir, 'ballot.json'), 'utf8'));
      const known = new Set<string>(merged.budget.sources.map((s) => s.id));
      const printed = applyPrintedRows(merged.budget, docs.file.departmentRows, docs.excerpts, known);
      const quotes = checkQuotesIn(ballot, docs.excerpts, known, 'ballot.json');
      return { budget: printed.budget, errors: [...errors, ...merged.errors, ...printed.errors, ...quotes] };
    },
  },
  'us/ca/fremont': {
    build: async (cityDir) => {
      const docs = await readDocuments(cityDir);
      return buildFremont(docs.file as unknown as FremontDocuments, docs.excerpts);
    },
  },
  'us/ca/lafayette': {
    build: async (cityDir) => {
      const docs = await readDocuments(cityDir);
      return buildLafayette(docs.file as unknown as LafayetteDocuments, docs.excerpts);
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
  const result =
    pipeline.workbook === undefined
      ? await withCoverage(await pipeline.build(cityDir), cityDir, root)
      : await (async () => {
          const path = workbookPath ?? join(root, 'data/cities', city, pipeline.workbook!);
          const sha256 = createHash('sha256').update(await readFile(path)).digest('hex');
          return withCoverage(await pipeline.build(path, { file: pipeline.workbook!, sha256 }, cityDir), cityDir, root);
        })();
  const numbering = checkNumbering(result.budget.sources).map((e) => `${city}: ${e}`);
  const budget = { ...result.budget, sources: byNumber(result.budget.sources) } as CityBudget;
  return { budget, errors: [...result.errors, ...numbering, ...(await checkScans(budget, root, city))] };
}

/** Every cite read from a scanned page (#59), wherever it sits in budget.json. */
export function scannedRefs(budget: CityBudget): (DocRef & { scanned: { image: string } })[] {
  const found: (DocRef & { scanned: { image: string } })[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.source === 'string' && typeof o.quote === 'string' && o.scanned) found.push(o as unknown as DocRef & { scanned: { image: string } });
    Object.values(o).forEach(walk);
  };
  walk(budget);
  return found;
}

/** A scanned receipt links its rendered page, so the image must be the city's and must be in public/. */
export async function checkScans(budget: CityBudget, root: string, city: string): Promise<string[]> {
  const errors: string[] = [];
  for (const image of new Set(scannedRefs(budget).map((r) => r.scanned.image))) {
    if (!image.startsWith(`/${city}/scans/`)) errors.push(`scanned image ${image}: must be under /${city}/scans/`);
    else if (!(await present(join(root, 'public', image)))) errors.push(`scanned image ${image}: not in public/`);
  }
  return errors;
}

/** The site-wide FAQ (#54) and the page excerpts it quotes: data/site/faq.json, data/site/source/excerpts/. */
export async function readSiteFaq(root: string): Promise<{ file: SiteFaqFile; excerpts: Excerpts }> {
  const dir = join(root, 'data/site');
  const file = JSON.parse(await readFile(join(dir, 'faq.json'), 'utf8')) as SiteFaqFile;
  const excerpts: Excerpts = {};
  const exDir = join(dir, 'source/excerpts');
  if (await present(exDir)) {
    for (const name of await readdir(exDir)) {
      if (name.endsWith('.json')) excerpts[name.replace(/\.json$/, '') as keyof Excerpts] = JSON.parse(await readFile(join(exDir, name), 'utf8'));
    }
  }
  return { file, excerpts };
}

const present = (path: string) => access(path).then(() => true, () => false);

/**
 * What the budget covers and what it doesn't (#51), when the city has a coverage.json: its sources follow
 * the City's own. Then the school district's budget (#52), when there is a schools.json, which cites them.
 * Then the city's FAQ (#54), when there is a faq.json: its sources follow those, and it links the site-wide FAQ.
 */
async function withCoverage(result: Result, cityDir: string, root: string): Promise<Result> {
  const path = join(cityDir, 'coverage.json');
  if (!(await present(path))) return result;
  const file = JSON.parse(await readFile(path, 'utf8')) as CoverageFile;
  const { excerpts } = await readDocuments(cityDir);
  const publisher = result.budget.sources.find((s) => s.type === 'city')?.publisher ?? '';
  const schoolsPath = join(cityDir, 'schools.json');
  const faqPath = join(cityDir, 'faq.json');
  const hasSchools = await present(schoolsPath);
  const hasFaq = await present(faqPath);
  const pages = [...ALWAYS_PAGES, ...(hasSchools ? ['schools'] : []), ...(hasFaq ? ['faq'] : [])];
  const errors = [...result.errors];
  const covered = applyCoverage(result.budget, file, excerpts, publisher, pages);
  let budget = covered.budget;
  errors.push(...covered.errors);
  if (hasSchools) {
    const schools = applySchools(budget, JSON.parse(await readFile(schoolsPath, 'utf8')) as SchoolsFile, excerpts, pages);
    budget = schools.budget;
    errors.push(...schools.errors);
  }
  if (hasFaq) {
    const site = await readSiteFaq(root);
    const families = (JSON.parse(await readFile(join(cityDir, 'families.json'), 'utf8')) as { families: { id: string }[] }).families.map((f) => f.id);
    const faq = applyFaq(budget, JSON.parse(await readFile(faqPath, 'utf8')) as CityFaqFile, excerpts, {
      publisher,
      pages,
      siteIds: site.file.questions.map((q) => q.id),
      families,
    });
    budget = faq.budget;
    errors.push(...faq.errors);
  }
  return { budget, errors };
}

/** budget.json exactly as committed: stable key order, trailing newline. */
export const serialize = (budget: CityBudget) => JSON.stringify(budget, null, 2) + '\n';
