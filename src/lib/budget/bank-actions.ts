"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  bankAccounts,
  bankImports,
  bankTransactions,
  bankTransactionSplits,
  budgetLines,
  expenseReports,
} from "@/lib/db/schema";
import { canEditBudget } from "@/lib/budget/people";
import { autoClassify } from "@/lib/budget/classify";
import { amountsFromPercents, normalizePayeeDescription, percentFromAmount } from "@/lib/budget/payee";
import {
  bankAccountInputSchema,
  bankClassificationInputSchema,
  bankTransactionSplitsFormSchema,
  manualEntryEditSchema,
  type BankTransactionSplitInput,
} from "@/lib/budget/schema";
import { createHash } from "node:crypto";
import { parseTdCsv, parsedPeriod } from "@/lib/budget/csv";

const MANUAL_ACCOUNT_NAME = "Manual entries (pre-import)";

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB — statement CSVs are tiny

export type ImportState = {
  ok: boolean;
  error?: string;
  imported?: {
    total: number;
    inserted: number;
    duplicates: number;
    autoTagged: number;
    account: string;
    periodFrom: string | null;
    periodTo: string | null;
    importId: string;
    year: number;
  };
};

/**
 * Import a TD account activity CSV.
 *
 * Idempotent: rows are keyed by `dedupe_hash` (sha256 of account + fields).
 * Re-uploading the same file (or an overlapping window) is safe — dupes are
 * counted and skipped, and no existing classification is overwritten.
 */
export async function importBankCsv(
  _prev: ImportState | undefined,
  formData: FormData,
): Promise<ImportState> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !canEditBudget(email)) {
    return { ok: false, error: "You don't have edit access to the budget." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pick a CSV file to import." };
  }
  if (file.size > MAX_CSV_BYTES) {
    return { ok: false, error: "File is larger than 5 MB — check that it's a statement CSV." };
  }

  // Resolve the target bank account.
  const rawAccountId = String(formData.get("accountId") ?? "").trim();
  const newAccountRaw = String(formData.get("newAccountName") ?? "").trim();
  let accountId = rawAccountId;

  if (!accountId) {
    if (!newAccountRaw) {
      return {
        ok: false,
        error: "Choose an existing account or name a new one.",
      };
    }
    const nameParsed = bankAccountInputSchema.safeParse({ name: newAccountRaw });
    if (!nameParsed.success) {
      return { ok: false, error: nameParsed.error.issues[0]?.message ?? "Bad account name." };
    }
    // Reuse a matching name if it already exists.
    const [existing] = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.name, nameParsed.data.name));
    if (existing) {
      accountId = existing.id;
    } else {
      const [created] = await db
        .insert(bankAccounts)
        .values({ name: nameParsed.data.name })
        .returning({ id: bankAccounts.id });
      accountId = created.id;
    }
  }

  // Parse.
  const text = await file.text();
  const parsed = parseTdCsv(text, accountId);
  if (!parsed.ok) {
    const where = parsed.lineNumber ? ` (line ${parsed.lineNumber})` : "";
    return { ok: false, error: `${parsed.error}${where}` };
  }
  if (parsed.rows.length === 0) {
    return { ok: false, error: "No rows found in the CSV." };
  }

  const period = parsedPeriod(parsed.rows);

  // Check which hashes are already in the DB so we get accurate insert/dupe counts.
  const hashes = parsed.rows.map((r) => r.dedupeHash);
  const existing = hashes.length
    ? await db
        .select({ h: bankTransactions.dedupeHash })
        .from(bankTransactions)
        .where(inArray(bankTransactions.dedupeHash, hashes))
    : [];
  const seen = new Set(existing.map((r) => r.h));

  const fresh = parsed.rows.filter((r) => !seen.has(r.dedupeHash));

  // Look up any budget lines referenced by auto-classification rules
  // (e.g. `005-1`), in one round trip.
  const wantedCodes = new Set<string>();
  const autoDecisions = fresh.map((r) => {
    const auto = autoClassify(r.description);
    if (auto?.budgetLineFullCode) wantedCodes.add(auto.budgetLineFullCode);
    return { row: r, auto };
  });
  const codeMap = new Map<string, string>();
  if (wantedCodes.size > 0) {
    const found = await db
      .select({ id: budgetLines.id, code: budgetLines.fullCode })
      .from(budgetLines)
      .where(inArray(budgetLines.fullCode, Array.from(wantedCodes)));
    for (const f of found) codeMap.set(f.code, f.id);
  }

  // Insert the import batch first so every txn can point at it.
  const [imp] = await db
    .insert(bankImports)
    .values({
      accountId,
      importedBy: email,
      filename: file.name || "upload.csv",
      rowCountTotal: parsed.rows.length,
      rowCountNew: fresh.length,
      rowCountDupe: parsed.rows.length - fresh.length,
      periodFrom: period.from,
      periodTo: period.to,
    })
    .returning({ id: bankImports.id });

  let autoTagged = 0;
  if (fresh.length > 0) {
    const values = autoDecisions.map(({ row, auto }) => {
      const budgetLineId =
        auto?.budgetLineFullCode ? codeMap.get(auto.budgetLineFullCode) ?? null : null;
      const classification = auto?.classification ?? "unclassified";
      if (auto && classification !== "unclassified") autoTagged++;
      return {
        accountId,
        importId: imp.id,
        txnDate: row.txnDate,
        description: row.description,
        debit: row.debit,
        credit: row.credit,
        runningBalance: row.runningBalance,
        dedupeHash: row.dedupeHash,
        classification,
        budgetLineId,
        classifiedBy: auto ? "auto" : null,
        classifiedAt: auto ? new Date() : null,
        note: auto ? `auto: ${auto.reason}` : null,
      };
    });
    await db.insert(bankTransactions).values(values);
    autoTagged += await applySiblingPayeeTemplates(imp.id);
  }

  // Best guess at the target year for the redirect: use the period's start.
  const year = period.from
    ? Number(period.from.slice(0, 4))
    : new Date().getUTCFullYear();

  const [{ name: accountName }] = await db
    .select({ name: bankAccounts.name })
    .from(bankAccounts)
    .where(eq(bankAccounts.id, accountId));

  revalidatePath(`/budget/${year}`);
  revalidatePath(`/budget/${year}/bank`);
  revalidatePath(`/budget/${year}/grants`);

  return {
    ok: true,
    imported: {
      total: parsed.rows.length,
      inserted: fresh.length,
      duplicates: parsed.rows.length - fresh.length,
      autoTagged,
      account: accountName,
      periodFrom: period.from,
      periodTo: period.to,
      importId: imp.id,
      year,
    },
  };
}

const BULK_SKIP = new Set(["er_reimbursement", "reversal"]);

function payeeKeyExpr() {
  return sql`regexp_replace(upper(trim(${bankTransactions.description})), '\\s+', ' ', 'g')`;
}

async function listSimilarTxnIds(
  txn: {
    description: string;
    debit: string | null;
    credit: string | null;
  },
  opts: { onlyUnclassified: boolean; excludeId: string },
): Promise<string[]> {
  const key = normalizePayeeDescription(txn.description);
  const isDebit = !!txn.debit;
  const clauses = [
    sql`${payeeKeyExpr()} = ${key}`,
    isDebit
      ? sql`${bankTransactions.debit} IS NOT NULL`
      : sql`${bankTransactions.credit} IS NOT NULL`,
    sql`${bankTransactions.id} <> ${opts.excludeId}`,
  ];
  if (opts.onlyUnclassified) {
    clauses.push(eq(bankTransactions.classification, "unclassified"));
  }
  const rows = await db
    .select({ id: bankTransactions.id })
    .from(bankTransactions)
    .where(and(...clauses));
  return rows.map((r) => r.id);
}

/**
 * For unclassified rows in this import, copy classification + budget line
 * + funding source + percentage splits from the most recently classified
 * sibling with the same payee key (e.g. every new `DT NETHRIS PAIE MSP`
 * inherits the last Nethris payroll tagging).
 */
async function applySiblingPayeeTemplates(importId: string): Promise<number> {
  const unclassified = await db
    .select({
      id: bankTransactions.id,
      description: bankTransactions.description,
      debit: bankTransactions.debit,
      credit: bankTransactions.credit,
    })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.importId, importId),
        eq(bankTransactions.classification, "unclassified"),
      ),
    );
  if (unclassified.length === 0) return 0;

  const templates = await db
    .select({
      id: bankTransactions.id,
      description: bankTransactions.description,
      debit: bankTransactions.debit,
      classification: bankTransactions.classification,
      budgetLineId: bankTransactions.budgetLineId,
      fundingSourceId: bankTransactions.fundingSourceId,
      classifiedAt: bankTransactions.classifiedAt,
    })
    .from(bankTransactions)
    .where(
      and(
        sql`${bankTransactions.classification} NOT IN ('unclassified', 'er_reimbursement', 'reversal')`,
      ),
    );

  type Template = (typeof templates)[number];
  const byKey = new Map<string, Template>();
  const sorted = templates
    .slice()
    .sort((a, b) => {
      const at = a.classifiedAt ? new Date(a.classifiedAt).getTime() : 0;
      const bt = b.classifiedAt ? new Date(b.classifiedAt).getTime() : 0;
      return bt - at;
    });
  for (const t of sorted) {
    const k = `${normalizePayeeDescription(t.description)}|${t.debit ? "d" : "c"}`;
    if (!byKey.has(k)) byKey.set(k, t);
  }
  if (byKey.size === 0) return 0;

  const templateIds = [...new Set([...byKey.values()].map((t) => t.id))];
  const allSplits = await db
    .select()
    .from(bankTransactionSplits)
    .where(inArray(bankTransactionSplits.bankTxnId, templateIds));
  const splitsByParent = new Map<string, typeof allSplits>();
  for (const s of allSplits) {
    const list = splitsByParent.get(s.bankTxnId) ?? [];
    list.push(s);
    splitsByParent.set(s.bankTxnId, list);
  }

  let tagged = 0;
  const now = new Date();
  for (const row of unclassified) {
    const k = `${normalizePayeeDescription(row.description)}|${row.debit ? "d" : "c"}`;
    const tmpl = byKey.get(k);
    if (!tmpl) continue;

    const parentSplits = (splitsByParent.get(tmpl.id) ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const tmplDebit = Number(tmpl.debit ?? 0);
    const rowDebit = Number(row.debit ?? 0);

    await db
      .update(bankTransactions)
      .set({
        classification: tmpl.classification,
        budgetLineId: parentSplits.length > 0 ? null : tmpl.budgetLineId,
        fundingSourceId: parentSplits.length > 0 ? null : tmpl.fundingSourceId,
        classifiedBy: "auto",
        classifiedAt: now,
        note: `auto: same as other ${normalizePayeeDescription(row.description)} rows`,
      })
      .where(eq(bankTransactions.id, row.id));

    if (parentSplits.length > 0 && tmplDebit > 0 && rowDebit > 0) {
      const percents = parentSplits.map((s) =>
        percentFromAmount(Number(s.amount), tmplDebit),
      );
      const amounts = amountsFromPercents(rowDebit, percents);
      await db.insert(bankTransactionSplits).values(
        parentSplits.map((s, i) => ({
          bankTxnId: row.id,
          budgetLineId: s.budgetLineId,
          fundingSourceId: s.fundingSourceId,
          amount: amounts[i]!.toFixed(2),
          description: s.description,
          sortOrder: i,
        })),
      );
    }
    tagged++;
  }
  return tagged;
}

// -------------------- Classify one transaction --------------------

export type ClassifyState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  appliedCount?: number;
};

export async function classifyBankTransaction(
  _prev: ClassifyState | undefined,
  formData: FormData,
): Promise<ClassifyState> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !canEditBudget(email)) {
    return { ok: false, error: "You don't have edit access to the budget." };
  }

  const parsed = bankClassificationInputSchema.safeParse({
    txnId: formData.get("txnId"),
    classification: formData.get("classification"),
    budgetLineId: nullable(formData.get("budgetLineId")),
    fundingSourceId: nullable(formData.get("fundingSourceId")),
    reversalOfTxnId: nullable(formData.get("reversalOfTxnId")),
    expenseReportId: nullable(formData.get("expenseReportId")),
    note: nullable(formData.get("note")),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".") || "form"] = issue.message;
    }
    return { ok: false, error: "Fix the highlighted fields.", fieldErrors };
  }
  const input = parsed.data;

  const [txn] = await db
    .select()
    .from(bankTransactions)
    .where(eq(bankTransactions.id, input.txnId));
  if (!txn) return { ok: false, error: "Transaction not found." };

  // Consistency checks — the schema-level FK ensures the id exists; here we
  // just sanity-check that direct-expense debits actually have a debit and
  // grant-receipt credits actually have a credit.
  if (input.classification === "direct_expense" && !txn.debit) {
    return {
      ok: false,
      error: "This isn't a debit — direct expenses only apply to outgoing money.",
    };
  }
  if (input.classification === "grant_receipt" && !txn.credit) {
    return {
      ok: false,
      error: "This isn't a credit — grant receipts only apply to incoming money.",
    };
  }
  if (input.classification === "reversal") {
    if (!txn.credit) {
      return {
        ok: false,
        error: "Reversal rows are credits (money-in) that undo an earlier debit.",
      };
    }
    if (input.reversalOfTxnId) {
      const [orig] = await db
        .select()
        .from(bankTransactions)
        .where(eq(bankTransactions.id, input.reversalOfTxnId));
      if (!orig) return { ok: false, error: "Original transfer not found." };
      if (orig.accountId !== txn.accountId) {
        return { ok: false, error: "Reversal must be on the same account as the original." };
      }
      if (Number(orig.debit ?? 0).toFixed(2) !== Number(txn.credit).toFixed(2)) {
        return {
          ok: false,
          error: `Amounts don't match: original was ${orig.debit}, this credit is ${txn.credit}.`,
        };
      }
    }
  }

  // ---------- ER reimbursement flow ----------
  //
  // Tagging a debit as `er_reimbursement` also flips the linked ER from
  // `approved` → `paid`. All of it happens in a transaction so the
  // reconciliation invariant (one dollar, one destination) is never violated
  // by a partial write.
  let paidReportYear: string | null = null;
  if (input.classification === "er_reimbursement") {
    if (!input.expenseReportId) {
      return {
        ok: false,
        error: "Pick an approved expense report to link.",
        fieldErrors: { expenseReportId: "Required." },
      };
    }
    const [er] = await db
      .select()
      .from(expenseReports)
      .where(eq(expenseReports.id, input.expenseReportId));
    if (!er) return { ok: false, error: "Expense report not found." };
    if (er.status !== "approved") {
      return {
        ok: false,
        error: `That report is ${er.status}, not approved — it can't be marked paid.`,
      };
    }
    if (Number(er.totalAmount).toFixed(2) !== Number(txn.debit ?? 0).toFixed(2)) {
      return {
        ok: false,
        error: `Amounts don't match: report total is ${er.totalAmount}, debit is ${txn.debit}. Fix the report or re-check the CSV row.`,
      };
    }
    paidReportYear = er.periodTo.slice(0, 4);
  }

  const year = Number(txn.txnDate.slice(0, 4));
  const now = new Date();

  await db.transaction(async (tx) => {
    // If this txn was previously linked to a different ER, unpin that ER
    // first so we don't leave orphan "paid" state.
    if (
      txn.expenseReportId &&
      txn.expenseReportId !== (input.expenseReportId ?? null)
    ) {
      await tx
        .update(expenseReports)
        .set({ status: "approved", paidAt: null, paidByBankTxnId: null })
        .where(eq(expenseReports.id, txn.expenseReportId));
    }

    await tx
      .update(bankTransactions)
      .set({
        classification: input.classification,
        // Clear tag fields not relevant to the new classification, then set
        // whatever this classification actually uses.
        budgetLineId:
          input.classification === "direct_expense" ? (input.budgetLineId ?? null) : null,
        fundingSourceId:
          input.classification === "grant_receipt" ||
          input.classification === "direct_expense"
            ? (input.fundingSourceId ?? null)
            : null,
        reversalOfTxnId:
          input.classification === "reversal" ? (input.reversalOfTxnId ?? null) : null,
        expenseReportId:
          input.classification === "er_reimbursement"
            ? (input.expenseReportId ?? null)
            : null,
        note: input.note ?? null,
        classifiedBy: email,
        classifiedAt: now,
      })
      .where(eq(bankTransactions.id, input.txnId));

    if (input.classification === "er_reimbursement" && input.expenseReportId) {
      await tx
        .update(expenseReports)
        .set({
          status: "paid",
          paidAt: now,
          paidByBankTxnId: input.txnId,
          updatedAt: now,
        })
        .where(eq(expenseReports.id, input.expenseReportId));
    }
  });

  revalidatePath(`/budget/${year}/bank`);
  revalidatePath(`/budget/${year}/bank/${input.txnId}`);
  revalidatePath(`/budget/${year}`);
  if (input.fundingSourceId) {
    revalidatePath(`/budget/${year}/grants/${input.fundingSourceId}`);
  }
  if (input.expenseReportId) {
    revalidatePath(`/budget/${paidReportYear ?? year}/reports`);
    revalidatePath(`/budget/${paidReportYear ?? year}/reports/${input.expenseReportId}`);
  }

  let appliedCount = 0;
  const applySimilar = formData.get("applySimilar") === "1";
  const overwriteSimilar = formData.get("overwriteSimilar") === "1";
  if (
    applySimilar &&
    !BULK_SKIP.has(input.classification)
  ) {
    appliedCount = await copyClassificationToSimilar({
      sourceId: input.txnId,
      description: txn.description,
      debit: txn.debit,
      credit: txn.credit,
      classification: input.classification,
      budgetLineId: input.budgetLineId ?? null,
      fundingSourceId: input.fundingSourceId ?? null,
      note: input.note ?? null,
      email,
      onlyUnclassified: !overwriteSimilar,
    });
    revalidatePath(`/budget/${year}/expenses`);
  }

  return { ok: true, appliedCount };
}

async function copyClassificationToSimilar(opts: {
  sourceId: string;
  description: string;
  debit: string | null;
  credit: string | null;
  classification: string;
  budgetLineId: string | null;
  fundingSourceId: string | null;
  note: string | null;
  email: string;
  onlyUnclassified: boolean;
}): Promise<number> {
  const ids = await listSimilarTxnIds(
    {
      description: opts.description,
      debit: opts.debit,
      credit: opts.credit,
    },
    { onlyUnclassified: opts.onlyUnclassified, excludeId: opts.sourceId },
  );
  if (ids.length === 0) return 0;
  const now = new Date();
  await db
    .update(bankTransactions)
    .set({
      classification: opts.classification,
      budgetLineId:
        opts.classification === "direct_expense" ? opts.budgetLineId : null,
      fundingSourceId:
        opts.classification === "grant_receipt" ||
        opts.classification === "direct_expense"
          ? opts.fundingSourceId
          : null,
      reversalOfTxnId: null,
      expenseReportId: null,
      note: opts.note,
      classifiedBy: opts.email,
      classifiedAt: now,
    })
    .where(inArray(bankTransactions.id, ids));
  return ids.length;
}

function nullable(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// -------------------- Bank transaction splits --------------------

export type SplitState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  appliedCount?: number;
};

/**
 * Replace the splits for a bank transaction. The form serialises splits
 * as a JSON array in `splits`. Passing an empty array clears splits and
 * lets the parent's own budget_line / funding_source govern the row again.
 *
 * Guarantees:
 *   - Sum(splits.amount) must equal the parent's debit within 1 cent.
 *   - Parent's own budgetLineId / fundingSourceId are nulled when splits
 *     are set (splits are the source of truth).
 *   - Only allowed on `direct_expense` rows.
 */
export async function saveBankSplits(
  _prev: SplitState | undefined,
  formData: FormData,
): Promise<SplitState> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !canEditBudget(email)) {
    return { ok: false, error: "You don't have edit access to the budget." };
  }

  let splitsJson: unknown;
  try {
    splitsJson = JSON.parse(String(formData.get("splits") ?? "[]"));
  } catch {
    return { ok: false, error: "Malformed splits payload." };
  }
  const parsed = bankTransactionSplitsFormSchema.safeParse({
    txnId: formData.get("txnId"),
    splits: splitsJson,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".") || "form"] = issue.message;
    }
    return { ok: false, error: "Fix the highlighted fields.", fieldErrors };
  }
  const { txnId, splits } = parsed.data;

  const [txn] = await db
    .select()
    .from(bankTransactions)
    .where(eq(bankTransactions.id, txnId));
  if (!txn) return { ok: false, error: "Transaction not found." };
  if (splits.length > 0 && !txn.debit) {
    return {
      ok: false,
      error: "Splits only apply to debit rows (money out).",
    };
  }
  if (
    splits.length > 0 &&
    txn.classification !== "direct_expense" &&
    txn.classification !== "unclassified"
  ) {
    return {
      ok: false,
      error: "Splits only make sense on direct-expense (or still-unclassified) rows.",
    };
  }

  if (splits.length > 0) {
    const total = splits.reduce((s, sp) => s + sp.amount, 0);
    const debit = Number(txn.debit);
    if (Math.abs(total - debit) > 0.01) {
      return {
        ok: false,
        error: `Sum of splits ($${total.toFixed(2)}) doesn't equal the debit ($${debit.toFixed(2)}). Adjust so they match.`,
      };
    }
  }

  const year = Number(txn.txnDate.slice(0, 4));

  await db.transaction(async (tx) => {
    // Wipe existing splits and re-insert. Simpler than diffing; splits
    // are cheap and this action is rare.
    await tx
      .delete(bankTransactionSplits)
      .where(eq(bankTransactionSplits.bankTxnId, txnId));

    if (splits.length > 0) {
      await tx.insert(bankTransactionSplits).values(
        splits.map((sp: BankTransactionSplitInput, i: number) => ({
          bankTxnId: txnId,
          budgetLineId: sp.budgetLineId,
          fundingSourceId: sp.fundingSourceId ?? null,
          amount: sp.amount.toFixed(2),
          description: sp.description ?? null,
          sortOrder: i,
        })),
      );
      // When splits govern the row, clear the parent's own tags so we
      // never double-count.
      await tx
        .update(bankTransactions)
        .set({
          classification: "direct_expense",
          budgetLineId: null,
          fundingSourceId: null,
          classifiedBy: email,
          classifiedAt: new Date(),
        })
        .where(eq(bankTransactions.id, txnId));
    }
  });

  revalidatePath(`/budget/${year}/bank`);
  revalidatePath(`/budget/${year}/bank/${txnId}`);
  revalidatePath(`/budget/${year}/expenses`);
  revalidatePath(`/budget/${year}`);

  let appliedCount = 0;
  const applySimilar = formData.get("applySimilar") === "1";
  const overwriteSimilar = formData.get("overwriteSimilar") === "1";
  if (applySimilar && splits.length > 0 && txn.debit) {
    appliedCount = await copySplitsToSimilar({
      sourceId: txnId,
      description: txn.description,
      debit: txn.debit,
      splits,
      email,
      overwrite: overwriteSimilar,
    });
  }

  return { ok: true, appliedCount };
}

async function copySplitsToSimilar(opts: {
  sourceId: string;
  description: string;
  debit: string;
  splits: BankTransactionSplitInput[];
  email: string;
  overwrite: boolean;
}): Promise<number> {
  const ids = await listSimilarTxnIds(
    { description: opts.description, debit: opts.debit, credit: null },
    { onlyUnclassified: false, excludeId: opts.sourceId },
  );
  if (ids.length === 0) return 0;

  const siblings = await db
    .select({
      id: bankTransactions.id,
      debit: bankTransactions.debit,
      classification: bankTransactions.classification,
    })
    .from(bankTransactions)
    .where(inArray(bankTransactions.id, ids));

  const existingSplitParents = new Set(
    (
      await db
        .select({ id: bankTransactionSplits.bankTxnId })
        .from(bankTransactionSplits)
        .where(inArray(bankTransactionSplits.bankTxnId, ids))
    ).map((r) => r.id),
  );

  const sourceDebit = Number(opts.debit);
  const percents = opts.splits.map((s) => percentFromAmount(s.amount, sourceDebit));
  const now = new Date();
  let count = 0;

  for (const sib of siblings) {
    if (!sib.debit) continue;
    if (
      sib.classification !== "unclassified" &&
      sib.classification !== "direct_expense"
    ) {
      continue;
    }
    if (!opts.overwrite && existingSplitParents.has(sib.id)) continue;

    const amounts = amountsFromPercents(Number(sib.debit), percents);
    await db.transaction(async (tx) => {
      await tx
        .delete(bankTransactionSplits)
        .where(eq(bankTransactionSplits.bankTxnId, sib.id));
      await tx.insert(bankTransactionSplits).values(
        opts.splits.map((sp, i) => ({
          bankTxnId: sib.id,
          budgetLineId: sp.budgetLineId,
          fundingSourceId: sp.fundingSourceId ?? null,
          amount: amounts[i]!.toFixed(2),
          description: sp.description ?? null,
          sortOrder: i,
        })),
      );
      await tx
        .update(bankTransactions)
        .set({
          classification: "direct_expense",
          budgetLineId: null,
          fundingSourceId: null,
          classifiedBy: opts.email,
          classifiedAt: now,
        })
        .where(eq(bankTransactions.id, sib.id));
    });
    count++;
  }
  return count;
}

/** Fetch the splits for a bank txn — used by the detail page to seed the form. */
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

// -------------------- Manual entry edit / delete --------------------

export type ManualEntryState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Recompute the dedupe hash the same way the CSV importer does. Not
 * strictly required for manual rows (they use `manual|row|…`) but keeping
 * a fresh unique hash prevents accidental collisions on edit.
 */
function manualHash(id: string, date: string, description: string, amount: string) {
  return createHash("sha256")
    .update(`manual-edit|${id}|${date}|${description}|${amount}`)
    .digest("hex");
}

/**
 * Update a manual-account bank txn. Refuses on any other account so the
 * TD audit trail can't be silently rewritten.
 */
export async function updateManualEntry(
  _prev: ManualEntryState | undefined,
  formData: FormData,
): Promise<ManualEntryState> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !canEditBudget(email)) {
    return { ok: false, error: "You don't have edit access to the budget." };
  }

  const parsed = manualEntryEditSchema.safeParse({
    id: formData.get("id"),
    txnDate: formData.get("txnDate"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    budgetLineId: nullable(formData.get("budgetLineId")),
    fundingSourceId: nullable(formData.get("fundingSourceId")),
    note: nullable(formData.get("note")),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".") || "form"] = issue.message;
    }
    return { ok: false, error: "Fix the highlighted fields.", fieldErrors };
  }
  const input = parsed.data;

  const [txn] = await db
    .select()
    .from(bankTransactions)
    .where(eq(bankTransactions.id, input.id));
  if (!txn) return { ok: false, error: "Entry not found." };

  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.id, txn.accountId));
  if (!account || account.name !== MANUAL_ACCOUNT_NAME) {
    return {
      ok: false,
      error:
        "This isn't a manual entry — real bank rows can't be edited (preserves the audit trail).",
    };
  }

  const amountStr = input.amount.toFixed(2);
  const year = Number(input.txnDate.slice(0, 4));

  await db
    .update(bankTransactions)
    .set({
      txnDate: input.txnDate,
      description: input.description,
      debit: amountStr,
      budgetLineId: input.budgetLineId ?? null,
      fundingSourceId: input.fundingSourceId ?? null,
      note: input.note ?? null,
      dedupeHash: manualHash(input.id, input.txnDate, input.description, amountStr),
      classifiedBy: email,
      classifiedAt: new Date(),
    })
    .where(eq(bankTransactions.id, input.id));

  revalidatePath(`/budget/${year}/bank`);
  revalidatePath(`/budget/${year}/bank/${input.id}`);
  revalidatePath(`/budget/${year}/expenses`);
  return { ok: true };
}

/**
 * Delete a manual-account bank txn. Refuses on any other account. Cascades
 * to any splits attached to it via the FK.
 */
export async function deleteManualEntry(
  _prev: ManualEntryState | undefined,
  formData: FormData,
): Promise<ManualEntryState> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !canEditBudget(email)) {
    return { ok: false, error: "You don't have edit access to the budget." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id." };

  const [txn] = await db
    .select()
    .from(bankTransactions)
    .where(eq(bankTransactions.id, id));
  if (!txn) return { ok: false, error: "Entry not found." };

  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.id, txn.accountId));
  if (!account || account.name !== MANUAL_ACCOUNT_NAME) {
    return {
      ok: false,
      error: "Only manual entries can be deleted from here.",
    };
  }

  const year = Number(txn.txnDate.slice(0, 4));
  await db.delete(bankTransactions).where(eq(bankTransactions.id, id));

  revalidatePath(`/budget/${year}/bank`);
  revalidatePath(`/budget/${year}/expenses`);
  return { ok: true };
}

