import { and, desc, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { travelClaims, type TravelClaim } from "@/lib/db/schema";
import { getApproverFor } from "@/lib/email";
import { normalizeEmail } from "@/lib/roles";

/**
 * Travel claims awaiting sign-off from a specific approver — i.e. claims
 * whose submitter has an approver override pointing at this email (see
 * CLAIM_APPROVER_OVERRIDES in lib/email.ts — e.g. Elias approves Ali's
 * claims), that haven't been approved or cancelled yet. Submitters with no
 * override (most staff) go straight to payments and never appear here.
 */
export async function listPendingTravelClaimApprovals(
  approverEmail: string | null | undefined,
): Promise<TravelClaim[]> {
  const normalizedApprover = normalizeEmail(approverEmail);
  if (!normalizedApprover) return [];

  const rows = await db
    .select()
    .from(travelClaims)
    .where(
      and(isNull(travelClaims.approvedAt), ne(travelClaims.status, "cancelled")),
    )
    .orderBy(desc(travelClaims.createdAt));

  return rows.filter((r) => {
    const requiredApprover = getApproverFor(r.submitterEmail);
    return (
      requiredApprover !== null &&
      normalizeEmail(requiredApprover) === normalizedApprover
    );
  });
}
