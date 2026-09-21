import { z } from "zod";
import {
  EXPENSE_REPORT_STATUSES,
  type ExpenseReportStatus,
} from "@/lib/db/schema";

// Human-friendly labels for the ER status pill / prose.
export const EXPENSE_REPORT_STATUS_LABELS: Record<ExpenseReportStatus, string> = {
  draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved (unpaid)",
  rejected: "Rejected",
  paid: "Paid",
  cancelled: "Cancelled",
};

/**
 * Which statuses count as "still active" from the submitter's perspective
 * (i.e. edits allowed / show up in the ER list without a filter).
 */
export const OPEN_ER_STATUSES: ExpenseReportStatus[] = [
  "draft",
  "submitted",
  "approved",
  "rejected",
];

/** Statuses where the submitter can still edit line items. */
export const EDITABLE_ER_STATUSES: ExpenseReportStatus[] = ["draft", "rejected"];

// ---------- line schema ----------

const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;

export const expenseReportLineInputSchema = z.object({
  /** Client-side id only — server assigns real uuid on insert. */
  clientId: z.string().min(1),
  expenseDate: z
    .string()
    .regex(isoDateRe, "Use a YYYY-MM-DD date."),
  description: z
    .string()
    .trim()
    .min(2, "Give the expense a short description.")
    .max(240, "Description is too long."),
  budgetLineId: z.string().uuid("Pick a budget line."),
  fundingSourceId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  cost: z.coerce
    .number()
    .finite()
    .refine((v) => v !== 0, "Cost can't be zero.")
    .min(-1_000_000, "That looks too large.")
    .max(1_000_000, "That looks too large."),
});

export type ExpenseReportLineInput = z.infer<typeof expenseReportLineInputSchema>;

// ---------- report (header) schema ----------

export const expenseReportInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Give the report a title, e.g. 'August 2026 Expenses'.")
      .max(120),
    periodFrom: z.string().regex(isoDateRe, "Use a YYYY-MM-DD date."),
    periodTo: z.string().regex(isoDateRe, "Use a YYYY-MM-DD date."),
    businessPurpose: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    approverEmail: z
      .string()
      .trim()
      .email("Approver email looks wrong.")
      .transform((v) => v.toLowerCase()),
    lines: z
      .array(expenseReportLineInputSchema)
      .min(1, "Add at least one expense line."),
  })
  .superRefine((val, ctx) => {
    if (val.periodFrom > val.periodTo) {
      ctx.addIssue({
        code: "custom",
        path: ["periodTo"],
        message: "End date must be on or after the start date.",
      });
    }
  });

export type ExpenseReportInput = z.infer<typeof expenseReportInputSchema>;

// ---------- helpers ----------

/**
 * Parse the JSON payload that the form serialises into `payload`. Receipts
 * travel separately as multipart file inputs keyed `receipt_<clientId>`.
 */
export function parseExpenseReportPayload(raw: unknown) {
  return expenseReportInputSchema.safeParse(raw);
}

export function computeReportTotal(lines: { cost: number | string }[]): number {
  return lines.reduce((s, l) => s + Number(l.cost || 0), 0);
}

/**
 * Which status transitions are legal, keyed by "actor role".
 * `submitter` is the person who created the ER; `approver` is anyone in
 * BUDGET_VIEWER_EMAILS + board members (but never the submitter themselves).
 */
export function canTransition(args: {
  from: ExpenseReportStatus;
  to: ExpenseReportStatus;
  role: "submitter" | "approver" | "system";
}): boolean {
  const { from, to, role } = args;
  if (from === to) return false;
  if (role === "system") {
    // Only the bank-classify flow flips approved → paid.
    return from === "approved" && to === "paid";
  }
  if (role === "submitter") {
    if (from === "draft" && (to === "submitted" || to === "cancelled")) return true;
    if (from === "rejected" && (to === "draft" || to === "cancelled")) return true;
    if (from === "submitted" && to === "cancelled") return true; // recall
    if (from === "approved" && to === "cancelled") return true;
    return false;
  }
  // approver
  if (from === "submitted" && (to === "approved" || to === "rejected")) return true;
  if (from === "approved" && to === "cancelled") return true;
  return false;
}

export { EXPENSE_REPORT_STATUSES };
export type { ExpenseReportStatus };
