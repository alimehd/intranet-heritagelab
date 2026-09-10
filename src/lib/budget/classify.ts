import type { BankTxnClassification } from "@/lib/db/schema";

/**
 * Auto-classification rules for freshly imported TD rows.
 *
 * Runs at import time before any human review. Only classifies the
 * obviously-mechanical rows (bank fees, service charges, transfer fees,
 * account rebates) and flags reversals for pairing. Every other row lands
 * as `unclassified` and needs a human decision — that's a feature, not a
 * bug: budget hygiene depends on knowing what every dollar is.
 */

export type AutoRule = {
  match: RegExp;
  classification: BankTxnClassification;
  /** `005-1` — Bank fees, payment processing. Applied when set. */
  budgetLineFullCode?: string;
  /** Human-readable label shown in UI to explain the auto-tag. */
  reason: string;
};

/** Ordered — first match wins. Add rules here as new descriptions appear. */
export const AUTO_RULES: readonly AutoRule[] = [
  {
    match: /^SEND E-TFR FEE\b/i,
    classification: "transfer_fee",
    budgetLineFullCode: "005-1",
    reason: "Interac e-Transfer fee",
  },
  {
    match: /^REVERSE E-TFR FEE\b/i,
    classification: "transfer_fee",
    budgetLineFullCode: "005-1",
    reason: "Reversed e-Transfer fee refund",
  },
  {
    match: /^MONTHLY PLAN FEE\b/i,
    classification: "fee",
    budgetLineFullCode: "005-1",
    reason: "TD monthly plan fee",
  },
  {
    match: /^SERVICE CHARGE\b/i,
    classification: "fee",
    budgetLineFullCode: "005-1",
    reason: "TD service charge",
  },
  {
    match: /^OVERDRAFT INTEREST\b/i,
    classification: "fee",
    budgetLineFullCode: "005-1",
    reason: "Overdraft interest",
  },
  {
    match: /^ACCT BAL REBATE\b/i,
    classification: "fee",
    budgetLineFullCode: "005-1",
    reason: "Account balance rebate (offset against fees)",
  },
  {
    // Flags for reversal pairing; the actual link is set by a follow-up
    // classify action once the operator picks the original transfer.
    match: /^REV E-TFR\b/i,
    classification: "reversal",
    reason: "Reversed e-Transfer — pair with the original transfer",
  },
];

export type AutoClassification = {
  classification: BankTxnClassification;
  budgetLineFullCode?: string;
  reason: string;
} | null;

/** Match a TD description against the auto-rules. Returns null if unmatched. */
export function autoClassify(description: string): AutoClassification {
  for (const rule of AUTO_RULES) {
    if (rule.match.test(description)) {
      return {
        classification: rule.classification,
        budgetLineFullCode: rule.budgetLineFullCode,
        reason: rule.reason,
      };
    }
  }
  return null;
}

export const CLASSIFICATION_LABELS: Record<BankTxnClassification, string> = {
  unclassified: "Unclassified",
  direct_expense: "Direct expense",
  er_reimbursement: "Expense-report reimbursement",
  grant_receipt: "Grant / contract receipt",
  fee: "Bank fee",
  transfer_fee: "Transfer fee",
  reversal: "Reversal",
  internal_transfer: "Internal transfer",
  ignore: "Ignore",
};

/** Rough copy for the classify UI so the operator picks the right bucket. */
export const CLASSIFICATION_HELP: Record<BankTxnClassification, string> = {
  unclassified: "Needs review.",
  direct_expense: "Payment to a supplier, contractor, or salary — routes straight to a budget line.",
  er_reimbursement: "Lump-sum reimbursement to a staff member for an approved expense report.",
  grant_receipt: "Deposit from a grant, service contract, donation, or other funding source.",
  fee: "A TD bank fee, service charge, or interest.",
  transfer_fee: "Fee attached to an Interac e-Transfer (usually $1.50).",
  reversal: "Cancels an earlier transfer — must be paired with the original for accurate spend.",
  internal_transfer: "Movement between HL bank accounts. Excluded from cash-flow totals.",
  ignore: "Not part of budget accounting — hidden from dashboards.",
};
