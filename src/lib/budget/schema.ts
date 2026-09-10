import { z } from "zod";
import {
  BANK_TXN_CLASSIFICATIONS,
  FUNDING_SOURCE_KINDS,
  FUNDING_SOURCE_STATUSES,
} from "@/lib/db/schema";

/** Twelve non-negative dollar figures — Jan..Dec. */
export const monthlyScheduleSchema = z
  .array(
    z.coerce
      .number()
      .finite()
      .min(0, "Amounts must be zero or positive.")
      .max(10_000_000, "Amount is too large — check the number."),
  )
  .length(12, "Provide exactly 12 monthly values.");

/** Per-category cap entry. `cap: null` = allowed with no dollar limit. */
export const categoryCapSchema = z.object({
  code: z.string().regex(/^\d{3}$/, "Category codes look like 001, 002…"),
  cap: z
    .union([z.null(), z.coerce.number().finite().min(0).max(100_000_000)])
    .nullable(),
});
export type CategoryCap = z.infer<typeof categoryCapSchema>;

export const fundingSourceInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(120, "Name is too long."),
  kind: z.enum(FUNDING_SOURCE_KINDS),
  contractValue: z.coerce
    .number()
    .finite()
    .min(0, "Contract value must be zero or positive.")
    .max(100_000_000),
  monthlyExpected: monthlyScheduleSchema,
  categoryCaps: z.array(categoryCapSchema).max(20).default([]),
  status: z.enum(FUNDING_SOURCE_STATUSES).default("active"),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type FundingSourceInput = z.infer<typeof fundingSourceInputSchema>;

/**
 * Parse the funding-source form data. The form serialises the monthly grid
 * as `monthly_0`..`monthly_11` fields (empty = 0) and comma-separated codes
 * for allowed categories.
 */
export function parseFundingSourceForm(fd: FormData) {
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const raw = fd.get(`monthly_${i}`);
    if (raw == null || raw === "") return 0;
    return raw;
  });
  // Caps come in as a JSON string: [{code:"001", cap:30000|null}, ...]
  const capsRaw = String(fd.get("categoryCaps") ?? "").trim();
  let categoryCaps: unknown = [];
  if (capsRaw) {
    try {
      categoryCaps = JSON.parse(capsRaw);
    } catch {
      // let Zod produce the field error
      categoryCaps = capsRaw;
    }
  }
  const notesRaw = String(fd.get("notes") ?? "").trim();

  return fundingSourceInputSchema.safeParse({
    name: fd.get("name"),
    kind: fd.get("kind"),
    contractValue: fd.get("contractValue") ?? 0,
    monthlyExpected: monthly,
    categoryCaps,
    status: fd.get("status") || "active",
    notes: notesRaw || null,
  });
}

// -------------------- Bank classification --------------------

export const bankClassificationInputSchema = z
  .object({
    txnId: z.string().uuid(),
    classification: z.enum(BANK_TXN_CLASSIFICATIONS),
    budgetLineId: z.string().uuid().nullable().optional(),
    fundingSourceId: z.string().uuid().nullable().optional(),
    reversalOfTxnId: z.string().uuid().nullable().optional(),
    expenseReportId: z.string().uuid().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.classification === "direct_expense" && !val.budgetLineId) {
      ctx.addIssue({
        code: "custom",
        path: ["budgetLineId"],
        message: "Direct expenses need a budget line.",
      });
    }
    if (val.classification === "grant_receipt" && !val.fundingSourceId) {
      ctx.addIssue({
        code: "custom",
        path: ["fundingSourceId"],
        message: "Grant receipts need a funding source.",
      });
    }
    if (val.classification === "reversal" && !val.reversalOfTxnId) {
      ctx.addIssue({
        code: "custom",
        path: ["reversalOfTxnId"],
        message: "Pick the original transfer this reverses.",
      });
    }
    if (val.classification === "er_reimbursement" && !val.expenseReportId) {
      ctx.addIssue({
        code: "custom",
        path: ["expenseReportId"],
        message: "Pick the approved expense report this reimburses.",
      });
    }
  });

export type BankClassificationInput = z.infer<typeof bankClassificationInputSchema>;

// -------------------- Bank transaction splits --------------------

/**
 * A single split allocation for a bank transaction. Each split gets its
 * own budget line + optional funding source + optional description.
 * The action validates that sum(amount) == parent.debit.
 */
export const bankTransactionSplitInputSchema = z.object({
  budgetLineId: z.string().uuid("Pick a budget line."),
  fundingSourceId: z.string().uuid().nullable().optional(),
  amount: z.coerce
    .number()
    .finite()
    .gt(0, "Split amount must be greater than zero.")
    .max(10_000_000),
  description: z.string().trim().max(500).nullable().optional(),
});

export const bankTransactionSplitsFormSchema = z.object({
  txnId: z.string().uuid(),
  splits: z.array(bankTransactionSplitInputSchema).max(50, "Too many splits."),
});
export type BankTransactionSplitInput = z.infer<
  typeof bankTransactionSplitInputSchema
>;

// -------------------- Manual entry edit --------------------

/**
 * Editable fields for a manual-account bank transaction (the synthetic
 * "Manual entries (pre-import)" account created during the Excel import).
 * Only exposed on manual rows — real bank rows shouldn't be edited to
 * preserve the audit trail.
 */
export const manualEntryEditSchema = z.object({
  id: z.string().uuid(),
  txnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."),
  description: z.string().trim().min(1, "Description is required.").max(500),
  amount: z.coerce
    .number()
    .finite()
    .gt(0, "Amount must be greater than zero.")
    .max(10_000_000),
  budgetLineId: z.string().uuid().nullable().optional(),
  fundingSourceId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type ManualEntryEditInput = z.infer<typeof manualEntryEditSchema>;

export const bankAccountInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Account name must be at least 3 characters.")
    .max(80),
});

export const openingBalanceInputSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  openingBalance: z.union([z.literal(""), z.coerce.number().finite()]).nullable(),
});
