import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bankAccounts,
  bankTransactions,
  bankTransactionSplits,
  budgetCategories,
  budgetLines,
  expenseReports,
  expenseReportLines,
  fundingSources,
} from "@/lib/db/schema";

/**
 * Unified expense ledger — one row per actual outflow of money, whether it
 * happened as a direct bank debit or as a line inside a paid expense report.
 *
 * The reconciliation invariant that keeps this a real ledger:
 *   - A bank txn classified as `direct_expense` contributes one row here.
 *   - A bank txn classified as `er_reimbursement` contributes NO rows here;
 *     the ER's line items contribute instead. This is what stops the same
 *     dollar from appearing twice.
 *
 * All amounts are positive. Every row carries a `source` back-reference so
 * the caller can link to the underlying record.
 */

export type ExpenseLedgerRow = {
  /** Stable synthetic id. Prefix `bank_`, `split_`, `manual_`, `unclassified_`, `er_`. */
  id: string;
  /** ISO yyyy-mm-dd. */
  date: string;
  description: string;
  categoryCode: string | null;
  categoryName: string | null;
  budgetLineId: string | null;
  budgetLineCode: string | null;
  budgetLineName: string | null;
  fundingSourceId: string | null;
  fundingSourceName: string | null;
  cost: number;
  /** True when the row has no budget line yet (unclassified bank txn). */
  pending: boolean;
  source:
    | {
        kind: "bank";
        txnId: string;
        accountName: string | null;
      }
    | {
        kind: "split";
        txnId: string;
        splitId: string;
        accountName: string | null;
      }
    | {
        kind: "manual";
        txnId: string;
        accountName: string | null;
      }
    | {
        kind: "unclassified";
        txnId: string;
        accountName: string | null;
      }
    | {
        kind: "er";
        reportId: string;
        reportNumber: string;
        submitterName: string;
      };
};

export type ExpenseLedgerFilters = {
  year: number;
  month?: number; // 1..12
  categoryCode?: string;
  budgetLineId?: string;
  fundingSourceId?: string;
  sourceType?: "bank" | "er" | "manual" | "unclassified" | "split";
  /**
   * When true, include unclassified bank debits in the ledger so the
   * operator sees everything on their bank statement in one place. They
   * render as pending / grayed and link to the classify page.
   * Defaults to true.
   */
  includeUnclassified?: boolean;
  search?: string; // description substring, case-insensitive
};

/**
 * Fetch the merged ledger. Everything is done in two queries + one
 * in-memory sort; keeps the query planner simple and lets us apply the
 * same filter set to both branches without a UNION view.
 */
export async function getExpenseLedger(
  filters: ExpenseLedgerFilters,
  limit = 2000,
): Promise<ExpenseLedgerRow[]> {
  const { year } = filters;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const monthPrefix =
    filters.month !== undefined && filters.month >= 1 && filters.month <= 12
      ? `${year}-${String(filters.month).padStart(2, "0")}`
      : null;

  // ---- Bank rows: direct_expense (+ optionally unclassified) ----
  // Splits are handled by a second query below because each split has its
  // own budget line / funding source. Parents-of-splits are excluded from
  // this branch (see `splitParentIds` below).
  const includeUnclassified = filters.includeUnclassified !== false;
  const classifications: Array<"direct_expense" | "unclassified"> = [];
  if (filters.sourceType === "unclassified") {
    classifications.push("unclassified");
  } else if (filters.sourceType === "split") {
    // splits only — skip the flat bank branch entirely
  } else {
    classifications.push("direct_expense");
    if (includeUnclassified && filters.sourceType !== "er") {
      classifications.push("unclassified");
    }
  }

  const bankClauses: SQL[] = [
    inArray(bankTransactions.classification, classifications.length ? classifications : ["direct_expense"]),
    sql`${bankTransactions.txnDate} >= ${yearStart}`,
    sql`${bankTransactions.txnDate} <= ${yearEnd}`,
    // Only debits — unclassified credits are grant receipts, not expenses.
    sql`${bankTransactions.debit} IS NOT NULL`,
  ];
  if (monthPrefix) {
    bankClauses.push(sql`${bankTransactions.txnDate} LIKE ${`${monthPrefix}%`}`);
  }
  if (filters.budgetLineId) {
    bankClauses.push(eq(bankTransactions.budgetLineId, filters.budgetLineId));
  }
  if (filters.fundingSourceId) {
    bankClauses.push(
      eq(bankTransactions.fundingSourceId, filters.fundingSourceId),
    );
  }
  if (filters.search) {
    bankClauses.push(
      sql`${bankTransactions.description} ILIKE ${`%${filters.search}%`}`,
    );
  }

  // Parents of splits are excluded from the flat branch: the split rows
  // supersede them so a $2000 debit split into 3 lines shows as 3 rows,
  // not 3 rows plus one $2000 aggregate.
  const parentsWithSplits = await db
    .selectDistinct({ id: bankTransactionSplits.bankTxnId })
    .from(bankTransactionSplits);
  const splitParentIds = new Set(parentsWithSplits.map((r) => r.id));

  const bankRows =
    filters.sourceType === "er" ||
    filters.sourceType === "split" ||
    classifications.length === 0
      ? []
      : await db
          .select({
            id: bankTransactions.id,
            classification: bankTransactions.classification,
            txnDate: bankTransactions.txnDate,
            description: bankTransactions.description,
            debit: bankTransactions.debit,
            budgetLineId: bankTransactions.budgetLineId,
            budgetLineCode: budgetLines.fullCode,
            budgetLineName: budgetLines.name,
            categoryId: budgetLines.categoryId,
            fundingSourceId: bankTransactions.fundingSourceId,
            fundingSourceName: fundingSources.name,
            accountName: bankAccounts.name,
          })
          .from(bankTransactions)
          .leftJoin(budgetLines, eq(budgetLines.id, bankTransactions.budgetLineId))
          .leftJoin(
            fundingSources,
            eq(fundingSources.id, bankTransactions.fundingSourceId),
          )
          .leftJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.accountId))
          .where(and(...bankClauses))
          .orderBy(desc(bankTransactions.txnDate));

  // ---- Split rows ----
  const splitClauses: SQL[] = [
    sql`${bankTransactions.txnDate} >= ${yearStart}`,
    sql`${bankTransactions.txnDate} <= ${yearEnd}`,
    eq(bankTransactions.classification, "direct_expense"),
  ];
  if (monthPrefix) {
    splitClauses.push(sql`${bankTransactions.txnDate} LIKE ${`${monthPrefix}%`}`);
  }
  if (filters.budgetLineId) {
    splitClauses.push(eq(bankTransactionSplits.budgetLineId, filters.budgetLineId));
  }
  if (filters.fundingSourceId) {
    splitClauses.push(
      eq(bankTransactionSplits.fundingSourceId, filters.fundingSourceId),
    );
  }
  if (filters.search) {
    splitClauses.push(
      or(
        sql`${bankTransactionSplits.description} ILIKE ${`%${filters.search}%`}`,
        sql`${bankTransactions.description} ILIKE ${`%${filters.search}%`}`,
      )!,
    );
  }

  const splitRows =
    filters.sourceType === "er" ||
    filters.sourceType === "manual" ||
    filters.sourceType === "unclassified"
      ? []
      : await db
          .select({
            splitId: bankTransactionSplits.id,
            txnId: bankTransactions.id,
            txnDate: bankTransactions.txnDate,
            parentDescription: bankTransactions.description,
            splitDescription: bankTransactionSplits.description,
            amount: bankTransactionSplits.amount,
            budgetLineId: bankTransactionSplits.budgetLineId,
            budgetLineCode: budgetLines.fullCode,
            budgetLineName: budgetLines.name,
            categoryId: budgetLines.categoryId,
            fundingSourceId: bankTransactionSplits.fundingSourceId,
            fundingSourceName: fundingSources.name,
            accountName: bankAccounts.name,
          })
          .from(bankTransactionSplits)
          .innerJoin(
            bankTransactions,
            eq(bankTransactions.id, bankTransactionSplits.bankTxnId),
          )
          .leftJoin(
            budgetLines,
            eq(budgetLines.id, bankTransactionSplits.budgetLineId),
          )
          .leftJoin(
            fundingSources,
            eq(fundingSources.id, bankTransactionSplits.fundingSourceId),
          )
          .leftJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.accountId))
          .where(and(...splitClauses));

  // ---- Paid ER lines ----
  const erClauses: SQL[] = [
    eq(expenseReports.status, "paid"),
    sql`${expenseReportLines.expenseDate} >= ${yearStart}`,
    sql`${expenseReportLines.expenseDate} <= ${yearEnd}`,
  ];
  if (monthPrefix) {
    erClauses.push(
      sql`${expenseReportLines.expenseDate} LIKE ${`${monthPrefix}%`}`,
    );
  }
  if (filters.budgetLineId) {
    erClauses.push(eq(expenseReportLines.budgetLineId, filters.budgetLineId));
  }
  if (filters.fundingSourceId) {
    erClauses.push(
      eq(expenseReportLines.fundingSourceId, filters.fundingSourceId),
    );
  }
  if (filters.search) {
    erClauses.push(
      sql`${expenseReportLines.description} ILIKE ${`%${filters.search}%`}`,
    );
  }

  const erRows =
    filters.sourceType === "bank"
      ? []
      : await db
          .select({
            id: expenseReportLines.id,
            reportId: expenseReports.id,
            reportNumber: expenseReports.reportNumber,
            submitterName: expenseReports.submitterName,
            expenseDate: expenseReportLines.expenseDate,
            description: expenseReportLines.description,
            cost: expenseReportLines.cost,
            budgetLineId: expenseReportLines.budgetLineId,
            budgetLineCode: budgetLines.fullCode,
            budgetLineName: budgetLines.name,
            categoryId: budgetLines.categoryId,
            fundingSourceId: expenseReportLines.fundingSourceId,
            fundingSourceName: fundingSources.name,
          })
          .from(expenseReportLines)
          .innerJoin(
            expenseReports,
            eq(expenseReports.id, expenseReportLines.reportId),
          )
          .leftJoin(budgetLines, eq(budgetLines.id, expenseReportLines.budgetLineId))
          .leftJoin(
            fundingSources,
            eq(fundingSources.id, expenseReportLines.fundingSourceId),
          )
          .where(and(...erClauses));

  // ---- Fetch category names in one shot (all branches join through budget_line) ----
  const categoryIds = Array.from(
    new Set(
      [...bankRows, ...splitRows, ...erRows]
        .map((r) => r.categoryId)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const catRows = categoryIds.length
    ? await db
        .select({
          id: budgetCategories.id,
          code: budgetCategories.code,
          name: budgetCategories.name,
        })
        .from(budgetCategories)
        .where(inArray(budgetCategories.id, categoryIds))
    : [];
  const catById = new Map(catRows.map((c) => [c.id, c]));

  // ---- Merge ----
  const merged: ExpenseLedgerRow[] = [
    // Bank + manual + unclassified all share the bank_transactions table.
    // We disambiguate by (a) whether it's the manual synthetic account,
    // (b) the classification field.
    ...bankRows
      // Drop parents-of-splits so the split rows can supersede them.
      .filter((r) => !splitParentIds.has(r.id))
      .map<ExpenseLedgerRow>((r) => {
        const cat = r.categoryId ? catById.get(r.categoryId) : null;
        const isManual = r.accountName === "Manual entries (pre-import)";
        const isUnclassified = r.classification === "unclassified";
        const kind: "unclassified" | "manual" | "bank" = isUnclassified
          ? "unclassified"
          : isManual
            ? "manual"
            : "bank";
        return {
          id: `${kind}_${r.id}`,
          date: r.txnDate,
          description: r.description,
          categoryCode: cat?.code ?? null,
          categoryName: cat?.name ?? null,
          budgetLineId: r.budgetLineId,
          budgetLineCode: r.budgetLineCode,
          budgetLineName: r.budgetLineName,
          fundingSourceId: r.fundingSourceId,
          fundingSourceName: r.fundingSourceName,
          cost: Number(r.debit ?? 0),
          pending: isUnclassified,
          source: {
            kind,
            txnId: r.id,
            accountName: r.accountName ?? null,
          },
        };
      })
      // Post-filter by source kind (SQL can't tell manual vs bank cheaply).
      .filter((r) => {
        if (filters.sourceType === "bank") return r.source.kind === "bank";
        if (filters.sourceType === "manual") return r.source.kind === "manual";
        if (filters.sourceType === "unclassified")
          return r.source.kind === "unclassified";
        return true;
      }),
    // Splits
    ...splitRows.map<ExpenseLedgerRow>((r) => {
      const cat = r.categoryId ? catById.get(r.categoryId) : null;
      const desc = r.splitDescription ?? r.parentDescription;
      return {
        id: `split_${r.splitId}`,
        date: r.txnDate,
        description: desc,
        categoryCode: cat?.code ?? null,
        categoryName: cat?.name ?? null,
        budgetLineId: r.budgetLineId,
        budgetLineCode: r.budgetLineCode,
        budgetLineName: r.budgetLineName,
        fundingSourceId: r.fundingSourceId,
        fundingSourceName: r.fundingSourceName,
        cost: Number(r.amount ?? 0),
        pending: false,
        source: {
          kind: "split",
          txnId: r.txnId,
          splitId: r.splitId,
          accountName: r.accountName ?? null,
        },
      };
    }),
    ...erRows.map<ExpenseLedgerRow>((r) => {
      const cat = r.categoryId ? catById.get(r.categoryId) : null;
      return {
        id: `er_${r.id}`,
        date: r.expenseDate,
        description: r.description,
        categoryCode: cat?.code ?? null,
        categoryName: cat?.name ?? null,
        budgetLineId: r.budgetLineId,
        budgetLineCode: r.budgetLineCode,
        budgetLineName: r.budgetLineName,
        fundingSourceId: r.fundingSourceId,
        fundingSourceName: r.fundingSourceName,
        cost: Number(r.cost ?? 0),
        pending: false,
        source: {
          kind: "er",
          reportId: r.reportId,
          reportNumber: r.reportNumber,
          submitterName: r.submitterName,
        },
      };
    }),
  ];

  // Post-filter on category code (needs the category join to be done first).
  const filtered = filters.categoryCode
    ? merged.filter((r) => r.categoryCode === filters.categoryCode)
    : merged;

  filtered.sort((a, b) => {
    if (a.date === b.date) return a.description.localeCompare(b.description);
    return a.date < b.date ? 1 : -1;
  });

  return filtered.slice(0, limit);
}

/** Sum of all rows returned by getExpenseLedger, cheap to compute client-side too. */
export function sumLedger(rows: ExpenseLedgerRow[]): number {
  return rows.reduce((s, r) => s + r.cost, 0);
}

/** Group into a monthly breakdown for the summary strip. */
export function groupByMonth(rows: ExpenseLedgerRow[]): Array<{
  month: string; // yyyy-mm
  total: number;
  count: number;
}> {
  const map = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    const bucket = map.get(key) ?? { total: 0, count: 0 };
    bucket.total += r.cost;
    bucket.count += 1;
    map.set(key, bucket);
  }
  return Array.from(map.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}

/** CSV serialisation mirroring the columns Ali's Excel "Expenses" sheet uses. */
export function toCsv(rows: ExpenseLedgerRow[]): string {
  const headers = [
    "Date",
    "Description",
    "Budget code",
    "Budget line",
    "Category",
    "Funding source",
    "Cost",
    "Source",
    "Source detail",
  ];
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) {
    const sourceLabel =
      r.source.kind === "er"
        ? `ER (${r.source.reportNumber})`
        : r.source.kind === "manual"
          ? "Manual"
          : r.source.kind === "unclassified"
            ? "Bank (unclassified)"
            : r.source.kind === "split"
              ? "Bank (split)"
              : "Bank";
    const sourceDetail =
      r.source.kind === "er"
        ? r.source.submitterName
        : r.source.accountName ?? "";
    lines.push(
      [
        r.date,
        r.description,
        r.budgetLineCode ?? "",
        r.budgetLineName ?? "",
        r.categoryName ?? "",
        r.fundingSourceName ?? "",
        r.cost.toFixed(2),
        sourceLabel,
        sourceDetail,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

function csvEscape(v: string): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
