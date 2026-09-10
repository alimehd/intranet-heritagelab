import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  budgetFiscalYears,
  expenseReports,
  expenseReportLines,
  users,
  type ExpenseReport,
  type ExpenseReportLine,
  type ExpenseReportStatus,
} from "@/lib/db/schema";

// -------------------- Types --------------------

export type ExpenseReportWithMeta = ExpenseReport & {
  lineCount: number;
};

export type ExpenseReportDetail = {
  report: ExpenseReport;
  lines: ExpenseReportLine[];
};

export type ErFilters = {
  status?: ExpenseReportStatus | ExpenseReportStatus[];
  submitterUserId?: string;
  approverEmail?: string;
  fiscalYearId?: string;
  /** Include cancelled rows (default false). */
  includeCancelled?: boolean;
};

// -------------------- List / detail --------------------

export async function listExpenseReports(
  filters: ErFilters = {},
): Promise<ExpenseReportWithMeta[]> {
  const clauses: SQL[] = [];
  if (filters.fiscalYearId) {
    clauses.push(eq(expenseReports.fiscalYearId, filters.fiscalYearId));
  }
  if (filters.submitterUserId) {
    clauses.push(eq(expenseReports.submitterUserId, filters.submitterUserId));
  }
  if (filters.approverEmail) {
    clauses.push(eq(expenseReports.approverEmail, filters.approverEmail.toLowerCase()));
  }
  if (filters.status) {
    const list = Array.isArray(filters.status) ? filters.status : [filters.status];
    if (list.length === 1) clauses.push(eq(expenseReports.status, list[0]));
    else if (list.length > 1) clauses.push(inArray(expenseReports.status, list));
  } else if (!filters.includeCancelled) {
    clauses.push(ne(expenseReports.status, "cancelled"));
  }

  return db
    .select({
      id: expenseReports.id,
      reportNumber: expenseReports.reportNumber,
      fiscalYearId: expenseReports.fiscalYearId,
      submitterUserId: expenseReports.submitterUserId,
      submitterName: expenseReports.submitterName,
      submitterEmail: expenseReports.submitterEmail,
      approverEmail: expenseReports.approverEmail,
      title: expenseReports.title,
      periodFrom: expenseReports.periodFrom,
      periodTo: expenseReports.periodTo,
      businessPurpose: expenseReports.businessPurpose,
      totalAmount: expenseReports.totalAmount,
      status: expenseReports.status,
      submittedAt: expenseReports.submittedAt,
      decidedAt: expenseReports.decidedAt,
      decidedBy: expenseReports.decidedBy,
      decisionNote: expenseReports.decisionNote,
      paidAt: expenseReports.paidAt,
      paidByBankTxnId: expenseReports.paidByBankTxnId,
      cancelledAt: expenseReports.cancelledAt,
      cancelledBy: expenseReports.cancelledBy,
      cancelReason: expenseReports.cancelReason,
      submitEmailMessageId: expenseReports.submitEmailMessageId,
      submitEmailError: expenseReports.submitEmailError,
      decisionEmailMessageId: expenseReports.decisionEmailMessageId,
      decisionEmailError: expenseReports.decisionEmailError,
      createdAt: expenseReports.createdAt,
      updatedAt: expenseReports.updatedAt,
      lineCount: sql<number>`(
        SELECT COUNT(*)::int FROM expense_report_line l WHERE l.report_id = ${expenseReports.id}
      )`,
    })
    .from(expenseReports)
    .where(clauses.length > 0 ? and(...clauses) : undefined)
    .orderBy(desc(expenseReports.createdAt))
    .limit(500);
}

export async function getExpenseReportById(
  id: string,
): Promise<ExpenseReportDetail | null> {
  const [report] = await db
    .select()
    .from(expenseReports)
    .where(eq(expenseReports.id, id));
  if (!report) return null;
  const lines = await db
    .select()
    .from(expenseReportLines)
    .where(eq(expenseReportLines.reportId, id))
    .orderBy(asc(expenseReportLines.sortOrder), asc(expenseReportLines.expenseDate));
  return { report, lines };
}

export async function getExpenseReportByNumber(
  reportNumber: string,
): Promise<ExpenseReport | null> {
  const [row] = await db
    .select()
    .from(expenseReports)
    .where(eq(expenseReports.reportNumber, reportNumber));
  return row ?? null;
}

/**
 * Reports awaiting a given approver's decision. Used to render the pending
 * pill on the overview and to power the approver's inbox on the list page.
 */
export async function listPendingApprovals(
  approverEmail: string,
): Promise<ExpenseReportWithMeta[]> {
  return listExpenseReports({
    approverEmail,
    status: "submitted",
  });
}

export async function countPendingApprovals(
  approverEmail: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(expenseReports)
    .where(
      and(
        eq(expenseReports.approverEmail, approverEmail.toLowerCase()),
        eq(expenseReports.status, "submitted"),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Approved-but-unpaid reports for a fiscal year — the pool the bank-classify
 * form draws from when Ali tags a reimbursement debit.
 */
export async function listUnpaidApprovedReports(
  fiscalYearId?: string,
): Promise<ExpenseReport[]> {
  const clauses: SQL[] = [eq(expenseReports.status, "approved")];
  if (fiscalYearId) clauses.push(eq(expenseReports.fiscalYearId, fiscalYearId));
  return db
    .select()
    .from(expenseReports)
    .where(and(...clauses))
    .orderBy(desc(expenseReports.submittedAt));
}

// -------------------- Spend rollups (Phase 4 → budget grid) --------------------

/**
 * Total spent per budget line for a fiscal year, from BOTH direct bank
 * expenses (classification=direct_expense) and paid ER lines. The two
 * sources never overlap: the bank-txn that reimburses an ER is classified
 * as `er_reimbursement`, so its debit does not count against a line — only
 * the ER's line items do.
 */
export async function getBudgetLineSpentMap(
  fiscalYearId: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // 1. Direct bank debits tagged to a budget line, filtered to txns whose
  //    date falls in the fiscal year that owns this line.
  const [{ year: fyYear } = { year: undefined }] = await db
    .select({ year: budgetFiscalYears.year })
    .from(budgetFiscalYears)
    .where(eq(budgetFiscalYears.id, fiscalYearId));
  if (fyYear !== undefined) {
    const yearStart = `${fyYear}-01-01`;
    const yearEnd = `${fyYear}-12-31`;
    // Direct bank debits — but only rows WITHOUT splits (splits govern).
    const directRows = await db.execute(sql`
      SELECT budget_line_id, COALESCE(SUM(debit), 0)::text AS total
      FROM bank_transaction bt
      WHERE classification = 'direct_expense'
        AND budget_line_id IS NOT NULL
        AND txn_date >= ${yearStart}
        AND txn_date <= ${yearEnd}
        AND NOT EXISTS (
          SELECT 1 FROM bank_transaction_split s WHERE s.bank_txn_id = bt.id
        )
      GROUP BY budget_line_id
    `);
    const directList = extractRows<{ budget_line_id: string; total: string }>(
      directRows,
    );
    for (const r of directList) {
      result.set(
        r.budget_line_id,
        (result.get(r.budget_line_id) ?? 0) + Number(r.total),
      );
    }

    // Split allocations (per-line amounts) for txns in this fiscal year.
    const splitRows = await db.execute(sql`
      SELECT s.budget_line_id, COALESCE(SUM(s.amount), 0)::text AS total
      FROM bank_transaction_split s
      JOIN bank_transaction bt ON bt.id = s.bank_txn_id
      WHERE bt.classification = 'direct_expense'
        AND bt.txn_date >= ${yearStart}
        AND bt.txn_date <= ${yearEnd}
      GROUP BY s.budget_line_id
    `);
    const splitList = extractRows<{ budget_line_id: string; total: string }>(
      splitRows,
    );
    for (const r of splitList) {
      result.set(
        r.budget_line_id,
        (result.get(r.budget_line_id) ?? 0) + Number(r.total),
      );
    }
  }

  // 2. Paid ER lines for this fiscal year.
  const erRows = await db
    .select({
      budgetLineId: expenseReportLines.budgetLineId,
      total: sql<string>`COALESCE(SUM(${expenseReportLines.cost}), 0)`,
    })
    .from(expenseReportLines)
    .innerJoin(expenseReports, eq(expenseReports.id, expenseReportLines.reportId))
    .where(
      and(
        eq(expenseReports.fiscalYearId, fiscalYearId),
        eq(expenseReports.status, "paid"),
      ),
    )
    .groupBy(expenseReportLines.budgetLineId);

  for (const r of erRows) {
    result.set(r.budgetLineId, (result.get(r.budgetLineId) ?? 0) + Number(r.total));
  }
  return result;
}

/**
 * Spent-to-date for a single funding source, combining direct bank debits
 * tagged to the source with paid ER lines tagged to the source. Same
 * non-overlap invariant as above.
 */
export async function getFundingSourceSpentTotal(
  fundingSourceId: string,
): Promise<number> {
  const directRes = await db.execute(sql`
    SELECT COALESCE(SUM(debit), 0)::text AS total
    FROM bank_transaction
    WHERE classification = 'direct_expense'
      AND funding_source_id = ${fundingSourceId}
  `);
  const [direct] = extractRows<{ total: string }>(directRes);

  const [er] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${expenseReportLines.cost}), 0)`,
    })
    .from(expenseReportLines)
    .innerJoin(expenseReports, eq(expenseReports.id, expenseReportLines.reportId))
    .where(
      and(
        eq(expenseReportLines.fundingSourceId, fundingSourceId),
        eq(expenseReports.status, "paid"),
      ),
    );

  return Number(direct?.total ?? 0) + Number(er?.total ?? 0);
}

// -------------------- Report number allocation --------------------

/**
 * Return the next ER-NNNN identifier. Starts at ER-0021 to continue Ali's
 * existing spreadsheet series. Uses SUBSTRING to parse the numeric tail off
 * the existing rows so importing legacy identifiers (ER-0020, ER-0019…)
 * stays consistent.
 *
 * NOT concurrency-safe on its own — pair with the UNIQUE constraint on
 * report_number and let the caller retry on collision.
 */
export async function allocateNextReportNumber(): Promise<string> {
  const res = await db.execute(sql`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(report_number, '\\D', '', 'g'), '')::int), 20) AS max
    FROM expense_report
  `);
  const [row] = extractRows<{ max: number | string | null }>(res);
  const nextNum = Number(row?.max ?? 20) + 1;
  return `ER-${String(nextNum).padStart(4, "0")}`;
}

// -------------------- User lookups --------------------

export async function getSubmitterUser(userId: string) {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row ?? null;
}

// -------------------- Helpers --------------------

function extractRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === "object" && "rows" in res) {
    return (res as { rows: T[] }).rows;
  }
  return [];
}

// Also re-export a couple of things so consumers only need one import.
export { or };
