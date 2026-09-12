import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  BANK_TXN_CLASSIFICATIONS,
  bankAccounts,
  bankTransactions,
  bankTransactionSplits,
  budgetCategories,
  budgetFiscalYears,
  budgetLines,
  expenseReportLines,
  expenseReports,
  fundingSources,
  type BankAccount,
  type BankTransaction,
  type BankTxnClassification,
  type BudgetFiscalYear,
  type FundingSource,
} from "@/lib/db/schema";
import { normalizePayeeDescription, type SimilarTxnStats } from "@/lib/budget/payee";

// -------------------- Types --------------------

export type BudgetGridLine = {
  id: string;
  code: string;
  fullCode: string;
  name: string;
  monthly: number[];
  annual: number;
};

export type BudgetGridCategory = {
  id: string;
  code: string;
  name: string;
  lines: BudgetGridLine[];
  monthlyTotals: number[];
  annualTotal: number;
};

export type BudgetGrid = {
  fiscalYear: BudgetFiscalYear;
  categories: BudgetGridCategory[];
  monthlyTotals: number[];
  annualTotal: number;
};

export type RevenueGridRow = {
  id: string;
  name: string;
  kind: string;
  monthly: number[];
  annual: number;
};

export type RevenueGrid = {
  fiscalYear: BudgetFiscalYear;
  rows: RevenueGridRow[];
  monthlyTotals: number[];
  annualTotal: number;
};

/** Snapshot of cash flow for a fiscal year, computed live from bank txns. */
export type CashPosition = {
  fiscalYearId: string;
  openingBalance: number | null;
  totalCredits: number; // money in (grants, contract payments, refunds…)
  totalDebits: number; // money out (all classified debits)
  /** Sum of latest running balance across all bank accounts. */
  currentBalance: number | null;
  accountsCount: number;
  transactionsCount: number;
};

// -------------------- Fiscal years --------------------

export async function getFiscalYears(): Promise<BudgetFiscalYear[]> {
  return db
    .select()
    .from(budgetFiscalYears)
    .orderBy(asc(budgetFiscalYears.year));
}

export async function getFiscalYear(
  year: number,
): Promise<BudgetFiscalYear | null> {
  const [row] = await db
    .select()
    .from(budgetFiscalYears)
    .where(eq(budgetFiscalYears.year, year));
  return row ?? null;
}

// -------------------- Budget grid (disbursements) --------------------

export async function getBudgetGrid(year: number): Promise<BudgetGrid | null> {
  const fiscalYear = await getFiscalYear(year);
  if (!fiscalYear) return null;

  const cats = await db
    .select()
    .from(budgetCategories)
    .where(eq(budgetCategories.fiscalYearId, fiscalYear.id))
    .orderBy(asc(budgetCategories.sortOrder));

  const allLines = cats.length
    ? await db
        .select()
        .from(budgetLines)
        .orderBy(asc(budgetLines.categoryId), asc(budgetLines.sortOrder))
    : [];

  const byCategory = new Map<string, BudgetGridLine[]>();
  for (const line of allLines) {
    const monthly = padTo12((line.monthlyProjected ?? []).map(Number));
    const grid: BudgetGridLine = {
      id: line.id,
      code: line.code,
      fullCode: line.fullCode,
      name: line.name,
      monthly,
      annual: sum(monthly),
    };
    const bucket = byCategory.get(line.categoryId);
    if (bucket) bucket.push(grid);
    else byCategory.set(line.categoryId, [grid]);
  }

  const categories: BudgetGridCategory[] = cats.map((c) => {
    const lines = byCategory.get(c.id) ?? [];
    const monthlyTotals = sumRows(lines.map((l) => l.monthly));
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      lines,
      monthlyTotals,
      annualTotal: sum(monthlyTotals),
    };
  });

  const monthlyTotals = sumRows(categories.map((c) => c.monthlyTotals));

  return {
    fiscalYear,
    categories,
    monthlyTotals,
    annualTotal: sum(monthlyTotals),
  };
}

// -------------------- Funding sources & revenue --------------------

export async function getFundingSources(
  fiscalYearId: string,
): Promise<FundingSource[]> {
  return db
    .select()
    .from(fundingSources)
    .where(eq(fundingSources.fiscalYearId, fiscalYearId))
    .orderBy(asc(fundingSources.sortOrder), asc(fundingSources.name));
}

export async function getFundingSourceById(
  id: string,
): Promise<FundingSource | null> {
  const [row] = await db
    .select()
    .from(fundingSources)
    .where(eq(fundingSources.id, id));
  return row ?? null;
}

/**
 * Make sure a funding source has a dedicated budget line under "007
 * Project-specific lines" to hang its off-budget costs on — things that
 * don't map to the general 001-006 budget at all (art materials for one
 * activity, a one-off honorarium, …). Costs that DO belong on the general
 * budget still get tagged to the relevant 001-006 line with this funding
 * source attached; this just gives project-specific spend a home.
 *
 * No-ops if already linked. Reuses an existing 007 line with a matching
 * name first (so re-running never creates duplicates), otherwise creates
 * one. Returns the line id, or null if the year has no "007" category yet
 * (not seeded) — callers should treat that as "skip, nothing to link".
 */
export async function ensureProjectLine(
  fundingSourceId: string,
): Promise<string | null> {
  const [source] = await db
    .select()
    .from(fundingSources)
    .where(eq(fundingSources.id, fundingSourceId));
  if (!source) return null;
  if (source.projectLineId) return source.projectLineId;

  const [cat007] = await db
    .select()
    .from(budgetCategories)
    .where(
      and(
        eq(budgetCategories.fiscalYearId, source.fiscalYearId),
        eq(budgetCategories.code, "007"),
      ),
    );
  if (!cat007) return null;

  const norm = (v: string) => v.toLowerCase().replace(/[\s._]+/g, "-").trim();
  const existingLines = await db
    .select()
    .from(budgetLines)
    .where(eq(budgetLines.categoryId, cat007.id));
  const match = existingLines.find((l) => norm(l.name) === norm(source.name));

  let lineId: string;
  if (match) {
    lineId = match.id;
  } else {
    const nextSort =
      existingLines.reduce((m, l) => Math.max(m, l.sortOrder), 0) + 1;
    const [inserted] = await db
      .insert(budgetLines)
      .values({
        categoryId: cat007.id,
        code: source.name,
        fullCode: source.name,
        name: source.name,
        monthlyProjected: Array(12).fill("0.00"),
        sortOrder: nextSort,
      })
      .returning({ id: budgetLines.id });
    lineId = inserted!.id;
  }

  await db
    .update(fundingSources)
    .set({ projectLineId: lineId })
    .where(eq(fundingSources.id, fundingSourceId));
  return lineId;
}

/** Revenue grid — one row per funding source, monthly expected receipts. */
export async function getRevenueGrid(year: number): Promise<RevenueGrid | null> {
  const fiscalYear = await getFiscalYear(year);
  if (!fiscalYear) return null;

  const sources = await getFundingSources(fiscalYear.id);
  const rows: RevenueGridRow[] = sources.map((s) => {
    const monthly = padTo12((s.monthlyExpected ?? []).map(Number));
    return {
      id: s.id,
      name: s.name,
      kind: s.kind,
      monthly,
      annual: sum(monthly),
    };
  });
  const monthlyTotals = sumRows(rows.map((r) => r.monthly));
  return {
    fiscalYear,
    rows,
    monthlyTotals,
    annualTotal: sum(monthlyTotals),
  };
}

/** Amount actually received (credits) tagged to a funding source YTD. */
export async function getFundingSourceReceivedById(
  id: string,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${bankTransactions.credit}), 0)`,
    })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.fundingSourceId, id),
        eq(bankTransactions.classification, "grant_receipt"),
      ),
    );
  return Number(row?.total ?? 0);
}

/**
 * Amount spent to date against a funding source, combining direct bank
 * debits (classification=direct_expense with this funding source) AND paid
 * ER lines that reference this funding source. The two never overlap: an
 * ER reimbursement bank txn is classified as `er_reimbursement`, so its
 * debit isn't counted here — the ER's line items are counted instead.
 */
/**
 * Amount received / spent between two dates (inclusive), regardless of
 * fiscal year. Used to compute multi-year contract totals for grants
 * that straddle fiscal boundaries.
 */
export async function getFundingSourceReceivedInPeriod(
  id: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${bankTransactions.credit}), 0)`,
    })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.fundingSourceId, id),
        eq(bankTransactions.classification, "grant_receipt"),
        sql`${bankTransactions.txnDate} >= ${startDate}`,
        sql`${bankTransactions.txnDate} <= ${endDate}`,
      ),
    );
  return Number(row?.total ?? 0);
}

/**
 * Actual receipts (grant_receipt bank txns) grouped by funding source for a
 * fiscal year, scoped to that year's date range only — mirrors
 * `getBudgetLineSpentMap` on the disbursement side. Used to overlay actuals
 * on the projected revenue grid.
 */
export async function getRevenueReceivedMap(
  fiscalYearId: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const [{ year: fyYear } = { year: undefined }] = await db
    .select({ year: budgetFiscalYears.year })
    .from(budgetFiscalYears)
    .where(eq(budgetFiscalYears.id, fiscalYearId));
  if (fyYear === undefined) return result;

  const yearStart = `${fyYear}-01-01`;
  const yearEnd = `${fyYear}-12-31`;
  const rows = await db
    .select({
      fundingSourceId: bankTransactions.fundingSourceId,
      total: sql<string>`COALESCE(SUM(${bankTransactions.credit}), 0)`,
    })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.classification, "grant_receipt"),
        sql`${bankTransactions.fundingSourceId} IS NOT NULL`,
        sql`${bankTransactions.txnDate} >= ${yearStart}`,
        sql`${bankTransactions.txnDate} <= ${yearEnd}`,
      ),
    )
    .groupBy(bankTransactions.fundingSourceId);

  for (const r of rows) {
    if (r.fundingSourceId) result.set(r.fundingSourceId, Number(r.total));
  }
  return result;
}

export async function getFundingSourceSpentInPeriod(
  id: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const [directRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${bankTransactions.debit}), 0)`,
    })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.fundingSourceId, id),
        eq(bankTransactions.classification, "direct_expense"),
        sql`${bankTransactions.txnDate} >= ${startDate}`,
        sql`${bankTransactions.txnDate} <= ${endDate}`,
        sql`NOT EXISTS (SELECT 1 FROM ${bankTransactionSplits} WHERE ${bankTransactionSplits.bankTxnId} = ${bankTransactions.id})`,
      ),
    );
  const [splitRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${bankTransactionSplits.amount}), 0)`,
    })
    .from(bankTransactionSplits)
    .innerJoin(
      bankTransactions,
      eq(bankTransactions.id, bankTransactionSplits.bankTxnId),
    )
    .where(
      and(
        eq(bankTransactionSplits.fundingSourceId, id),
        sql`${bankTransactions.txnDate} >= ${startDate}`,
        sql`${bankTransactions.txnDate} <= ${endDate}`,
      ),
    );
  const [erRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${expenseReportLines.cost}), 0)`,
    })
    .from(expenseReportLines)
    .innerJoin(expenseReports, eq(expenseReports.id, expenseReportLines.reportId))
    .where(
      and(
        eq(expenseReportLines.fundingSourceId, id),
        eq(expenseReports.status, "paid"),
        sql`${expenseReportLines.expenseDate} >= ${startDate}`,
        sql`${expenseReportLines.expenseDate} <= ${endDate}`,
      ),
    );
  return (
    Number(directRow?.total ?? 0) +
    Number(splitRow?.total ?? 0) +
    Number(erRow?.total ?? 0)
  );
}

export async function getFundingSourceSpentById(id: string): Promise<number> {
  // Direct bank debits tagged with this funding source, EXCLUDING those that
  // have splits (splits govern in that case and are summed below).
  const [directRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${bankTransactions.debit}), 0)`,
    })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.fundingSourceId, id),
        eq(bankTransactions.classification, "direct_expense"),
        sql`NOT EXISTS (SELECT 1 FROM ${bankTransactionSplits} WHERE ${bankTransactionSplits.bankTxnId} = ${bankTransactions.id})`,
      ),
    );

  // Split allocations tagged with this funding source.
  const [splitRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${bankTransactionSplits.amount}), 0)`,
    })
    .from(bankTransactionSplits)
    .where(eq(bankTransactionSplits.fundingSourceId, id));

  const [erRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${expenseReportLines.cost}), 0)`,
    })
    .from(expenseReportLines)
    .innerJoin(expenseReports, eq(expenseReports.id, expenseReportLines.reportId))
    .where(
      and(
        eq(expenseReportLines.fundingSourceId, id),
        eq(expenseReports.status, "paid"),
      ),
    );

  return (
    Number(directRow?.total ?? 0) +
    Number(splitRow?.total ?? 0) +
    Number(erRow?.total ?? 0)
  );
}

// -------------------- Bank accounts & transactions --------------------

export async function getBankAccounts(): Promise<BankAccount[]> {
  return db
    .select()
    .from(bankAccounts)
    .orderBy(asc(bankAccounts.sortOrder), asc(bankAccounts.name));
}

export async function getBankAccountByName(
  name: string,
): Promise<BankAccount | null> {
  const [row] = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.name, name));
  return row ?? null;
}

/** Cash position rollup for a year — reads live from bank_transaction. */
export async function getCashPosition(year: number): Promise<CashPosition | null> {
  const fiscalYear = await getFiscalYear(year);
  if (!fiscalYear) return null;

  const accounts = await getBankAccounts();

  // Sum credits & debits for txns in this calendar year.
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const [totals] = await db
    .select({
      credits: sql<string>`COALESCE(SUM(${bankTransactions.credit}), 0)`,
      debits: sql<string>`COALESCE(SUM(${bankTransactions.debit}), 0)`,
      txnCount: sql<number>`COUNT(*)::int`,
    })
    .from(bankTransactions)
    .where(
      and(
        sql`${bankTransactions.txnDate} >= ${yearStart}`,
        sql`${bankTransactions.txnDate} <= ${yearEnd}`,
      ),
    );

  // Current balance = sum of the latest running_balance per account across
  // all accounts. Uses a DISTINCT ON in a raw fragment because Drizzle
  // doesn't expose it cleanly.
  const latestRows = accounts.length
    ? await db.execute<{ running_balance: string | null }>(sql`
        SELECT DISTINCT ON (account_id) running_balance
        FROM bank_transaction
        ORDER BY account_id, txn_date DESC, created_at DESC
      `)
    : { rows: [] as { running_balance: string | null }[] };

  const rows = Array.isArray(latestRows)
    ? (latestRows as unknown as { running_balance: string | null }[])
    : (latestRows as { rows: { running_balance: string | null }[] }).rows;

  const currentBalance = rows.length
    ? rows.reduce((s, r) => s + Number(r.running_balance ?? 0), 0)
    : null;

  return {
    fiscalYearId: fiscalYear.id,
    openingBalance: fiscalYear.openingBalance ? Number(fiscalYear.openingBalance) : null,
    totalCredits: Number(totals?.credits ?? 0),
    totalDebits: Number(totals?.debits ?? 0),
    currentBalance,
    accountsCount: accounts.length,
    transactionsCount: Number(totals?.txnCount ?? 0),
  };
}

export type BankTxnFilters = {
  accountId?: string;
  classification?: BankTxnClassification;
  year?: number;
  search?: string; // description substring, case-insensitive
};

export async function getBankTransactions(
  filters: BankTxnFilters = {},
  limit = 500,
): Promise<BankTransaction[]> {
  const clauses: SQL[] = [];
  if (filters.accountId) clauses.push(eq(bankTransactions.accountId, filters.accountId));
  if (filters.classification)
    clauses.push(eq(bankTransactions.classification, filters.classification));
  if (filters.year) {
    clauses.push(sql`${bankTransactions.txnDate} >= ${`${filters.year}-01-01`}`);
    clauses.push(sql`${bankTransactions.txnDate} <= ${`${filters.year}-12-31`}`);
  }
  if (filters.search) {
    clauses.push(sql`${bankTransactions.description} ILIKE ${`%${filters.search}%`}`);
  }

  return db
    .select()
    .from(bankTransactions)
    .where(clauses.length > 0 ? and(...clauses) : undefined)
    .orderBy(desc(bankTransactions.txnDate), desc(bankTransactions.createdAt))
    .limit(limit);
}

export async function getBankTransactionById(
  id: string,
): Promise<BankTransaction | null> {
  const [row] = await db
    .select()
    .from(bankTransactions)
    .where(eq(bankTransactions.id, id));
  return row ?? null;
}

/**
 * Count bank rows that share this txn's payee key (normalized description)
 * and the same debit/credit direction. Used to offer "classify all of this
 * sort" on the classify page.
 */
export async function getSimilarTxnStats(txn: {
  description: string;
  debit: string | null;
  credit: string | null;
}): Promise<SimilarTxnStats> {
  const key = normalizePayeeDescription(txn.description);
  const isDebit = !!txn.debit;
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      unclassified: sql<number>`count(*) FILTER (WHERE classification = 'unclassified')::int`,
    })
    .from(bankTransactions)
    .where(
      and(
        sql`upper(trim(regexp_replace(${bankTransactions.description}, '[[:space:]]+', ' ', 'g'))) = ${key}`,
        isDebit
          ? sql`${bankTransactions.debit} IS NOT NULL`
          : sql`${bankTransactions.credit} IS NOT NULL`,
      ),
    );
  const total = row?.total ?? 0;
  return {
    key,
    label: key,
    total,
    unclassified: row?.unclassified ?? 0,
    siblingCount: Math.max(0, total - 1),
  };
}

/** Splits for a bank txn — used by the classify page to seed the form. */
export async function getBankSplits(txnId: string) {
  return db
    .select({
      id: bankTransactionSplits.id,
      budgetLineId: bankTransactionSplits.budgetLineId,
      fundingSourceId: bankTransactionSplits.fundingSourceId,
      amount: bankTransactionSplits.amount,
      description: bankTransactionSplits.description,
      sortOrder: bankTransactionSplits.sortOrder,
    })
    .from(bankTransactionSplits)
    .where(eq(bankTransactionSplits.bankTxnId, txnId))
    .orderBy(bankTransactionSplits.sortOrder);
}

/** Rows that need human review, per classification breakdown. */
export async function getReconciliationHealth(year?: number): Promise<
  Array<{ classification: BankTxnClassification; count: number }>
> {
  const clauses: SQL[] = [];
  if (year) {
    clauses.push(sql`${bankTransactions.txnDate} >= ${`${year}-01-01`}`);
    clauses.push(sql`${bankTransactions.txnDate} <= ${`${year}-12-31`}`);
  }
  const rows = await db
    .select({
      classification: bankTransactions.classification,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(bankTransactions)
    .where(clauses.length > 0 ? and(...clauses) : undefined)
    .groupBy(bankTransactions.classification);

  return rows.map((r) => ({
    classification: r.classification as BankTxnClassification,
    count: Number(r.count ?? 0),
  }));
}

/** Reversal candidates: prior debits with the same amount and account, close to the reversal date. */
export async function findReversalCandidates(
  reversal: Pick<BankTransaction, "accountId" | "credit" | "txnDate">,
  windowDays = 30,
): Promise<BankTransaction[]> {
  if (!reversal.credit || !reversal.accountId) return [];
  // Postgres date arithmetic on the ISO string column.
  return db
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.accountId, reversal.accountId),
        eq(bankTransactions.debit, reversal.credit),
        sql`${bankTransactions.txnDate}::date >= (${reversal.txnDate}::date - INTERVAL '${sql.raw(String(windowDays))} days')`,
        sql`${bankTransactions.txnDate}::date <= ${reversal.txnDate}::date`,
        // Don't propose a txn that's already paired as a reversal target.
        isNull(bankTransactions.reversalOfTxnId),
      ),
    )
    .orderBy(desc(bankTransactions.txnDate))
    .limit(10);
}

// -------------------- Helpers --------------------

function sum(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0);
}

function sumRows(rows: number[][]): number[] {
  return Array.from({ length: 12 }, (_, i) => rows.reduce((s, r) => s + (r[i] ?? 0), 0));
}

function padTo12(arr: number[]): number[] {
  return Array.from({ length: 12 }, (_, i) => arr[i] ?? 0);
}

export { BANK_TXN_CLASSIFICATIONS };
