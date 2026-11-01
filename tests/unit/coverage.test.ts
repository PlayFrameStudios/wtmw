/**
 * "What this budget covers" (#51): coverage.json's checks, each broken on purpose against the real
 * excerpts, so a passing test shows the check runs and not only that the data is good.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyCoverage, type CoverageFile } from '../../src/data/coverage';
import type { Excerpts } from '../../src/data/documents';
import { buildCity, PIPELINES, readDocuments, type Result } from '../../src/data/pipeline';
import type { CityBudget } from '../../src/data/types';
import { allCities } from '../../src/lib/cities';
import { coverageFor } from '../../src/lib/coverage';
import { revenueGroupsFor } from '../../src/lib/revenue-groups';

const root = join(import.meta.dirname, '../..');
const dir = join(root, 'data/cities/us/ca/fremont');
const fremont = allCities.find((c) => c.path === '/us/ca/fremont/')!;
const berkeley = allCities.find((c) => c.path === '/us/ca/berkeley/')!;
const file: CoverageFile = JSON.parse(readFileSync(join(dir, 'coverage.json'), 'utf8'));
let base: CityBudget;
let excerpts: Excerpts;
let built: Record<'berkeley' | 'fremont', CityBudget>;

beforeAll(async () => {
  // Fremont's budget before coverage.json is applied: its own pipeline, without the coverage step.
  base = (await (PIPELINES['us/ca/fremont'] as { build: (d: string) => Promise<Result> }).build(dir)).budget;
  excerpts = (await readDocuments(dir)).excerpts;
  const [b, f] = await Promise.all([buildCity(root, 'us/ca/berkeley'), buildCity(root, 'us/ca/fremont')]);
  expect(b.errors).toEqual([]);
  expect(f.errors).toEqual([]);
  built = { berkeley: b.budget, fremont: f.budget };
});

/** coverage.json's errors after `change` edits a copy of Fremont's. */
const errors = (change: (f: CoverageFile) => void = () => {}) => {
  const f = structuredClone(file);
  change(f);
  return applyCoverage(base, f, excerpts, 'City of Fremont').errors;
};
const para = (f: CoverageFile, id: string, i = 0) => f.questions.find((q) => q.id === id)!.paragraphs[i];

describe('coverage.json checks', () => {
  it('pass on the real data', () => {
    expect(errors()).toEqual([]);
  });

  it('a number typed into the copy must be in a quote it cites', () => {
    expect(errors((f) => (para(f, 'property-tax', 1).text = para(f, 'property-tax', 1).text.replace('15 cents', '16 cents')))).toEqual([
      "coverage.json property-tax paragraph 2: 16 isn't in any quote it cites",
    ]);
  });

  it('matches whole numbers: the "1" in "$1,000" does not vouch for a "1%"', () => {
    const e = errors((f) => {
      const p = para(f, 'property-tax');
      p.cites = p.cites!.filter((c) => c.quote.includes('$1,000'));
    });
    expect(e).toEqual(["coverage.json property-tax paragraph 1: 1 isn't in any quote it cites"]);
  });

  it('every quote must be on its page', () => {
    expect(errors((f) => (para(f, 'schools').cites![1].page = 17))).toEqual([
      'coverage.json schools paragraph 1: "The District is governed by a five-member Board of Education. Each member is elected to a four-year term." is not on S5 page 17',
    ]);
  });

  it('a paragraph needs cites, a figure or a stated reason', () => {
    expect(errors((f) => delete para(f, 'city-pays', 2).unsourced)).toEqual(['coverage.json city-pays paragraph 3: no cites, no figures and no "unsourced" reason']);
  });

  it('links go to a glossary term or a registered source, and tokens are known', () => {
    expect(
      errors((f) => {
        para(f, 'everything').text = para(f, 'everything').text.replace('glossary:General Fund', 'glossary:General Funds');
        para(f, 'schools', 1).text = para(f, 'schools', 1).text.replace('/budget/)', '/budgets/)');
        para(f, 'property-tax', 2).text += ' {salesTax}';
      }),
    ).toEqual([
      `coverage.json everything paragraph 1: "General Fund" links to glossary:General Funds, which isn't in the glossary`,
      `coverage.json schools paragraph 2: "FUSD publishes its budget on its own site" links to https://fremontunified.org/about/business-services/budgets/, which isn't a source's URL`,
      'coverage.json property-tax paragraph 3: unknown {salesTax}',
    ]);
  });

  it('names an agency only with a source', () => {
    expect(errors((f) => (f.questions[2].agencies![0].cites = []))).toEqual(['coverage.json else agency "Alameda County": name an agency only with a source that says it serves the city']);
  });

  it("its sources are other governments', numbered after the City's", () => {
    expect(
      errors((f) => {
        f.sources[0].type = 'city';
        f.sources[1].publisher = 'City of Fremont';
      }),
    ).toEqual([
      'coverage.json S4: type "city", but coverage sources are other governments\' documents ("other")',
      "coverage.json S5: published by City of Fremont; the City's own documents belong in its documents.json",
    ]);
    expect(errors((f) => (f.sources[2].id = 'S7'))).toContain("coverage.json: source 3 is S7, expected S6 (it continues the City's numbering)");
  });

  it('answers the five questions, in order', () => {
    expect(errors((f) => f.questions.reverse())[0]).toMatch(/^coverage\.json: questions must be everything, schools, else, property-tax, city-pays, in that order/);
  });

  it('adds glossary terms once, keeping an alphabetical glossary alphabetical', () => {
    expect(errors((f) => (f.glossary[0].term = 'General Fund'))).toContain('coverage.json glossary "General Fund": already in the glossary');
    const terms = built.fremont.glossary!.map((g) => g.term);
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b)));
    expect(terms).toEqual(expect.arrayContaining(['Parcel Tax', 'School District', 'Special District']));
    expect(built.berkeley.glossary!.slice(-3).map((g) => g.term)).toEqual(['Parcel tax', 'School district', 'Special district']);
  });
});

describe('the block, as the pages get it', () => {
  const block = (city: typeof berkeley, b: CityBudget) => coverageFor(city, b, revenueGroupsFor(city, b))!;
  const words = (segments: { text: string }[]) => segments.map((s) => s.text).join('');

  it("fills the figures from budget.json, each with its receipt", () => {
    const b = block(berkeley, built.berkeley);
    const everything = b.questions[0].paragraphs[0];
    expect(words(everything.segments)).toBe(
      "Yes, for the City government. These pages show the City of Berkeley's own budget: $916.8M across all its funds in FY2027. Of that, $313.8M is the General Fund, the City's main account for day-to-day services.",
    );
    const figures = everything.segments.filter((s) => s.kind === 'figure');
    expect(figures.map((s) => s.figure.ref)).toEqual([built.berkeley.size.allFunds, built.berkeley.size.generalFund]);
    const property = b.questions[3].paragraphs[2].segments.find((s) => s.kind === 'figure')!;
    // The overview's property-tax group, built from its line items.
    expect(property.text).toBe('$103.6M');
    expect(property.figure.value).toBe(revenueGroupsFor(berkeley, built.berkeley).find((g) => g.id === 'property-tax')!.adopted);
    expect(property.figure.parts!.map((p) => p.label)).toEqual(['Secured Property Tax', 'Supplemental Taxes', 'Unsecured Property Taxes']);
    expect(words(block(fremont, built.fremont).questions[0].paragraphs[0].segments)).toContain('$427.1M across all its funds in FY 2026/27. Of that, $289.1M');
  });

  it('links glossary terms to their definitions and sources to themselves', () => {
    const links = block(berkeley, built.berkeley).questions.flatMap((q) => q.paragraphs.flatMap((p) => p.segments.filter((s) => s.kind === 'link')));
    expect(links.map((l) => [l.text, l.href, l.external])).toEqual([
      ['General Fund', '/us/ca/berkeley/glossary/#general-fund-gf', false],
      // #52: the schools answer goes to the BUSD page now that there is one.
      ['See BUSD\'s budget, explained', '/us/ca/berkeley/schools/', false],
      ['special districts', '/us/ca/berkeley/glossary/#special-district', false],
      ['parcel taxes', '/us/ca/berkeley/glossary/#parcel-tax', false],
    ]);
  });

  it("gives the overview its line, linked to the block and, where the city has the page, to the school district's budget (#52)", () => {
    const line = "Your property tax bill pays several governments, including the City, the school district and the county. This page shows only the City's part.";
    const links = (o: { segments: { kind: string; text: string; href?: string }[] }) => o.segments.filter((s) => s.kind === 'link').map((s) => [s.text, s.href]);
    const f = block(fremont, built.fremont).overview;
    expect(words(f.segments)).toBe(line);
    expect(f.href).toBe('/us/ca/fremont/sources/#what-this-covers');
    expect(links(f)).toEqual([["This page shows only the City's part.", '/us/ca/fremont/sources/#what-this-covers']]);
    const b = block(berkeley, built.berkeley).overview;
    expect(words(b.segments)).toBe(line);
    expect(links(b)).toEqual([
      ['the school district', '/us/ca/berkeley/schools/'],
      ["This page shows only the City's part.", '/us/ca/berkeley/sources/#what-this-covers'],
    ]);
    // Fixtureville borrows Berkeley's data but has no schools page: the words stay, the link goes.
    const fixture = allCities.find((c) => c.fixture)!;
    const fx = block(fixture, built.berkeley).overview;
    expect(words(fx.segments)).toBe(line);
    expect(links(fx)).toEqual([["This page shows only the City's part.", `${fixture.path}sources/#what-this-covers`]]);
  });

  it('a "page:" link must name one of the city\'s pages', () => {
    expect(errors((f) => (f.overview.text = f.overview.text.replace('(page:sources#what-this-covers)', '(page:schools)')))).toEqual([
      `coverage.json overview: "This page shows only the City's part." links to page:schools, which isn't one of this city's pages`,
    ]);
  });
});
