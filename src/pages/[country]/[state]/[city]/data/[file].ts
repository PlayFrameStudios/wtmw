/**
 * Download files for each city with budget data, generated at build time:
 *   /us/ca/berkeley/data/budget.json                    everything, combined
 *   /us/ca/berkeley/data/{table}.csv                    one file per table
 *   /us/ca/berkeley/data/Berkeley_Budget_FY25-FY28.xlsx the original workbook, for a city built from one
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { APIRoute } from 'astro';
import { csvTables, toCsv } from '../../../../../data/csv.ts';
import { budgetFor } from '../../../../../lib/budget.ts';
import { allCities } from '../../../../../lib/cities.ts';

export function getStaticPaths() {
  // Test fixtures too (#42): their receipts link to their own downloads, of the data they borrow.
  return allCities.flatMap((city) => {
    const budget = budgetFor(city);
    if (!budget) return [];
    const files: { file: string; body: string | Uint8Array; type: string }[] = [
      { file: 'budget.json', body: JSON.stringify(budget, null, 2) + '\n', type: 'application/json' },
      ...csvTables(budget).map((t) => ({ file: `${t.name}.csv`, body: toCsv(t), type: 'text/csv; charset=utf-8' })),
      ...(budget.workbook
        ? [
            {
              file: basename(budget.workbook.file),
              body: readFileSync(join(process.cwd(), city.dataDir, budget.workbook.file)),
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
          ]
        : []),
    ];
    return files.map(({ file, body, type }) => ({ params: { ...city.slug, file }, props: { body, type } }));
  });
}

export const GET: APIRoute = ({ props }) =>
  new Response(props.body as BodyInit, { headers: { 'Content-Type': props.type as string } });
