import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Runs against the output of `npm run build`. Every receipt a page carries is in a
// data-receipt attribute; its tone is the color the drawer gives the big number.
const dist = join(import.meta.dirname, '../../dist');
const htmlFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFiles(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : [],
  );
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

type Receipt = { page: string; label: string; tone: string };
const receipts: Receipt[] = htmlFiles(dist).flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(/data-receipt="([^"]*)"/g)].flatMap((m) => {
    const r = JSON.parse(unescape(m[1])) as { kind: string; label?: string; tone?: string };
    return r.kind === 'figure' && r.label ? [{ page: file.slice(dist.length), label: r.label, tone: r.tone ?? 'neutral' }] : [];
  }),
);

// "… if the sales tax passes" / "… if it fails": a figure that describes one ballot outcome.
const OUTCOME = /\bif (?:the sales tax|it) (passes|fails)\b/;

describe('ballot outcomes are colored the same way (#23)', () => {
  const outcomes = receipts.filter((r) => OUTCOME.test(r.label));

  // The cuts by outcome are a section of The Gap since #61; Departments shows the baseline before them.
  it('finds the outcome figures on the overview, the Gap and the Ballot page', () => {
    const pages = new Set(outcomes.map((r) => r.page.replace(/index\.html$/, '')));
    for (const p of ['/us/ca/berkeley/', '/us/ca/berkeley/gap/', '/us/ca/berkeley/ballot/']) expect(pages, p).toContain(p);
  });

  it("each outcome's figure has a twin for the other outcome, with the same tone", () => {
    // Twins share the text before the outcome ("Police, FY2027: net cut"); what follows may differ ("(the full proposed cut)").
    const subject = (label: string) => label.slice(0, label.search(OUTCOME));
    const outcome = (label: string) => OUTCOME.exec(label)![1];
    const both = (label: string) => /\bpasses\b/.test(label) && /\bfails\b/.test(label); // "105 if it passes (138 if it fails)" is its own twin
    const mismatched = outcomes.filter((r) => !both(r.label)).flatMap((r) => {
      const twins = outcomes.filter((o) => o.page === r.page && subject(o.label) === subject(r.label) && outcome(o.label) !== outcome(r.label));
      if (!twins.length) return [`${r.page}: "${r.label}" has no twin for the other outcome`];
      return twins.filter((t) => t.tone !== r.tone).map((t) => `${r.page}: "${r.label}" is ${r.tone}, "${t.label}" is ${t.tone}`);
    });
    expect(mismatched).toEqual([]);
  });

  it('position counts are neutral: they are not money, so neither "short" (red) nor "one-time" (gold) applies', () => {
    const positions = outcomes.filter((r) => /^Positions cut\b/.test(r.label));
    expect(positions.length).toBeGreaterThanOrEqual(2);
    for (const r of positions) expect(r.tone, `${r.page}: ${r.label}`).toBe('neutral');
  });

  it("the landing page's ballot question card isn't drawn in red or gold", () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    const card = [...html.matchAll(/<li class="card question question--(\w+)"[^>]*>([\s\S]*?)<\/li>/g)].find((m) => /What if Measure \w+, the sales tax, passes\?/.test(m[2]));
    expect(card, 'ballot question card').toBeDefined();
    expect(card![1]).not.toMatch(/^(red|gold)$/);
  });

  it('no outcome figure is gold: one-time money is not an outcome', () => {
    expect(outcomes.filter((r) => r.tone === 'one-time').map((r) => `${r.page}: ${r.label}`)).toEqual([]);
  });
});
