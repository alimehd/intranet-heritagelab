"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { travelClaims } from "@/lib/db/schema";
import { emailTravelClaim, type ReceiptAttachment } from "@/lib/claims/email";
import {
  computeTotals,
  travelClaimSchema,
  type TravelClaimInput,
} from "@/lib/claims/schema";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024; // 8 MB per file
const MAX_TOTAL_RECEIPT_BYTES = 20 * 1024 * 1024; // 20 MB total
const ALLOWED_RECEIPT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

export type SubmitState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  claimId?: string;
};

export async function submitTravelClaim(
  _prev: SubmitState | undefined,
  formData: FormData,
): Promise<SubmitState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in to submit a claim." };
  }

  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    return { ok: false, error: "Missing claim payload." };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Claim payload was not valid JSON." };
  }

  const parsed = travelClaimSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const claim: TravelClaimInput = parsed.data;
  const totals = computeTotals(claim);

  const receipts: ReceiptAttachment[] = [];
  let receiptBytes = 0;
  const files = formData.getAll("receipts");
  for (const f of files) {
    if (!(f instanceof File) || f.size === 0) continue;
    if (f.size > MAX_RECEIPT_BYTES) {
      return {
        ok: false,
        error: `Receipt "${f.name}" exceeds the 8 MB per-file limit.`,
      };
    }
    receiptBytes += f.size;
    if (receiptBytes > MAX_TOTAL_RECEIPT_BYTES) {
      return {
        ok: false,
        error: "Total receipt uploads exceed the 20 MB limit.",
      };
    }
    if (f.type && !ALLOWED_RECEIPT_TYPES.has(f.type)) {
      return {
        ok: false,
        error: `Receipt "${f.name}" has unsupported type ${f.type}. Use PDF or images.`,
      };
    }
    const buf = Buffer.from(await f.arrayBuffer());
    receipts.push({
      filename: f.name,
      content: buf,
      contentType: f.type || "application/octet-stream",
    });
  }

  const submittedAt = new Date();
  const [inserted] = await db
    .insert(travelClaims)
    .values({
      userId: session.user.id,
      submitterName: claim.fullName,
      submitterEmail: claim.email,
      purpose: claim.purpose,
      travelType: claim.travelType,
      startDate: claim.startDate,
      endDate: claim.endDate,
      totalAmount: totals.grandTotal.toFixed(2),
      payload: claim,
      status: "submitted",
    })
    .returning({ id: travelClaims.id });

  try {
    const { id: messageId } = await emailTravelClaim({
      claim,
      claimId: inserted.id,
      submittedAt,
      receipts,
    });
    await db
      .update(travelClaims)
      .set({ status: "emailed", emailMessageId: messageId })
      .where(eqClaimId(inserted.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(travelClaims)
      .set({ status: "failed", emailError: msg })
      .where(eqClaimId(inserted.id));
    return {
      ok: false,
      error: `Claim saved, but email failed: ${msg}. An administrator can retry.`,
      claimId: inserted.id,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/travel-claims");
  redirect(`/travel-claims/${inserted.id}?submitted=1`);
}

// Small helper to keep the action file readable without importing eq from drizzle in many places.
import { eq } from "drizzle-orm";
function eqClaimId(id: string) {
  return eq(travelClaims.id, id);
}
