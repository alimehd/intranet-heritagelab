"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  bankAccounts,
  bankImports,
  bankTransactions,
  budgetLines,
  expenseReports,
} from "@/lib/db/schema";
import { canEditBudget } from "@/lib/budget/people";
import { autoClassify } from "@/lib/budget/classify";
import {
  bankAccountInputSchema,
  bankClassificationInputSchema,
} from "@/lib/budget/schema";
import { parseTdCsv, parsedPeriod } from "@/lib/budget/csv";

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

// -------------------- Classify one transaction --------------------

export type ClassifyState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
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
  return { ok: true };
}

function nullable(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
