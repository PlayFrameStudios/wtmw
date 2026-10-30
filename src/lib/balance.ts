/**
 * Where a balanced budget stands (#44): its sources and uses, what is left after them, what the
 * budget assumes, and the City's forecast. Every figure is one the build read from a quote or a
 * table row (budget.facts) and checked; nothing here is computed for the reader. A budget without
 * these facts (Berkeley's, which has a deficit plan instead) gets undefined, and the overview and
 * Balance & Reserves pages render as before.
 */
import type { CityBudget, DocRef, Fact } from '../data/types.ts';
import type { Figure } from './receipts.ts';

const FACTS = [
  'directCostShare',
  'beginningBalance',
  'totalRevenues',
  'transfersIn',
  'totalSources',
  'totalExpenditures',
  'transfersOut',
  'totalUses',
  'contingencyIncrease',
  'unreservedBalance',
  'uncertaintyReserve',
  'uncertaintyReserveDraw',
  'maintenanceNotRestored',
  'personnelNotRestored',
  'citywideSavings',
  'salaryPlaceholder',
  'contingencyPolicy',
  'contingencyReserve',
  'salesTaxRecovery',
] as const;
const STATEMENTS = ['noUncertaintyFunding', 'forecastSalary'] as const;
const FORECAST = [2028, 2029] as const;

export interface Segment {
  key: string;
  label: string;
  figure: Figure;
}

export interface Balance {
  year: number;
  /** The City's own share for public safety and maintenance, of its own denominator. */
  directCostShare: Figure;
  sources: { segments: Segment[]; total: Figure };
  uses: { segments: Segment[]; total: Figure };
  /** What sources leave after uses: the Contingency Reserve's increase and the unreserved balance. */
  left: Segment[];
  notRestored: { maintenance: Figure; personnel: Figure };
  savings: Figure;
  salary: Figure;
  contingencyPolicy: Figure;
  uncertainty: { now: Figure; draw: Figure; salesTaxRecovery: Figure; noNewFunding: DocRef };
  /** The adopted year, then the City's forecast years: each reserve and the unreserved balance at year end. */
  forecast: { salary: DocRef; years: { year: number; projected: boolean; contingency: Figure; uncertainty: Figure; unreserved: Figure }[] };
}

/** The budget's balance facts, or undefined if it doesn't have every one. */
export function balanceOf(budget: CityBudget, yearLabel: (year: number) => string): Balance | undefined {
  const facts = budget.facts;
  const statements = budget.statements;
  if (!facts || !statements) return undefined;
  const forecastKeys = FORECAST.flatMap((y) => [`forecastContingency${y}`, `forecastUncertainty${y}`, `forecastUnreserved${y}`]);
  if (![...FACTS, ...forecastKeys].every((k) => k in facts) || !STATEMENTS.every((k) => k in statements)) return undefined;

  const year = budget.generalFund[0].year;
  const y = yearLabel(year);
  const fig = (f: Fact, label: string): Figure => ({
    value: f.value,
    label,
    ref: f,
    tone: 'neutral',
    ...(f.format === 'percent' && { format: 'percent' as const }),
  });
  const seg = (key: (typeof FACTS)[number], label: string, figureLabel = `${label}, ${y}`): Segment => ({ key, label, figure: fig(facts[key], figureLabel) });

  return {
    year,
    directCostShare: fig(facts.directCostShare, `Share of the budget for direct costs of public safety and maintenance, ${y}, as the City states it`),
    sources: {
      segments: [seg('totalRevenues', 'Revenue'), seg('transfersIn', 'Transfers in'), seg('beginningBalance', 'Unreserved balance carried in')],
      total: fig(facts.totalSources, `General Fund total sources, ${y}`),
    },
    uses: {
      segments: [seg('totalExpenditures', 'Spending', `General Fund total expenditures, ${y}`), seg('transfersOut', 'Transfers out')],
      total: fig(facts.totalUses, `General Fund total uses, ${y}`),
    },
    left: [seg('contingencyIncrease', 'Added to the Contingency Reserve'), seg('unreservedBalance', 'Unreserved at year end', `Unreserved fund balance at the end of ${y}`)],
    notRestored: {
      maintenance: fig(facts.maintenanceNotRestored, 'Ongoing maintenance support eliminated in FY 2025/26 and not restored'),
      personnel: fig(facts.personnelNotRestored, 'Ongoing personnel, supplies and services reductions from FY 2025/26 not restored'),
    },
    savings: fig(facts.citywideSavings, `Citywide Savings, the savings assumption in total expenditures, ${y}`),
    salary: fig(facts.salaryPlaceholder, `Placeholder salary adjustment, ${y}`),
    contingencyPolicy: fig(facts.contingencyPolicy, 'Contingency Reserve policy level, share of budgeted expenditures and transfers out'),
    uncertainty: {
      now: fig(facts.uncertaintyReserve, `Budget Uncertainty Reserve, ${y}`),
      draw: fig(facts.uncertaintyReserveDraw, 'Budget Uncertainty Reserve used in FY 2024/25 to cover a one-time revenue shortfall'),
      salesTaxRecovery: fig(facts.salesTaxRecovery, 'Sales tax the State recovered in FY 2024/25 for FY 2022/23 overpayments, approximately'),
      noNewFunding: statements.noUncertaintyFunding,
    },
    forecast: {
      salary: statements.forecastSalary,
      years: [
        {
          year,
          projected: false,
          contingency: fig(facts.contingencyReserve, `Contingency Reserve, end of ${y}`),
          uncertainty: fig(facts.uncertaintyReserve, `Budget Uncertainty Reserve, end of ${y}`),
          unreserved: fig(facts.unreservedBalance, `Unreserved fund balance, end of ${y}`),
        },
        ...FORECAST.map((fy) => ({
          year: fy,
          projected: true,
          contingency: fig(facts[`forecastContingency${fy}`], `Contingency Reserve, ${yearLabel(fy)}, City forecast`),
          uncertainty: fig(facts[`forecastUncertainty${fy}`], `Budget Uncertainty Reserve, ${yearLabel(fy)}, City forecast`),
          unreserved: fig(facts[`forecastUnreserved${fy}`], `Unreserved fund balance, ${yearLabel(fy)}, City forecast`),
        })),
      ],
    },
  };
}
