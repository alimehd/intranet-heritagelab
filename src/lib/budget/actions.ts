"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  bankTransactions,
  bankTransactionSplits,
  budgetFiscalYears,
  expenseReportLines,
  fundingSources,
  type FundingSourceKind,
  type FundingSourceStatus,
} from "@/lib/db/schema";
import { canEditBudget } from "@/lib/budget/people";
import {
  openingBalanceInputSchema,
  parseFundingSourceForm,
} from "@/lib/budget/schema";

export type ActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

async function requireAdmin(): Promise<{ email: string } | ActionState> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { ok: false, error: "Not signed in." };
  if (!canEditBudget(email)) {
    return { ok: false, error: "You don't have edit access to the budget." };
  }
  return { email };
}

// -------------------- Funding sources --------------------

/**
 * Create or update a funding source. If `id` is present in the form, treat
 * it as an edit; otherwise create a new row under the fiscal year identified
 * by `fiscalYearId`.
 */
export async function upsertFundingSource(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const guard = await requireAdmin();
  if ("ok" in guard) return guard;

  const parsed = parseFundingSourceForm(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".") || "form"] = issue.message;
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const input = parsed.data;
  const monthlyStrings = input.monthlyExpected.map((v) => v.toFixed(2));
  const contractValueStr = input.contractValue.toFixed(2);

  const id = String(formData.get("id") ?? "").trim();
  const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
  const year = Number(formData.get("year") ?? "");

  if (id) {
    // Edit
    const [existing] = await db
      .select()
      .from(fundingSources)
      .where(eq(fundingSources.id, id));
    if (!existing) return { ok: false, error: "Funding source not found." };

    await db
      .update(fundingSources)
      .set({
        name: input.name,
        kind: input.kind as FundingSourceKind,
        contractValue: contractValueStr,
        monthlyExpected: monthlyStrings,
        // Write the modern column and keep the legacy text[] column in sync
        // so nothing that still reads it breaks mid-migration.
        categoryCaps: input.categoryCaps,
        allowedCategoryCodes: input.categoryCaps.map((c) => c.code),
        status: input.status as FundingSourceStatus,
        notes: input.notes ?? null,
        // Multi-year contract fields — empty string / null both mean "not set"
        contractStartDate:
          input.contractStartDate && input.contractStartDate !== ""
            ? input.contractStartDate
            : null,
        contractEndDate:
          input.contractEndDate && input.contractEndDate !== ""
            ? input.contractEndDate
            : null,
        contractTotalValue:
          input.contractTotalValue == null || input.contractTotalValue === ""
            ? null
            : Number(input.contractTotalValue).toFixed(2),
        yearlyAllocations: input.yearlyAllocations,
      })
      .where(eq(fundingSources.id, id));

    revalidatePath(`/budget/${year || ""}/grants`);
    revalidatePath(`/budget/${year || ""}/grants/${id}`);
    revalidatePath(`/budget/${year || ""}/budget`);
    revalidatePath(`/budget/${year || ""}`);
    redirect(`/budget/${year}/grants/${id}?updated=1`);
  } else {
    if (!fiscalYearId) {
      return { ok: false, error: "Missing fiscal year reference." };
    }
    const [fy] = await db
      .select()
      .from(budgetFiscalYears)
      .where(eq(budgetFiscalYears.id, fiscalYearId));
    if (!fy) return { ok: false, error: "Fiscal year not found." };

    const [inserted] = await db
      .insert(fundingSources)
      .values({
        fiscalYearId,
        name: input.name,
        kind: input.kind as FundingSourceKind,
        contractValue: contractValueStr,
        monthlyExpected: monthlyStrings,
        categoryCaps: input.categoryCaps,
        allowedCategoryCodes: input.categoryCaps.map((c) => c.code),
        status: input.status as FundingSourceStatus,
        notes: input.notes ?? null,
        contractStartDate:
          input.contractStartDate && input.contractStartDate !== ""
            ? input.contractStartDate
            : null,
        contractEndDate:
          input.contractEndDate && input.contractEndDate !== ""
            ? input.contractEndDate
            : null,
        contractTotalValue:
          input.contractTotalValue == null || input.contractTotalValue === ""
            ? null
            : Number(input.contractTotalValue).toFixed(2),
        yearlyAllocations: input.yearlyAllocations,
      })
      .returning({ id: fundingSources.id });

    revalidatePath(`/budget/${fy.year}/grants`);
    revalidatePath(`/budget/${fy.year}/budget`);
    revalidatePath(`/budget/${fy.year}`);
    redirect(`/budget/${fy.year}/grants/${inserted.id}?created=1`);
  }
}

/**
 * Delete a funding source. Refuses if any expense-report line still uses
 * it (that would be a hard reference — the ER expects the funding source
 * to exist). Bank transactions and splits use `on delete set null`, so
 * they're silently unlinked and their counts are returned to the caller
 * so the UI can explain what happened.
 */
export async function deleteFundingSource(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState & { unlinkedBankCount?: number; unlinkedSplitCount?: number }> {
  const guard = await requireAdmin();
  if ("ok" in guard) return guard;

  const id = String(formData.get("id") ?? "").trim();
  const year = Number(formData.get("year") ?? "");
  if (!id) return { ok: false, error: "Missing funding source id." };

  const [existing] = await db
    .select()
    .from(fundingSources)
    .where(eq(fundingSources.id, id));
  if (!existing) return { ok: false, error: "Funding source not found." };

  // Hard block: ER lines reference funding sources with `on delete set null`
  // too, so technically we could just delete. But losing the source on a
  // historical ER line silently is confusing — surface it as a warning.
  const [erUse] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(expenseReportLines)
    .where(eq(expenseReportLines.fundingSourceId, id));
  const [bankUse] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bankTransactions)
    .where(eq(bankTransactions.fundingSourceId, id));
  const [splitUse] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bankTransactionSplits)
    .where(eq(bankTransactionSplits.fundingSourceId, id));

  // Confirm flag: the UI sends confirm=1 on the second click after the
  // warning is displayed.
  const confirmed = formData.get("confirm") === "1";
  if (!confirmed && (erUse.n > 0 || bankUse.n > 0 || splitUse.n > 0)) {
    return {
      ok: false,
      error: `In use — ${bankUse.n} bank txn(s), ${splitUse.n} split(s), ${erUse.n} ER line(s). Click delete again to confirm; bank/split refs will be unlinked, ER lines will keep the funding source name in history.`,
      unlinkedBankCount: bankUse.n,
      unlinkedSplitCount: splitUse.n,
    };
  }

  await db.delete(fundingSources).where(eq(fundingSources.id, id));

  revalidatePath(`/budget/${year || ""}/grants`);
  revalidatePath(`/budget/${year || ""}`);
  redirect(`/budget/${year}/grants?deleted=1`);
}

// -------------------- Bulk remap expenses to a funding source --------------------

/**
 * Set the funding source on every direct-expense bank txn, split, and paid
 * ER line whose budget line matches `budgetLineId`. Used to fix historical
 * data where the project/funder was baked into the budget-line code
 * (VOICES-001, McGill-001, ...) instead of being tagged separately.
 *
 * By default only rows with NO current funding source are updated so it's
 * a safe additive operation. Pass `overwrite=1` to also replace existing
 * tags — the response reports the counts either way.
 */
export async function remapFundingSourceForBudgetLine(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<
  ActionState & {
    counts?: {
      bankUpdated: number;
      splitUpdated: number;
      erLineUpdated: number;
    };
  }
> {
  const guard = await requireAdmin();
  if ("ok" in guard) return guard;

  const fundingSourceId = String(formData.get("fundingSourceId") ?? "").trim();
  const budgetLineId = String(formData.get("budgetLineId") ?? "").trim();
  const overwrite = formData.get("overwrite") === "1";
  const year = Number(formData.get("year") ?? "");
  if (!fundingSourceId || !budgetLineId) {
    return { ok: false, error: "Pick a funding source and a budget line." };
  }

  const [fs] = await db
    .select()
    .from(fundingSources)
    .where(eq(fundingSources.id, fundingSourceId));
  if (!fs) return { ok: false, error: "Funding source not found." };

  // 1. Bank txns (direct_expense, matching budget line, without splits).
  const bankWhere = overwrite
    ? sql`${bankTransactions.budgetLineId} = ${budgetLineId} AND ${bankTransactions.classification} = 'direct_expense'`
    : sql`${bankTransactions.budgetLineId} = ${budgetLineId} AND ${bankTransactions.classification} = 'direct_expense' AND ${bankTransactions.fundingSourceId} IS NULL`;
  const bankResult = await db
    .update(bankTransactions)
    .set({ fundingSourceId })
    .where(bankWhere)
    .returning({ id: bankTransactions.id });

  // 2. Splits — same idea, keyed on split.budget_line_id.
  const splitWhere = overwrite
    ? sql`${bankTransactionSplits.budgetLineId} = ${budgetLineId}`
    : sql`${bankTransactionSplits.budgetLineId} = ${budgetLineId} AND ${bankTransactionSplits.fundingSourceId} IS NULL`;
  const splitResult = await db
    .update(bankTransactionSplits)
    .set({ fundingSourceId })
    .where(splitWhere)
    .returning({ id: bankTransactionSplits.id });

  // 3. ER lines on paid reports.
  const erWhereBase = overwrite
    ? sql`${expenseReportLines.budgetLineId} = ${budgetLineId}`
    : sql`${expenseReportLines.budgetLineId} = ${budgetLineId} AND ${expenseReportLines.fundingSourceId} IS NULL`;
  const erResult = await db
    .update(expenseReportLines)
    .set({ fundingSourceId })
    .where(erWhereBase)
    .returning({ id: expenseReportLines.id });

  revalidatePath(`/budget/${year || ""}/grants/${fundingSourceId}`);
  revalidatePath(`/budget/${year || ""}/expenses`);
  revalidatePath(`/budget/${year || ""}`);
  return {
    ok: true,
    counts: {
      bankUpdated: bankResult.length,
      splitUpdated: splitResult.length,
      erLineUpdated: erResult.length,
    },
  };
}

// -------------------- Opening balance --------------------

/**
 * Set (or clear) the opening cash balance on a fiscal year. Kept as a
 * separate action so the year overview can offer a single-field form.
 */
export async function setOpeningBalance(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const guard = await requireAdmin();
  if ("ok" in guard) return guard;

  const raw = String(formData.get("openingBalance") ?? "").trim();
  const parsed = openingBalanceInputSchema.safeParse({
    year: formData.get("year"),
    openingBalance: raw === "" ? "" : raw,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".") || "form"] = issue.message;
    }
    return { ok: false, error: "Enter a number, or leave blank to clear.", fieldErrors };
  }
  const { year, openingBalance } = parsed.data;

  const [fy] = await db
    .select()
    .from(budgetFiscalYears)
    .where(eq(budgetFiscalYears.year, year));
  if (!fy) return { ok: false, error: `Fiscal year ${year} isn't seeded yet.` };

  const value =
    openingBalance === null || openingBalance === ""
      ? null
      : Number(openingBalance).toFixed(2);

  await db
    .update(budgetFiscalYears)
    .set({ openingBalance: value })
    .where(eq(budgetFiscalYears.id, fy.id));

  revalidatePath(`/budget/${year}`);
  return { ok: true };
}
