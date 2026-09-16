import {
  getBudgetGrid,
  getCashPosition,
  getFiscalYear,
  getRevenueGrid,
  getRevenueReceivedMap,
} from "./queries";
import { getBudgetLineSpentMap } from "./er-queries";
import { getExpenseLedger, groupByFundingSource, groupByMonth, sumLedger } from "./ledger";
import type { FinancialReportProps } from "./financial-report-pdf";

const SPEND_KIND_LABEL: Record<string, string> = {
  grant: "Grants",
  service_contract: "Service contracts",
  donation: "Donations",
  other: "Other",
  untagged: "Untagged / general operating",
};

const SPEND_KIND_ORDER = ["grant", "service_contract", "donation", "other", "untagged"];

/**
 * Assembles everything the financial-report PDF needs for a given fiscal
 * year. Returns null if the year hasn't been seeded yet.
 */
export async function buildFinancialReportProps(
  year: number,
  preparedBy: string,
): Promise<FinancialReportProps | null> {
  const fiscalYear = await getFiscalYear(year);
  if (!fiscalYear) return null;

  const [grid, revenue, cash, expenseRows] = await Promise.all([
    getBudgetGrid(year),
    getRevenueGrid(year),
    getCashPosition(year),
    getExpenseLedger({ year, includeUnclassified: false }),
  ]);
  if (!grid) return null;

  const [spentByLine, receivedBySource] = await Promise.all([
    getBudgetLineSpentMap(fiscalYear.id),
    getRevenueReceivedMap(fiscalYear.id),
  ]);

  const fundingRows = (revenue?.rows ?? []).map((r) => ({
    fundingSourceId: r.id,
    name: r.name,
    kind: r.kind,
    annualProjected: r.annual,
    actualReceived: receivedBySource.get(r.id) ?? 0,
  }));
  const totalRevenueActual = fundingRows.reduce((s, r) => s + r.actualReceived, 0);

  const expenseCategories = grid.categories.map((c) => ({
    code: c.code,
    name: c.name,
    annualBudget: c.annualTotal,
    actualSpent: c.lines.reduce((s, l) => s + (spentByLine.get(l.id) ?? 0), 0),
  }));
  const totalExpenseActual = expenseCategories.reduce((s, c) => s + c.actualSpent, 0);

  const kindTotals = new Map<string, number>();
  for (const slice of groupByFundingSource(expenseRows)) {
    const key = slice.fundingSourceKind ?? "untagged";
    kindTotals.set(key, (kindTotals.get(key) ?? 0) + slice.total);
  }
  const spendByKind = SPEND_KIND_ORDER.filter((k) => (kindTotals.get(k) ?? 0) > 0).map(
    (kind) => ({
      kind,
      label: SPEND_KIND_LABEL[kind] ?? kind,
      total: kindTotals.get(kind) ?? 0,
    }),
  );

  const spendTotal = sumLedger(expenseRows);
  const monthsWithSpend = groupByMonth(expenseRows).length || 1;
  const avgMonthlySpend = spendTotal / monthsWithSpend;
  const runwayMonths =
    cash?.currentBalance != null && avgMonthlySpend > 0
      ? cash.currentBalance / avgMonthlySpend
      : null;

  const latestTxnDate = expenseRows.reduce<string | null>(
    (latest, r) => (latest === null || r.date > latest ? r.date : latest),
    null,
  );
  const asOfDate = latestTxnDate ?? `${year}-01-01`;

  return {
    fiscalYear,
    generatedAt: new Date(),
    asOfDate,
    openingBalance: cash?.openingBalance ?? null,
    currentBalance: cash?.currentBalance ?? null,
    totalRevenueActual,
    totalExpenseActual,
    fundingRows,
    revenueAnnualTotal: revenue?.annualTotal ?? 0,
    expenseCategories,
    expenseAnnualTotal: grid.annualTotal,
    spendByKind,
    avgMonthlySpend,
    runwayMonths,
    preparedBy,
  };
}
