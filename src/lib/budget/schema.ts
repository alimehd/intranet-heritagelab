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
  allowedCategoryCodes: z
    .array(z.string().regex(/^\d{3}$/, "Category codes look like 001, 002…"))
    .max(20)
    .default([]),
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
  const codesRaw = String(fd.get("allowedCategoryCodes") ?? "").trim();
  const allowedCategoryCodes = codesRaw
    ? codesRaw.split(",").map((c) => c.trim()).filter(Boolean)
    : [];
  const notesRaw = String(fd.get("notes") ?? "").trim();

  return fundingSourceInputSchema.safeParse({
    name: fd.get("name"),
    kind: fd.get("kind"),
    contractValue: fd.get("contractValue") ?? 0,
    monthlyExpected: monthly,
    allowedCategoryCodes,
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
