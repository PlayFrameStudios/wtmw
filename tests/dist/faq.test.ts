/**
 * The FAQs as built (#54): the site-wide /faq/ and each city's, their FAQPage JSON-LD, every link in an
 * answer landing on a built page (and anchor), and the links in from the footer, the overview and the
 * landing page. A city without faq.json (the fixture) gets no FAQ and no link to one.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allCities, cities, hasPage, pagesFor } from '../../src/lib/cities';
import { siteFaq } from '../../src/lib/faq';

const dist = join(import.meta.dirname, '../../dist');
const file = (path: string) => join(dist, path.replace(/#.*$/, ''), path.endsWith('.html') ? '' : 'index.html');
const html = (path: string) => readFileSync(file(path), 'utf8');
const withFaq = cities.filter((c) => hasPage(c, 'faq'));
const fixture = allCities.find((c) => c.fixture)!;
const FAQ_PAGES = ['/faq/', ...withFaq.map((c) => `${c.path}faq/`)];
const items = (page: string) => [...page.matchAll(/<li class="faq-item"[^>]*id="([^"]+)"[\s\S]*?<a class="faq-anchor"[^>]*>\s*([\s\S]*?)\s*<\/a>/g)].map((m) => ({ id: m[1], question: m[2] }));
const decode = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

describe('the FAQ pages', () => {
  it('build for the site and for every city with a faq.json, and not for the fixture', () => {
    expect(withFaq.map((c) => c.path).sort()).toEqual(['/us/ca/berkeley/', '/us/ca/fremont/']);
    for (const p of FAQ_PAGES) expect(existsSync(file(p)), p).toBe(true);
    expect(pagesFor(fixture).some((p) => p.slug === 'faq')).toBe(false);
    expect(existsSync(file(`${fixture.path}faq/`))).toBe(false);
  });

  it.each(FAQ_PAGES)('%s: FAQPage JSON-LD that parses and lists every question on the page, in order', (path) => {
    const page = html(path);
    const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    expect(blocks).toHaveLength(1);
    const ld = blocks[0];
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('FAQPage');
    const shown = items(page);
    expect(shown.length).toBeGreaterThan(0);
    expect(ld.mainEntity.map((q: { name: string }) => q.name)).toEqual(shown.map((s) => decode(s.question)));
    for (const q of ld.mainEntity) {
      expect(q['@type']).toBe('Question');
      expect(q.acceptedAnswer['@type']).toBe('Answer');
      // The answer as read: figures as shown, no markup, no unfilled {tokens} or [links](targets).
      expect(q.acceptedAnswer.text.length, q.name).toBeGreaterThan(20);
      expect(q.acceptedAnswer.text).not.toMatch(/[{}<>]|\]\(/);
    }
  });

  it.each(FAQ_PAGES)('%s: every answer has a unique anchor and a copy-link button for it', (path) => {
    const page = html(path);
    const ids = items(page).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(page).toContain(`href="#${id}"`);
      expect(page).toContain(`data-copy-link="${id}"`);
    }
  });

  it('the site-wide page has every site-wide answer', () => {
    expect(items(html('/faq/')).map((i) => i.id)).toEqual(siteFaq.questions.map((q) => q.id));
  });

  it.each(FAQ_PAGES)('%s: every link in an answer lands on a built page, and on its anchor', (path) => {
    const page = html(path);
    const list = page.match(/<ol class="faq"[\s\S]*?<\/ol>/)![0];
    const hrefs = [...list.matchAll(/<a href="([^"]+)"/g)].map((m) => decode(m[1])).filter((h) => !/^https?:/.test(h));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) {
      const [p, anchor] = h.split('#');
      const target = p === '' ? page : html(p);
      if (anchor) expect(target, `${path} → ${h}`).toMatch(new RegExp(`id="${anchor}"`));
    }
  });

  it("a city's answers link the site-wide answer for the general part, instead of repeating it", () => {
    const fremont = html('/us/ca/fremont/faq/');
    expect(fremont).toMatch(/data-faq-see[\s\S]*?href="\/faq\/#general-fund"/);
    // The general explanation lives once, on /faq/.
    const general = siteFaq.questions.find((q) => q.id === 'general-fund')!.paragraphs[0].text;
    expect(decode(html('/faq/'))).toContain(general);
    for (const c of withFaq) expect(decode(html(`${c.path}faq/`))).not.toContain(general);
  });
});

describe('links in', () => {
  it.each(cities.flatMap((c) => [c.path, ...pagesFor(c).map((p) => `${c.path}${p.slug}/`)]))('%s: the footer links the site-wide FAQ', (path) => {
    expect(html(path).match(/<footer class="site-footer"[\s\S]*<\/footer>/)![0]).toContain('href="/faq/"');
  });

  it("the footer links a city's own FAQ only on that city's pages", () => {
    const footer = (p: string) => html(p).match(/<footer class="site-footer"[\s\S]*<\/footer>/)![0];
    for (const c of withFaq) {
      expect(footer(c.path)).toContain(`href="${c.path}faq/"`);
      for (const other of withFaq.filter((o) => o !== c)) expect(footer(c.path)).not.toContain(`href="${other.path}faq/"`);
    }
    expect(footer('/')).not.toMatch(/href="\/us\/[^"]*\/faq\/"/);
    expect(footer(fixture.path)).not.toContain(`${fixture.path}faq/`);
    expect(footer(fixture.path)).toContain('href="/faq/"');
  });

  it("each city's overview has one quiet line to its FAQ; the fixture's has none", () => {
    for (const c of withFaq) {
      const line = html(c.path).match(/<p class="faq-line"[^>]*data-faq-line[\s\S]*?<\/p>/)![0];
      expect(line).toContain(`href="${c.path}faq/"`);
      expect(line).toContain('Questions people ask about this budget');
    }
    expect(html(fixture.path)).not.toContain('data-faq-line');
  });

  it('the landing page links the site-wide FAQ', () => {
    const page = html('/');
    expect(page).toMatch(/<nav class="wrap desktop"[\s\S]*?href="\/faq\/"[\s\S]*?<\/nav>/);
    expect(page).toMatch(/data-site-faq-link/);
  });
});
