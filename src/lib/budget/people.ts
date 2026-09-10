import { isBoardMember, normalizeEmail } from "@/lib/roles";

/**
 * Access model for the Budget module.
 *
 * Two coarse roles, both env-overridable so membership changes don't require
 * a deploy — mirroring `src/lib/leave/people.ts`:
 *
 *   BUDGET_ADMIN_EMAILS   — full CRUD (budget grid, expenses, CSV import,
 *                           reconciliation, ER submission). Defaults to Ali.
 *   BUDGET_VIEWER_EMAILS  — read-only on everything, and can approve/reject
 *                           expense reports as the counter-signature.
 *                           Defaults to Elias (existing board member).
 *
 * Board members are NOT auto-included as viewers. Enable per-person via
 * BUDGET_VIEWER_EMAILS if that changes.
 */

const DEFAULT_BUDGET_ADMINS = ["ali.mehdi@heritagelab.ca"] as const;
const DEFAULT_BUDGET_VIEWERS = ["elias.moukannas@heritagelab.ca"] as const;

function parseEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
}

export function getBudgetAdmins(): Set<string> {
  const configured = parseEmails(process.env.BUDGET_ADMIN_EMAILS);
  return new Set(configured.length > 0 ? configured : DEFAULT_BUDGET_ADMINS);
}

export function getBudgetViewers(): Set<string> {
  const configured = parseEmails(process.env.BUDGET_VIEWER_EMAILS);
  return new Set(configured.length > 0 ? configured : DEFAULT_BUDGET_VIEWERS);
}

/** True for anyone who may edit budget data or submit expense reports. */
export function canEditBudget(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getBudgetAdmins().has(normalized);
}

/** True for anyone who may view the budget module (admins + viewers). */
export function canViewBudget(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getBudgetAdmins().has(normalized) || getBudgetViewers().has(normalized);
}

/**
 * Approvers for expense reports. Anyone in the viewer list may approve, plus
 * board members as a fallback. Never the submitter themselves — Phase 4 will
 * enforce that per-report.
 */
export function canApproveExpenseReports(
  email: string | null | undefined,
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getBudgetViewers().has(normalized) || isBoardMember(normalized);
}
