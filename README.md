# Where the Money Went

Live at **[wherethemoneywent.com](https://wherethemoneywent.com)** (WTMW for short).

City budgets, made readable. Every number on the site links to the public document it came from.

Independent. Not affiliated with any city government.

## Stack, and why

**[Astro](https://astro.build), static output, served by Cloudflare Workers static assets.**

- Astro renders every page to plain HTML at build time and ships **zero JavaScript by default**. The few interactive pieces (charts, toggles, the source receipt drawer) opt in as [islands](https://docs.astro.build/en/concepts/islands/), so they're the only JS on the page. Everything else works with JS off, loads fast on a phone, and is easy for search engines and screen readers.
- Routes come from data. `getStaticPaths` reads the city registry, so adding a city doesn't touch routing code.
- Cloudflare serves `dist/`. Unknown paths get `dist/404.html` with a real 404 status (`not_found_handling: "404-page"` in `wrangler.jsonc`). The only edge code is `worker/index.ts`, which redirects `www` to the apex and hands every other request to the static files.

## Running locally

Needs Node 22.22+ (`.nvmrc` pins 24; run `nvm use`).

```bash
npm install
npm run dev          # http://localhost:4321, hot reload
npm run preview      # build, then serve dist/ through wrangler, exactly as Cloudflare will (incl. 404s)
```

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint plus `astro check` (types in `.astro` and `.ts`) |
| `npm test` | Unit tests (`tests/unit/`), no build needed |
| `npm run data` | Rebuilds each city's `budget.json` from its workbook and validates it |
| `npm run build` | Checks `budget.json` is current and valid, then builds the site into `dist/` |
| `npm run test:dist` | Tests against the built site (`tests/dist/`); run after `build` |
| `npm run test:e2e` | Browser tests against the built site via `wrangler dev`: no horizontal scroll at 390px/768px, no nav overlap at 1024px+, fonts, menus. Run after `build` |
| `scripts/smoke.sh <url>` | HTTP checks against a running or deployed site: 200s for real pages, 404s for unknown cities |

CI (`.github/workflows/ci.yml`) runs lint, unit tests, build and dist tests on every PR and on `main`. Every step runs under `bash` with `pipefail`, so a failure can't be hidden behind a pipe.

## Design tokens and the shell

`src/styles/tokens.css` holds the epic's colors, fonts and layout values as CSS custom properties. Red means only "money short" (deficits and cuts) and gold only one-time money; don't use either for decoration. Headlines are set in Gelasio (metric-compatible with Georgia) and UI and numbers in Nunito Sans (an open stand-in for Avenir Next), both self-hosted from `@fontsource`. Tables and `.num` use tabular numerals.

Every page renders inside `src/layouts/Base.astro`: the dark top strip (path, independence line, "Report an error"), the header (full nav at 1024px and up, compact `WTMW` header with a menu below), and the footer. Nav links come from the city's page set, `pagesFor()` in `src/lib/city-pages.ts` (see *Which pages a city gets* below); the "19 sources" pill counts the city's sources from its data. The full nav shows from 1200px, sized for the 7-link nav; the browser tests check it, and the 6-link nav with Balance & Reserves, for overlap.

## Showing a number: source chips, receipts and glossary terms

Every figure on a page gets a chip that opens its receipt:

```astro
<SourceChip city={city} figure={{ value: gap.fy2027, label: 'FY2027 General Fund gap, after adjustments', ref: gap }} />
<SourceChip city={city} source="S2" />   <!-- a whole document -->
<Term city={city} name="One-time (one-time resources)">one-time money</Term>
```

- `ref` is the `budget.json` record the value came from; the receipt reads its source, table and row from it. Add `related: ['S15']` for news that also reported it, and `parts` for a derived figure ("How this number is built"); the build fails if the parts don't add up to the value, or if a source or glossary term doesn't exist.
- The receipt is one modal `<dialog>` per page (`src/components/ReceiptDrawer.astro`). `?source=S1` opens that source's receipt.
- "Used on" is computed after the build from where each chip actually appears (`src/integrations/source-usage.ts` → `/{city}/data/source-usage.json`).
- `/test/receipts/` exercises all of it for the browser tests; it isn't linked and isn't indexed.

## Voice

Describe what the City did in the City's terms. No adjectives on money ("propping up", "bloated", "slashing"): the City calls it stabilization, so we do too. Where a sentence names cuts, the revenue side is named in the same sentence or the next, as the City's own summary does ("ongoing cuts and new revenue"). Ballot copy describes both outcomes the same way and never argues for either.

`tests/dist/neutral-voice.test.ts` fails the build if a loaded word from its denylist appears in any page's copy, accessible names or receipt text. It doesn't check quotations: a City document or news report is quoted as written. Add words to the list rather than exceptions to the test.

## The landing page

`src/pages/index.astro` quotes the featured city's headline figures, computed by `headlines()` in `src/lib/headlines.ts`; `tests/dist/landing.test.ts` recomputes each one independently from `budget.json`, and a unit test fails if any of them is typed into the page. Department families (for the waffle colors) are in `data/cities/{city}/families.json`, an editorial grouping that the build checks covers every department exactly once. The link-preview image is `public/og/wherethemoneywent.png`, made by `node scripts/og-image.ts`.

## The overview page

`/{city}/` shows where every $100 goes. Its figures come from `overview()` in `src/lib/overview.ts`; the interactive waffle is `src/components/Waffle.astro` (one Tab stop, arrow keys between squares, Enter or a tap pins an item; a bottom sheet on phones; "Show as a table" is the text alternative). It draws any list of `WaffleItem`s whose squares total 100: departments on the overview (`departmentItems()`), revenue groups first on the Revenue page (`revenuePage().chart`). Revenue groups are in `data/cities/{city}/revenue-groups.json`, checked to cover every revenue line exactly once. Figures the workbook states in sentences (the 8%/6.5% growth rates, the 0.5% sales tax, the $300M bond) are extracted into `budget.json` as `citedFacts`, each with its source.

## The ballot page

`/{city}/ballot/` shows what the city's own plan says happens if the sales tax passes and if it fails. It is strictly neutral: both outcomes are built by one function (`ballotPage()` in `src/lib/ballot.ts`) and rendered by the same markup, in the same colors. Tests fail if the two cards differ in structure or weight, or if the page uses advocacy words. Facts the workbook doesn't hold are in `data/cities/{city}/ballot.json`: the scenario rows (Fire Station 4, the 21 police positions), each quoting the adoption report's sentence for that outcome, the adoption caveat, and the note under the position counts. The build checks every quote against its PDF page. Neutrality is also enforced there: both outcomes of a row must cite the same documents. Measure letters and the City Attorney's figures come from `documents.json` (below). Each measure card shows the City's official title (from the Clerk's ballot measures page, S25) and a "Read Measure V" list of City documents: full text, impartial analysis, and the measures page. The build requires both measures to list the same kinds of document in the same order, and only City documents (no campaign sites).

**After the election**, set `measures.salesTax.status` in `ballot.json` to `"passed"` or `"failed"`. The heading switches to the result and that outcome's card gets a "Result" badge; both scenarios stay on the page.

## The capital page

`/{city}/capital/` sets the two-year capital program against the repair backlog on one axis, then shows where the program's money comes from as a squarified treemap (`squarify()` in `src/lib/capital.ts`, laid out at build time for a wide box and a tall phone box). The program is the adoption report's "Capital program by funding source - all funds" table (`documentFacts.capitalProgram`, see below), not the workbook's earlier May presentation; Sources & methods explains the difference. Legend groups are editorial, in `data/cities/{city}/capital-groups.json`, keyed by the fund names the table prints (with readable `names`). The build fails if a fund has no group, or if a group names a fund the table lacks. Groups marked `merge` (the General Fund's CIP fund, split into its programs from the report's General Fund table) draw as one block, and sources under `otherBelowShare` of the total roll into "Other sources (n)". Whether a block's label fits is estimated from its text at the smallest size each layout is shown at; blocks too small to label are named in a key under the treemap.

## Where city data lives

```
data/cities/{country}/{state}/{city}/city.json
```

Each folder is one city, and its path is its URL: `data/cities/us/ca/berkeley/` is served at `/us/ca/berkeley/`. `src/lib/cities.ts` loads the registry at build time and fails the build if a `city.json` is missing a field or its `countryCode`/`stateCode` disagree with the folder. A path that isn't in the registry is a 404.

### Which pages a city gets

Every city gets an overview at its root, plus the pages `pagesFor()` in `src/lib/city-pages.ts` picks from its `city.json`. Revenue, Departments, Capital, Sources and the Glossary are always there. The rest are settings, so changing them is a data change, not a code change:

```json
"featured": true,
"budget": {
  "cadence": "biennial",
  "years": [2027, 2028],
  "labels": { "long": "FY{end}", "short": "FY{yy}", "spoken": "fiscal year {end}" }
},
"fiscalPosition": {
  "variant": "gap",
  "reason": { "text": "…", "cites": [{ "source": "S20", "page": 2, "quote": "…" }] }
},
"ballot": true
```

- **`fiscalPosition`** fills one nav slot. `gap` is The Gap (`/gap/`) for a city with a deficit, and `reserves` is Balance & Reserves (`/reserves/`) for one in balance. An editor chooses the variant; it isn't computed, because a city can be balanced only by cuts or one-time money. It needs a `reason` that quotes a City document, and the data check confirms the quote is on that PDF page. The overview follows the variant: its third headline figure, its "Jump to…" link, card 2 and its meta description.
- **`ballot`** turns the Ballot page on or off: the page, its nav item and the overview's ballot card, which becomes a capital card when it's off. Turn it on while the city has a measure that matters to its budget.
- **`budget`** is the cadence (`annual` with one year, or `biennial` with two consecutive years) and how the city writes a fiscal year. The tokens are `{start}` 2026, `{end}` 2027, `{ss}` 26 and `{yy}` 27, for the year ending in 2027. Berkeley writes `FY2027`; Fremont writes `FY 2026/27` (`"FY {start}/{yy}"`). Use the city's own style, because receipts quote its documents. Every label the page-set code shows comes from `fy()` in `src/lib/city-settings.ts`. The data model still has two fixed years (`fy2027`/`fy2028`); making it per-year is #43.
- **`featured`**: exactly one city has it. The landing page's headline figures come from that city, and its Cities section lists every city.

The build fails if a city switches on a page without the data that page needs: `gap` and `ballot` need `budget.json` and `ballot.json`, and `reserves` needs `reserves.json` in the city's folder. That file lists each reserve's name, what it's for in plain words, and its amount as a quote and PDF page. The amount is parsed from the quote, which must hold exactly one dollar figure, and the quote is checked against its page. `src/components/Reserves.astro` renders it, for the Balance & Reserves page now and the Gap page later.

**To add a city**, create its folder and `city.json` (copy Berkeley's and set the settings above). The budget data for each city lives in the same folder.

### Test fixture cities

`data/fixtures/{name}/city.json` is a city that only tests see. It is served at `/test/cities/{name}/`, marked noindex, and left out of the city switcher, the landing page and Berkeley's receipts, like `/test/receipts/`. `fixtureville` is in balance, has no ballot and budgets one year at a time. It borrows Berkeley's budget data (`"fixture": { "data": "us/ca/berkeley" }`) so its other pages have something to show; its settings and `reserves.json` are its own, and are quote-checked like a real city's. The browser tests run the nav, overflow and accessibility checks on its 6-link nav as well as Berkeley's 7-link one.

### Budget data: workbook → `budget.json`

Nothing on the site is typed in by hand. Each city's numbers come from a source workbook committed beside it:

```
data/cities/us/ca/berkeley/
  city.json
  source/Berkeley_Budget_FY25-FY28.xlsx   the workbook (compiled from public documents)
  budget.json                            generated from it: commit both together
```

`npm run data` extracts the workbook into `budget.json` (`src/data/berkeley/extract.ts`) and validates it (`src/data/berkeley/validate.ts`). `npm run build` first runs `npm run data:check`, which fails the build if any check breaks or if `budget.json` doesn't match the workbook. So **after editing the workbook, run `npm run data` and commit both files.**

- **Every record carries a receipt:** `source` (S1–S19, rows of the *Sources & Links* tab, where S1–S10 are City documents and S11–S19 news; S20 onwards come from `documents.json`), optional `related` sources, and the workbook `table` and `row` it came from.
- **Derived numbers are computed, not read.** The workbook doesn't store results for all of its formulas, so the extractor reads typed-in inputs and TOTAL rows, computes everything else, and checks its arithmetic against every result Excel did store.
- **Validation** ties every TOTAL row to its lines and pins the City's headline figures (FY27 department baselines $283,764,035, the FY27 gap −$29,249,339, …). A moved column, a changed source line, or a formula typed over an input cell stops the build with the cell address.
- **City documents published after the workbook** are in `documents.json`. It adds sources S20 onwards, after the workbook's, and the facts they state. Each fact has a `quote` and a PDF `page`. `source/excerpts/S{n}.json` holds the text of just those pages (news excerpts keep only the paragraphs quoted). The build checks every quote against its page and parses every number from the quote itself. Tables are read row by row: a row's five years must sum to its 5-year column, and each section must sum to its Total row. Receipts for these facts show "p. N of the PDF" and the sentence. To add one, extract the page text into the excerpt file, add the quote, and run `npm run data`.
- **Skipped on purpose:** the *Scenario Model* tab (its "gap remaining" counts the $9.4M twice: as FY27 tax revenue, though the tax would start April 1, 2027, and as the one-time bridge).
- **Downloads:** the build publishes `/us/ca/berkeley/data/budget.json`, one CSV per table, and the original workbook.

Pages read the data with `budgetFor(city)` from `src/lib/budget.ts`.

## Deploying

The site is the Cloudflare Worker `wherethemoneywent`. Production is served on the custom domains `wherethemoneywent.com` and `www.wherethemoneywent.com` (declared in `wrangler.jsonc`), and `www` 301s to the apex.

- **Production** deploys from `main`: on every push, CI runs `wrangler deploy`, then smoke-tests both the workers.dev URL and `https://wherethemoneywent.com` (including the `www` redirect).
- **Every PR** gets a preview: CI uploads a version with `wrangler versions upload --preview-alias pr-<number>`, smoke-tests it, and comments the URL on the PR (`https://pr-<number>-wherethemoneywent.<subdomain>.workers.dev`). Fork PRs don't get secrets, so they skip this.

### One-time setup

1. Create a Cloudflare API token (dash → My Profile → API Tokens → *Edit Cloudflare Workers* template), scoped to the account.
2. Add two repo secrets (Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN`: the token
   - `CLOUDFLARE_ACCOUNT_ID`: the account ID (`npx wrangler whoami` prints it)
3. The `wherethemoneywent.com` zone must be active in the same Cloudflare account, because the custom-domain routes fail to attach otherwise.
4. The first production deploy creates the Worker. Preview aliases only work once it exists, so either merge to `main` first or run `npm run deploy` once by hand.

Until the secrets exist, the deploy jobs fail with an error that points here. The lint/test/build job runs on its own regardless.

To deploy by hand: `npx wrangler login`, then `npm run deploy`.
