import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  jsonb,
  integer,
  boolean,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ---------- NextAuth tables (Drizzle adapter) ----------
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ---------- Travel claims ----------
export const travelClaims = pgTable("travel_claim", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Snapshot of submitter info at time of submission
  submitterName: text("submitter_name").notNull(),
  submitterEmail: text("submitter_email").notNull(),
  purpose: text("purpose").notNull(),
  travelType: text("travel_type").notNull(),
  startDate: text("start_date").notNull(), // ISO yyyy-mm-dd
  endDate: text("end_date").notNull(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  // Full structured claim data (line items, meals, etc.)
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("submitted"), // submitted | emailed | failed | cancelled
  emailMessageId: text("email_message_id"),
  emailError: text("email_error"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: text("cancelled_by"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type TravelClaim = typeof travelClaims.$inferSelect;
export type NewTravelClaim = typeof travelClaims.$inferInsert;

// ---------- Leave (vacation / sick days) ----------
export const leaveRequests = pgTable(
  "leave_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Canonical employee address: aliases are resolved before insert so one
     * person always draws down a single balance.
     */
    employeeEmail: text("employee_email").notNull(),
    employeeName: text("employee_name").notNull(),
    leaveType: text("leave_type").notNull(), // vacation | sick
    startDate: text("start_date").notNull(), // ISO yyyy-mm-dd
    endDate: text("end_date").notNull(),
    halfDay: boolean("half_day").notNull().default(false),
    /** Chargeable working days, excluding weekends and paid holidays. */
    dayCount: numeric("day_count", { precision: 4, scale: 1 }).notNull(),
    /** Calendar year the entitlement is drawn from. */
    leaveYear: integer("leave_year").notNull(),
    reason: text("reason"),
    // pending | approved | declined | recorded | cancelled
    status: text("status").notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by"),
    decisionNote: text("decision_note"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),
    emailMessageId: text("email_message_id"),
    emailError: text("email_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Balance lookups are always scoped to one employee and year.
    index("leave_request_employee_year_idx").on(t.employeeEmail, t.leaveYear),
  ],
);

export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type NewLeaveRequest = typeof leaveRequests.$inferInsert;

// ---------- Budget (Phase 1: fiscal year + categories + lines) ----------
// See docs/budget-module-plan.md for the full data model.

export const budgetFiscalYears = pgTable("budget_fiscal_year", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Calendar year (fiscal = calendar for Heritage Lab). Unique per row. */
  year: integer("year").notNull().unique(),
  /**
   * Opening cash balance on Jan 1 across all bank accounts. Nullable because
   * this can be filled in later once the bank ledger lands (Phase 3) — Ali
   * has two TD accounts and may not know the number up front.
   */
  openingBalance: numeric("opening_balance", { precision: 12, scale: 2 }),
  /** Locks the year against edits once reported to funders (used later). */
  isLocked: boolean("is_locked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const budgetCategories = pgTable(
  "budget_category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fiscalYearId: uuid("fiscal_year_id")
      .notNull()
      .references(() => budgetFiscalYears.id, { onDelete: "cascade" }),
    /** Zero-padded, e.g. "001", "002", …, "006". */
    code: text("code").notNull(),
    /** Display name, e.g. "Development". */
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("budget_category_year_code_uq").on(t.fiscalYearId, t.code),
    index("budget_category_year_sort_idx").on(t.fiscalYearId, t.sortOrder),
  ],
);

export const budgetLines = pgTable(
  "budget_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => budgetCategories.id, { onDelete: "cascade" }),
    /** Sub-code within category, e.g. "1", "2", …, "11". */
    code: text("code").notNull(),
    /**
     * Denormalised "001-4"-style code. Kept in sync at insert time; used for
     * search and for tagging bank txns / expense report lines by string.
     */
    fullCode: text("full_code").notNull(),
    /** Display name, e.g. "Project Management". */
    name: text("name").notNull(),
    /**
     * 12 projected amounts, one per calendar month (Jan..Dec). Stored as a
     * numeric array; Postgres and Drizzle both handle SUM() across elements.
     * Sum-to-annual is computed at query time — one source of truth.
     */
    monthlyProjected: numeric("monthly_projected", { precision: 12, scale: 2 })
      .array()
      .notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("budget_line_category_code_uq").on(t.categoryId, t.code),
    index("budget_line_full_code_idx").on(t.fullCode),
    index("budget_line_category_sort_idx").on(t.categoryId, t.sortOrder),
  ],
);

export type BudgetFiscalYear = typeof budgetFiscalYears.$inferSelect;
export type NewBudgetFiscalYear = typeof budgetFiscalYears.$inferInsert;
export type BudgetCategory = typeof budgetCategories.$inferSelect;
export type NewBudgetCategory = typeof budgetCategories.$inferInsert;
export type BudgetLine = typeof budgetLines.$inferSelect;
export type NewBudgetLine = typeof budgetLines.$inferInsert;

// ---------- Budget: Phase 2 — funding sources (grants, contracts, donations) ----------

export const FUNDING_SOURCE_KINDS = [
  "grant",
  "service_contract",
  "donation",
  "other",
] as const;
export type FundingSourceKind = (typeof FUNDING_SOURCE_KINDS)[number];

export const FUNDING_SOURCE_STATUSES = [
  "active",
  "completed",
  "cancelled",
] as const;
export type FundingSourceStatus = (typeof FUNDING_SOURCE_STATUSES)[number];

export const fundingSources = pgTable(
  "funding_source",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fiscalYearId: uuid("fiscal_year_id")
      .notNull()
      .references(() => budgetFiscalYears.id, { onDelete: "cascade" }),
    /** Human name, e.g. "Kativik Ilisarniliriniq" or "ESUMA-AYAGUTA". */
    name: text("name").notNull(),
    kind: text("kind").notNull().default("grant"), // FUNDING_SOURCE_KINDS
    /** Total contract value for the year — may exceed the sum of monthly_expected if some tranches aren't scheduled. */
    contractValue: numeric("contract_value", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /**
     * Projected receipt schedule — 12 amounts, one per month (Jan..Dec). Zero
     * on months when nothing is expected. Sum-to-annual is derived.
     */
    monthlyExpected: numeric("monthly_expected", { precision: 12, scale: 2 })
      .array()
      .notNull(),
    /**
     * Category codes ("001", "003", …) this grant is permitted to fund. Empty
     * array means "unrestricted." Used to warn (not block) when an expense is
     * tagged with a funding source whose restrictions don't cover the category.
     */
    allowedCategoryCodes: text("allowed_category_codes").array().notNull().default([]),
    status: text("status").notNull().default("active"), // FUNDING_SOURCE_STATUSES
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("funding_source_year_name_uq").on(t.fiscalYearId, t.name),
    index("funding_source_year_sort_idx").on(t.fiscalYearId, t.sortOrder),
  ],
);

export type FundingSource = typeof fundingSources.$inferSelect;
export type NewFundingSource = typeof fundingSources.$inferInsert;

// ---------- Budget: Phase 3 — bank ledger (multi-account) ----------

export const bankAccounts = pgTable("bank_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Human-facing name, e.g. "TD Business Chequing 1234". Unique. */
  name: text("name").notNull().unique(),
  currency: text("currency").notNull().default("CAD"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type BankAccount = typeof bankAccounts.$inferSelect;
export type NewBankAccount = typeof bankAccounts.$inferInsert;

export const bankImports = pgTable(
  "bank_import",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    importedBy: text("imported_by").notNull(),
    filename: text("filename").notNull(),
    rowCountTotal: integer("row_count_total").notNull().default(0),
    rowCountNew: integer("row_count_new").notNull().default(0),
    rowCountDupe: integer("row_count_dupe").notNull().default(0),
    periodFrom: text("period_from"), // ISO date; nullable if the file was empty
    periodTo: text("period_to"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("bank_import_account_idx").on(t.accountId),
    index("bank_import_created_idx").on(t.createdAt),
  ],
);

export type BankImport = typeof bankImports.$inferSelect;
export type NewBankImport = typeof bankImports.$inferInsert;

export const BANK_TXN_CLASSIFICATIONS = [
  "unclassified",
  "direct_expense",
  "er_reimbursement",
  "grant_receipt",
  "fee",
  "transfer_fee",
  "reversal",
  "internal_transfer",
  "ignore",
] as const;
export type BankTxnClassification = (typeof BANK_TXN_CLASSIFICATIONS)[number];

export const bankTransactions = pgTable(
  "bank_transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    /** The import batch this row came from. Nulled if the batch is deleted. */
    importId: uuid("import_id").references(() => bankImports.id, {
      onDelete: "set null",
    }),
    /** ISO yyyy-mm-dd. TD posts local business day, no time component. */
    txnDate: text("txn_date").notNull(),
    /** Raw TD description, unmodified for audit. */
    description: text("description").notNull(),
    /** Money out (positive) or null. */
    debit: numeric("debit", { precision: 12, scale: 2 }),
    /** Money in (positive) or null. */
    credit: numeric("credit", { precision: 12, scale: 2 }),
    /** Running account balance after this txn, as reported by TD. */
    runningBalance: numeric("running_balance", { precision: 12, scale: 2 }),
    /**
     * sha256(account_id + txn_date + description + debit + credit + balance).
     * Enforces idempotent re-imports of overlapping periods.
     */
    dedupeHash: text("dedupe_hash").notNull().unique(),
    classification: text("classification").notNull().default("unclassified"),
    // Fine-grained tags — populated per classification (see BANK_TXN_CLASSIFICATIONS).
    budgetLineId: uuid("budget_line_id").references(() => budgetLines.id, {
      onDelete: "set null",
    }),
    fundingSourceId: uuid("funding_source_id").references(
      () => fundingSources.id,
      { onDelete: "set null" },
    ),
    /**
     * Points to expense_report.id (added in Phase 4). Kept as a raw uuid
     * without a FK for now so this schema can ship ahead of Phase 4; the
     * constraint gets added when the ER tables land.
     */
    expenseReportId: uuid("expense_report_id"),
    /** Set on a `reversal` row to point at the original transfer it cancels. */
    reversalOfTxnId: uuid("reversal_of_txn_id"),
    note: text("note"),
    classifiedBy: text("classified_by"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("bank_txn_account_date_idx").on(t.accountId, t.txnDate),
    index("bank_txn_classification_idx").on(t.classification),
    index("bank_txn_date_idx").on(t.txnDate),
    index("bank_txn_budget_line_idx").on(t.budgetLineId),
    index("bank_txn_funding_source_idx").on(t.fundingSourceId),
    index("bank_txn_reversal_of_idx").on(t.reversalOfTxnId),
  ],
);

export type BankTransaction = typeof bankTransactions.$inferSelect;
export type NewBankTransaction = typeof bankTransactions.$inferInsert;

// ---------- Budget: Phase 4 — expense reports ----------
//
// One report per submission cycle (typically monthly). A report bundles many
// line items — each tagged to a budget line and (optionally) a funding source
// — that reimburse the submitter in a single bank payment. Report_number is
// a human-facing sequential ID (ER-0021, ER-0022, …) that continues Ali's
// existing spreadsheet series.

export const EXPENSE_REPORT_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "paid",
  "cancelled",
] as const;
export type ExpenseReportStatus = (typeof EXPENSE_REPORT_STATUSES)[number];

export const expenseReports = pgTable(
  "expense_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Sequential human-facing ID, e.g. "ER-0021". Unique globally. */
    reportNumber: text("report_number").notNull().unique(),
    fiscalYearId: uuid("fiscal_year_id")
      .notNull()
      .references(() => budgetFiscalYears.id, { onDelete: "restrict" }),
    /** Auth user_id of the submitter (Ali today). */
    submitterUserId: text("submitter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Snapshot at submit time so renames/reassignments don't rewrite history. */
    submitterName: text("submitter_name").notNull(),
    submitterEmail: text("submitter_email").notNull(),
    /** Snapshot of the intended approver (Elias today). */
    approverEmail: text("approver_email").notNull(),
    /** Short label for the report, e.g. "August 2026 Expenses". */
    title: text("title").notNull(),
    /** Period covered, ISO yyyy-mm-dd. Used for filtering + fiscal-year checks. */
    periodFrom: text("period_from").notNull(),
    periodTo: text("period_to").notNull(),
    businessPurpose: text("business_purpose"),
    /** Denormalised sum of line costs — recomputed on every save. */
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    status: text("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by"),
    decisionNote: text("decision_note"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Bank transaction that reimbursed the report. */
    paidByBankTxnId: uuid("paid_by_bank_txn_id").references(
      () => bankTransactions.id,
      { onDelete: "set null" },
    ),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),
    submitEmailMessageId: text("submit_email_message_id"),
    submitEmailError: text("submit_email_error"),
    decisionEmailMessageId: text("decision_email_message_id"),
    decisionEmailError: text("decision_email_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("expense_report_year_idx").on(t.fiscalYearId),
    index("expense_report_status_idx").on(t.status),
    index("expense_report_submitter_idx").on(t.submitterUserId),
    index("expense_report_approver_idx").on(t.approverEmail),
    index("expense_report_paid_bank_idx").on(t.paidByBankTxnId),
  ],
);

export type ExpenseReport = typeof expenseReports.$inferSelect;
export type NewExpenseReport = typeof expenseReports.$inferInsert;

export const expenseReportLines = pgTable(
  "expense_report_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => expenseReports.id, { onDelete: "cascade" }),
    /** Order within the report as entered. */
    sortOrder: integer("sort_order").notNull().default(0),
    /** ISO yyyy-mm-dd of the expense itself (not the report). */
    expenseDate: text("expense_date").notNull(),
    description: text("description").notNull(),
    /** Budget line this expense charges against. Restricted, not set-null, so
     * we can't lose the audit trail. */
    budgetLineId: uuid("budget_line_id")
      .notNull()
      .references(() => budgetLines.id, { onDelete: "restrict" }),
    /**
     * Snapshot of budget_line.full_code at line entry time so historical
     * reports keep their coding even if a line is renamed or reorganised.
     */
    budgetLineCode: text("budget_line_code").notNull(),
    /** Optional funding source — usually left blank; grant coverage is normally computed. */
    fundingSourceId: uuid("funding_source_id").references(
      () => fundingSources.id,
      { onDelete: "set null" },
    ),
    cost: numeric("cost", { precision: 12, scale: 2 }).notNull(),
    /**
     * Vercel Blob URL for the receipt, if attached and Blob is configured.
     * Nullable — the ER is still valid without a receipt (Ali may attach later).
     */
    receiptUrl: text("receipt_url"),
    receiptFilename: text("receipt_filename"),
    receiptContentType: text("receipt_content_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("expense_report_line_report_idx").on(t.reportId, t.sortOrder),
    index("expense_report_line_budget_line_idx").on(t.budgetLineId),
    index("expense_report_line_funding_source_idx").on(t.fundingSourceId),
    index("expense_report_line_date_idx").on(t.expenseDate),
  ],
);

export type ExpenseReportLine = typeof expenseReportLines.$inferSelect;
export type NewExpenseReportLine = typeof expenseReportLines.$inferInsert;
