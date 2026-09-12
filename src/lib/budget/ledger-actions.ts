"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { canEditBudget } from "@/lib/budget/people";
import {
  bankTransactions,
  bankTransactionSplits,
  expenseReportLines,
  fundingSources,
} from "@/lib/db/schema";

export type UpdateFundingSourceState = {
  ok: boolean;
  error?: string;
};

/**
 * Inline "retag the funding source" action for a single row of the unified
 * Expenses ledger. Dispatches to the right underlying table based on which
 * kind of row it is — the ledger merges four different sources
 * (bank_transaction, bank_transaction_split, expense_report_line, and the
 * synthetic "manual entry" bank rows) into one table, so a single flat
 * update won't do.
 *
 * Unclassified bank debits aren't handled here — they need a full
 * classification first (budget line + everything else), so the UI routes
 * those to the existing classify page instead of this quick action.
 */
export async function updateExpenseFundingSource(
  _prev: UpdateFundingSourceState | undefined,
  formData: FormData,
): Promise<UpdateFundingSourceState> {
  const session = await auth();
  if (!canEditBudget(session?.user?.email)) {
    return { ok: false, error: "You don't have edit access to the budget." };
  }

  const kind = String(formData.get("kind") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim();
  const year = Number(formData.get("year") ?? "");
  const raw = String(formData.get("fundingSourceId") ?? "").trim();
  const fundingSourceId = raw === "" ? null : raw;

  if (!id || !kind) {
    return { ok: false, error: "Missing row reference." };
  }

  if (fundingSourceId) {
    const [fs] = await db
      .select({ id: fundingSources.id })
      .from(fundingSources)
      .where(eq(fundingSources.id, fundingSourceId));
    if (!fs) return { ok: false, error: "Funding source not found." };
  }

  switch (kind) {
    case "bank":
    case "manual": {
      await db
        .update(bankTransactions)
        .set({ fundingSourceId })
        .where(
          and(
            eq(bankTransactions.id, id),
            eq(bankTransactions.classification, "direct_expense"),
          ),
        );
      break;
    }
    case "split": {
      await db
        .update(bankTransactionSplits)
        .set({ fundingSourceId })
        .where(eq(bankTransactionSplits.id, id));
      break;
    }
    case "er": {
      await db
        .update(expenseReportLines)
        .set({ fundingSourceId })
        .where(eq(expenseReportLines.id, id));
      break;
    }
    default:
      return {
        ok: false,
        error: "This row needs to be classified before it can be tagged.",
      };
  }

  if (year) {
    revalidatePath(`/budget/${year}/expenses`);
    revalidatePath(`/budget/${year}/grants`);
  }
  return { ok: true };
}
