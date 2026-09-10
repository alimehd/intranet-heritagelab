"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  budgetFiscalYears,
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
        allowedCategoryCodes: input.allowedCategoryCodes,
        status: input.status as FundingSourceStatus,
        notes: input.notes ?? null,
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
        allowedCategoryCodes: input.allowedCategoryCodes,
        status: input.status as FundingSourceStatus,
        notes: input.notes ?? null,
      })
      .returning({ id: fundingSources.id });

    revalidatePath(`/budget/${fy.year}/grants`);
    revalidatePath(`/budget/${fy.year}/budget`);
    revalidatePath(`/budget/${fy.year}`);
    redirect(`/budget/${fy.year}/grants/${inserted.id}?created=1`);
  }
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
