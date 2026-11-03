/**
 * The FAQs (#54): the site-wide faq.json and each city's, through the same paragraph checks as the coverage
 * block (#51). Each check is broken on purpose against the real files and excerpts, so a passing test shows
 * the check runs, not only that the data is good.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ALWAYS_PAGES } from '../../src/data/coverage';
import type { Excerpts } from '../../src/data/documents';
import { applyFaq, checkSiteFaq, quotePrints, type CityFaqFile, type SiteFaqFile } from '../../src/data/faq';
import { buildCity, readDocuments, readSiteFaq } from '../../src/data/pipeline';
import type { CityBudget } from '../../src/data/types';

const root = join(import.meta.dirname, '../..');
const dir = join(root, 'data/cities/us/ca/fremont');
const file: CityFaqFile = JSON.parse(readFileSync(join(dir, 'faq.json'), 'utf8'));
let site: { file: SiteFaqFile; excerpts: Excerpts };
let base: CityBudget;
let excerpts: Excerpts;
let built: Record<'berkeley' | 'fremont', CityBudget>;

beforeAll(async () => {
  site = await readSiteFaq(root);
  const [b, f] = await Promise.all([buildCity(root, 'us/ca/berkeley'), buildCity(root, 'us/ca/fremont')]);
  expect(b.errors).toEqual([]);
  expect(f.errors).toEqual([]);
  built = { berkeley: b.budget, fremont: f.budget };
  // Fremont before its faq.json: the built budget without the FAQ and the sources it added.
  base = structuredClone(f.budget);
  delete base.faq;
  base.sources = base.sources.slice(0, base.sources.length - file.sources.length);
  excerpts = (await readDocuments(dir)).excerpts;
});

const ctx = () => ({ publisher: 'City of Fremont', pages: [...ALWAYS_PAGES, 'faq'], siteIds: site.file.questions.map((q) => q.id), families: ['safety', 'people', 'running', 'oversight'] });
/** Fremont's faq.json errors after `change` edits a copy. */
const errors = (change: (f: CityFaqFile) => void = () => {}) => {
  const f = structuredClone(file);
  change(f);
  return applyFaq(base, f, excerpts, ctx()).errors;
};
const siteErrors = (change: (f: SiteFaqFile) => void = () => {}) => {
  const f = structuredClone(site.file);
  change(f);
  return checkSiteFaq(f, site.excerpts);
};
const q = (f: CityFaqFile | SiteFaqFile, id: string) => f.questions.find((x) => x.id === id)!;

describe('the FAQs as committed', () => {
  it('pass every check: the site-wide one and both cities', () => {
    expect(siteErrors()).toEqual([]);
    expect(errors()).toEqual([]);
    expect(built.berkeley.faq?.questions.map((x) => x.id)).toEqual(['police-share', 'schools', 'pensions', 'roads', 'sales-tax-measure', 'top-property-taxpayers']);
    expect(built.fremont.faq?.questions.map((x) => x.id)).toEqual(['police-share', 'compared-to-other-cities', 'schools', 'roads', 'pensions', 'sales-tax', 'top-property-taxpayers', 'what-officers-do']);
  });

  it("number their sources after the city's others, the City's own documents typed 'city'", () => {
    expect(built.fremont.sources.slice(-5).map((s) => [s.id, s.type])).toEqual([['S9', 'city'], ['S10', 'other'], ['S11', 'other'], ['S12', 'other'], ['S13', 'other']]);
    // Berkeley's FAQ source follows coverage.json's; documents.json's S40–S42 come after it (#63, #64).
    expect(built.berkeley.sources.find((s) => s.id === 'S39')).toMatchObject({ type: 'city', publisher: 'City of Berkeley' });
    expect(built.berkeley.sources.map((s) => s.id)).toEqual(Array.from({ length: 42 }, (_, i) => `S${i + 1}`));
  });

  it("the site-wide FAQ cites no city's books", () => {
    expect(site.file.sources.every((s) => s.type === 'other')).toBe(true);
    expect(siteErrors((f) => (f.sources[0].type = 'city'))).toContain(`data/site/faq.json S1: type "city"; the site-wide FAQ cites only sources that aren't a city's own books ("other")`);
  });
});

describe('quote checks', () => {
  it('a quote that is not on its page fails', () => {
    expect(errors((f) => (q(f, 'sales-tax').paragraphs[0].cites![0].quote = 'Fremont 9.250% Alameda City'))).toContain(
      'faq.json sales-tax paragraph 1: "Fremont 9.250% Alameda City" is not on S10 page 1',
    );
    expect(siteErrors((f) => (q(f, 'property-tax').paragraphs[1].cites![0].quote = 'generally depends on the tax revenue it received in the mid-1980s.'))).toEqual([
      'data/site/faq.json property-tax paragraph 2: "generally depends on the tax revenue it received in the mid-1980s." is not on S1 page 1',
      "data/site/faq.json property-tax paragraph 2: 1970 isn't in any quote it cites",
    ]);
  });

  it('a number typed into an answer, not in a quote it cites, fails', () => {
    expect(errors((f) => (q(f, 'police-share').paragraphs[0].text += ' That is 46.6%.'))).toContain("faq.json police-share paragraph 1: 46.6 isn't in any quote it cites");
    expect(siteErrors((f) => (q(f, 'general-fund').paragraphs[0].text += ' About 70% of it is staff.'))).toContain("data/site/faq.json general-fund paragraph 1: 70 isn't in any quote it cites");
  });

  it('an answer with no cites, no figures and no reason fails', () => {
    expect(siteErrors((f) => delete q(f, 'report-an-error').paragraphs[0].unsourced)).toContain('data/site/faq.json report-an-error paragraph 1: no cites, no figures and no "unsourced" reason');
  });

  it('an amount must be printed in its quote, in dollars, thousands or millions', () => {
    expect(errors((f) => (f.amounts!.policeAllFunds.amount = 130915000))).toContain("faq.json amounts.policeAllFunds: 130915000 isn't printed in its quote, in dollars, thousands or millions");
    expect(errors((f) => (f.amounts!.gfDebtService.quote = 'Debt Service 7,327 7,327 7,327 6,248'))).toEqual(
      expect.arrayContaining([expect.stringContaining('is not on S1 page 72')]),
    );
    expect(quotePrints('Police 129,087 - 1,828 - 130,915', 130915000)).toBe(true);
    expect(quotePrints('Transportation Improvements $10.087 $6.690 $70.840', 6690000)).toBe(true);
    expect(quotePrints('Totals $ 130,915,603', 130915603)).toBe(true);
    // Rounded is not printed: 130,915 thousand is not $130,915,603.
    expect(quotePrints('Police 129,087 - 1,828 - 130,915', 130915603)).toBe(false);
    expect(quotePrints('$6.690', 6695000)).toBe(false);
  });

  it('an unused amount or label fails, so neither outlives its answer', () => {
    expect(errors((f) => (f.amounts!.spare = { ...f.amounts!.gfDebtService }))).toContain('faq.json amounts: "spare" is used by no {amount:spare} token');
    expect(errors((f) => (f.labels!['pension.fundedRatio'] = 'x'))).toContain('faq.json labels: "pension.fundedRatio" labels no {fig:pension.fundedRatio} token');
  });
});

describe('tokens', () => {
  it('a department, family or figure that budget.json lacks fails', () => {
    const e = errors((f) => {
      const p = q(f, 'police-share').paragraphs[0];
      p.text += ' {dept:library} {per100:libraries} {fig:pension.nothing} {amount:nothing} {salesTax}';
    });
    expect(e).toEqual(
      expect.arrayContaining([
        'faq.json police-share paragraph 1: unknown {dept:library}: no department "library" in the General Fund table',
        'faq.json police-share paragraph 1: unknown {per100:libraries}: no department or family "libraries"',
        'faq.json police-share paragraph 1: unknown {fig:pension.nothing}: budget.json has no figure (an amount, or a number inside a record that names its source) at pension.nothing',
        'faq.json police-share paragraph 1: unknown {amount:nothing}: no "nothing" in amounts',
        'faq.json police-share paragraph 1: unknown {salesTax}: not a token here',
      ]),
    );
  });

  it('a figure without words for its receipt fails', () => {
    expect(errors((f) => delete f.labels!['pension.contribution'])).toContain('faq.json pensions paragraph 1: unknown {fig:pension.contribution}: its receipt needs a label: add "pension.contribution" to labels');
  });
});

describe('links and anchors', () => {
  it('a city answer links site-wide answers that exist', () => {
    expect(errors((f) => (q(f, 'police-share').see = ['general-funds']))).toContain('faq.json police-share: sees "general-funds", which isn\'t a site-wide FAQ answer');
    expect(errors((f) => (q(f, 'schools').paragraphs[1].text = '[More](faq:schooling).'))).toContain('faq.json schools paragraph 2: "More" links to faq:schooling, which isn\'t a site-wide FAQ answer');
  });

  it("links to one of the city's pages, an answer on this page, or a site path", () => {
    expect(errors((f) => (q(f, 'roads').paragraphs[2].text = q(f, 'roads').paragraphs[2].text.replace('page:capital', 'page:capitol')))).toContain(
      'faq.json roads paragraph 3: "Capital page" links to page:capitol, which isn\'t one of this city\'s pages',
    );
    expect(errors((f) => (q(f, 'schools').paragraphs[1].text = '[Roads](#road).'))).toContain('faq.json schools paragraph 2: "Roads" links to #road, which isn\'t on this page');
    expect(errors((f) => (q(f, 'schools').paragraphs[1].text = '[Berkeley](/us/ca/Berkeley/faq).'))).toContain(
      'faq.json schools paragraph 2: "Berkeley" links to /us/ca/Berkeley/faq; a site path is lowercase and ends in "/" (then an optional #anchor)',
    );
    expect(siteErrors((f) => (q(f, 'request-a-city').paragraphs[0].text = '[Request it](site:request)'))).toContain(
      'data/site/faq.json request-a-city paragraph 1: "Request it" links to site:request, which isn\'t a named site link',
    );
  });

  it('every answer has an anchor that is one lowercase id, used once, and asks a question', () => {
    expect(errors((f) => (f.questions[1].id = f.questions[0].id))).toContain('faq.json police-share: a second question with this id');
    expect(errors((f) => (f.questions[0].id = 'Police Share'))).toContain('faq.json Police Share: an id is the answer\'s anchor, so lowercase words joined by hyphens');
    expect(siteErrors((f) => (f.questions[0].question = 'Who made this.'))).toContain('data/site/faq.json who-made-this: the question should be one, ending with "?"');
  });

  it('sources follow on, typed by who published them', () => {
    expect(errors((f) => (f.sources[0].id = 'S10'))).toContain('faq.json: source 1 is S10, expected S9');
    expect(errors((f) => (f.sources[0].type = 'other'))).toContain('faq.json S9: published by City of Fremont, so type "city"');
    expect(errors((f) => (f.sources[1].type = 'city'))).toContain('faq.json S10: type "city", but published by California Department of Tax and Fee Administration, not City of Fremont');
  });
});
