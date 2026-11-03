/**
 * What FTE means (#60), on the built pages: the departments page explains the unit and adds the city's own scope
 * sentence with its receipt, and both places that say "FTE" link to the site FAQ's answer, which exists.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CityBudget } from '../../src/data/types';

const root = join(import.meta.dirname, '../..');
const dist = join(root, 'dist');
const budgetOf = (city: string): CityBudget => JSON.parse(readFileSync(join(root, `data/cities/us/ca/${city}/budget.json`), 'utf8'));
const html = (p: string) => readFileSync(join(dist, p, 'index.html'), 'utf8');
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (h: string) =>
  decode(
    h
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' '),
  ).trim();
/** The element carrying `attr`, whole. */
const element = (h: string, attr: string) => {
  const m = h.match(new RegExp(`<(\\w+)[^>]*${attr}[^>]*>[\\s\\S]*?</\\1>`));
  expect(m, attr).not.toBeNull();
  return m![0];
};
/** The staff section's lead paragraph. */
const staffNote = (h: string) => {
  const from = h.indexOf('id="db-staff"');
  expect(from).toBeGreaterThan(-1);
  const p = h.indexOf('<p', from);
  return h.slice(p, h.indexOf('</p>', p) + 4);
};
const FAQ = '/faq/#staff-positions-fte';
const NOTE = 'FTE counts budgeted positions, not people: a position budgeted at half time counts as 0.50, so the total can end in a fraction.';

describe.each(['fremont', 'lafayette'])('%s departments page (built)', (city) => {
  const b = budgetOf(city);
  const page = html(`us/ca/${city}/departments/`);
  const note = staffNote(page);

  it('the note follows the total, then the scope sentence, with spaces between them', () => {
    const t = text(note);
    expect(t).toContain(`in all. ${NOTE} ${b.staffing.scope!.text}`);
  });

  it('"Full-time-equivalent" links to the FAQ answer', () => {
    expect(note).toMatch(new RegExp(`<a href="${FAQ}" data-fte-faq-link[^>]*>Full-time-equivalent</a>`));
  });

  it("the scope sentence's receipt cites each quote at its page", () => {
    const scope = element(note, 'data-staff-scope');
    const m = scope.match(/data-receipt="([^"]*)"/);
    expect(m).not.toBeNull();
    const r = JSON.parse(decode(m![1])) as { kind: string; source: string; page: number; quote: string; also?: { source: string; page: number; quote: string }[] };
    const [first, ...also] = b.staffing.scope!.cites;
    expect(r).toMatchObject({ kind: 'source', source: first.source, page: first.page, quote: first.quote });
    expect(r.also ?? []).toEqual(also.map(({ source, page, quote }) => ({ source, page, quote })));
  });

  it('the total is unchanged', () => {
    expect(text(note)).toContain(`${b.staffing.fte} in all.`);
  });
});

describe('the departments lead names where the count comes from', () => {
  it('Fremont: every fund, with the department table; Lafayette: the City’s budget, no table', () => {
    const fremont = html('us/ca/fremont/departments/');
    expect(text(staffNote(fremont))).toMatch(/^Full-time-equivalent positions in every fund, not just the General Fund: 994\.24 in all\. .* This table lists the administrative departments separately\.$/);
    expect(fremont).toContain('<li class="db-row db-row--staff"');
    const lafayette = html('us/ca/lafayette/departments/');
    expect(text(staffNote(lafayette))).toMatch(/^Full-time-equivalent positions in the City's budget: 50\.1 in all\. /);
    expect(text(staffNote(lafayette))).not.toContain('This table');
    expect(lafayette).not.toContain('<li class="db-row db-row--staff"');
  });
});

describe('Berkeley (built)', () => {
  it('has no scope sentence anywhere: its source does not say what its count leaves out', () => {
    for (const p of ['', 'departments/']) expect(html(`us/ca/berkeley/${p}`)).not.toContain('data-staff-scope');
  });
});

describe.each(['berkeley', 'fremont', 'lafayette'])('%s overview (built)', (city) => {
  it('"FTE" in the staff-positions stat links to the FAQ answer', () => {
    expect(html(`us/ca/${city}/`)).toMatch(new RegExp(`<dt[^>]*>staff positions \\(<a href="${FAQ}" data-fte-faq-link[^>]*>FTE</a>\\),`));
  });
});

describe('site FAQ (built)', () => {
  const faq = html('faq/');
  it('has the answer the links point to, after the General Fund one', () => {
    expect(faq).toContain('id="staff-positions-fte"');
    expect(faq.indexOf('id="general-fund"')).toBeGreaterThan(-1);
    expect(faq.indexOf('id="general-fund"')).toBeLessThan(faq.indexOf('id="staff-positions-fte"'));
    expect(text(element(faq, 'id="staff-positions-fte"'))).toContain('Why are staff positions shown as fractions?');
    expect(text(faq)).toContain('A full-time position counts as one and a half-time position as half of one');
  });
});
