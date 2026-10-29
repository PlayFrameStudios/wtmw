/**
 * After the build, records which pages each source's chips actually appear on,
 * so a receipt's "Used on" line (and the Sources page) can't drift from the
 * pages themselves. Writes dist/{city}/data/source-usage.json:
 *   { "S1": [{ "path": "/us/ca/berkeley/gap/", "label": "The Gap" }], "S2": [], … }
 * and fills every <span data-used-on="S1"></span> placeholder in the city's
 * pages with links to those pages, so the Sources page's column is static HTML.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { CITY_PAGES } from '../lib/city-pages.ts';

// A source trigger (a quiet ⓘ, or a figure that opens its receipt), or a plain link to a source
// document (the Ballot page's "Read Measure V" links). One trigger can name several sources: "S1 S12" (#29).
const CHIP = /data-source-(?:chip|link)="(S\d+(?: S\d+)*)"/g;

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? htmlFiles(p) : e.name.endsWith('.html') ? [p] : [];
  });
}

/** Page label for the receipt: "Overview" for the city root, else the nav label. */
function label(cityPath: string, pagePath: string): string {
  if (pagePath === '/') return 'Home';
  const slug = pagePath.slice(cityPath.length).replace(/\/$/, '');
  if (!slug) return 'Overview';
  // Chips on the Sources page sit in its methods and known-gaps cards (its own list uses plain badges).
  if (slug === 'sources') return 'Methods';
  return CITY_PAGES.find((p) => p.slug === slug)?.label ?? slug;
}

export function buildUsage(dist: string, featured = featuredPath()) {
  const written: string[] = [];
  for (const budgetFile of findBudgets(dist)) {
    const cityPath = '/' + relative(dist, join(budgetFile, '../..')).split(sep).join('/') + '/';
    const budget = JSON.parse(readFileSync(budgetFile, 'utf8'));
    const usage: Record<string, { path: string; label: string }[]> = Object.fromEntries(
      budget.sources.map((s: { id: string }) => [s.id, []]),
    );
    // The city's own pages, plus the landing page for the featured city, whose figures it shows.
    const landing = cityPath === featured && existsSync(join(dist, 'index.html')) ? [join(dist, 'index.html')] : [];
    const pages = [...htmlFiles(join(dist, cityPath)), ...landing];
    for (const file of pages) {
      const pagePath = '/' + relative(dist, file).split(sep).join('/').replace(/index\.html$/, '');
      const ids = new Set([...readFileSync(file, 'utf8').matchAll(CHIP)].flatMap((m) => m[1].split(' ')));
      for (const id of ids) {
        if (!usage[id]) throw new Error(`${pagePath}: chip for ${id}, which isn't in ${cityPath}'s sources`);
        usage[id].push({ path: pagePath, label: label(cityPath, pagePath) });
      }
    }
    for (const pages of Object.values(usage)) pages.sort((a, b) => a.path.localeCompare(b.path));
    const out = join(dist, cityPath, 'data/source-usage.json');
    writeFileSync(out, JSON.stringify(usage, null, 2) + '\n');
    written.push(out);
    for (const file of htmlFiles(join(dist, cityPath))) fillPlaceholders(file, usage);
  }
  return written;
}

const PLACEHOLDER = /(<span[^>]*\bdata-used-on="(S\d+)"[^>]*>)(<\/span>)/g;

/** Writes the "used on" links into a built page's placeholders. */
export function fillPlaceholders(file: string, usage: Record<string, { path: string; label: string }[]>) {
  const html = readFileSync(file, 'utf8');
  if (!html.includes('data-used-on=')) return;
  const filled = html.replace(PLACEHOLDER, (_, open: string, id: string, close: string) => {
    const pages = usage[id];
    if (!pages) throw new Error(`${file}: "used on" placeholder for ${id}, which isn't a source`);
    const body = pages.length
      ? pages.map((p) => `<a href="${p.path}">${p.label}</a>`).join('<span aria-hidden="true"> · </span>')
      : '<span class="unused">Not cited on a page yet</span>';
    return `${open}${body}${close}`;
  });
  writeFileSync(file, filled);
}

/** The site path of the city.json that says "featured": true (the landing page's city). */
function featuredPath(): string | undefined {
  const root = fileURLToPath(new URL('../../data/cities/', import.meta.url));
  for (const country of readdirSync(root))
    for (const state of readdirSync(join(root, country)))
      for (const city of readdirSync(join(root, country, state))) {
        const file = join(root, country, state, city, 'city.json');
        if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).featured === true) return `/${country}/${state}/${city}/`;
      }
  return undefined;
}

/** dist/{country}/{state}/{city}/data/budget.json for every city with data (and test fixtures, under dist/test/cities/). */
function findBudgets(dist: string): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      return e.isDirectory() ? walk(p) : e.name === 'budget.json' && dir.endsWith(`${sep}data`) ? [p] : [];
    });
  return walk(dist);
}

export default function sourceUsage(): AstroIntegration {
  return {
    name: 'source-usage',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        for (const f of buildUsage(fileURLToPath(dir))) logger.info(`wrote ${f}`);
      },
    },
  };
}
