/**
 * Checks every city.json (and a fixture's) the way the site build reads it, then checks what
 * the build can't: that the fiscal-position reason and each reserve amount quote a sentence
 * that is really on its PDF page (#42). Run by `npm run data` and `npm run data:check`.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildRegistry, type City } from '../lib/city-registry.ts';
import { parseReserves } from '../lib/city-settings.ts';
import { checkQuotesIn } from './documents.ts';
import { readDocuments } from './pipeline.ts';

async function cityFiles(root: string): Promise<Record<string, unknown>> {
  const found: string[] = [];
  const dirs = async (p: string) => (await readdir(join(root, p), { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => `${p}/${e.name}`);
  for (const country of await dirs('data/cities'))
    for (const state of await dirs(country)) for (const city of await dirs(state)) found.push(`/${city}/city.json`);
  for (const fixture of await dirs('data/fixtures')) found.push(`/${fixture}/city.json`);
  const entries: Record<string, unknown> = {};
  for (const f of found) if (existsSync(join(root, f))) entries[f] = JSON.parse(await readFile(join(root, f), 'utf8'));
  return entries;
}

/** The registry, or the error that stops it loading; then each city's quote errors. */
export async function checkCities(root: string): Promise<{ cities: City[]; errors: string[] }> {
  let cities: City[];
  try {
    cities = buildRegistry(await cityFiles(root), (p) => existsSync(join(root, p)));
  } catch (e) {
    return { cities: [], errors: [(e as Error).message] };
  }
  const errors: string[] = [];
  for (const city of cities) {
    const where = `${city.dir.slice(1)}city.json`;
    const dataDir = join(root, city.dataDir);
    const budget = JSON.parse(await readFile(join(dataDir, 'budget.json'), 'utf8')) as { sources: { id: string }[] };
    const known = new Set(budget.sources.map((s) => s.id));
    const { excerpts } = await readDocuments(dataDir);
    errors.push(...checkQuotesIn(city.fiscalPosition.reason, excerpts, known, `${where} fiscalPosition.reason`));
    const reservesFile = join(root, city.dir, 'reserves.json');
    if (existsSync(reservesFile)) {
      const raw = JSON.parse(await readFile(reservesFile, 'utf8'));
      try {
        parseReserves(`${city.dir.slice(1)}reserves.json`, raw);
        errors.push(...checkQuotesIn(raw, excerpts, known, `${city.dir.slice(1)}reserves.json`));
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
  }
  return { cities, errors };
}
