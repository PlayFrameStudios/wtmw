import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cities, pagesFor } from '../../src/lib/cities';

// Runs against the output of `npm run build`. Cloudflare serves dist/ as-is,
// so a file here is a 200 and a missing one falls through to 404.html.
const dist = join(import.meta.dirname, '../../dist');
const page = (path: string) => join(dist, path, 'index.html');

describe('built site', () => {
  it('was built', () => {
    expect(existsSync(dist), 'run `npm run build` first').toBe(true);
  });

  it('has the landing page, linking to every city', () => {
    const html = readFileSync(page('/'), 'utf8');
    for (const c of cities) expect(html).toContain(`href="${c.path}"`);
  });

  it.each(cities.flatMap((c) => ['', ...pagesFor(c).map((p) => `${p.slug}/`)].map((sub) => c.path + sub)))(
    'renders %s with the independence line',
    (path) => {
      const html = readFileSync(page(path), 'utf8');
      expect(html).toContain('Independent. Not affiliated with the City of Berkeley.');
    },
  );

  it('has a 404 page for Cloudflare to serve', () => {
    expect(readFileSync(join(dist, '404.html'), 'utf8')).toContain('Page not found');
  });

  it('generates nothing for a city outside the registry', () => {
    // Liveness: the sibling exists, so the absence below means something.
    expect(existsSync(page('/us/ca/berkeley/'))).toBe(true);
    expect(existsSync(join(dist, 'us/ca/nowhere'))).toBe(false);
  });
});
