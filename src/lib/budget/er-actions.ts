"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  bankTransactions,
  budgetFiscalYears,
  budgetLines,
  expenseReports,
  expenseReportLines,
  fundingSources,
  type ExpenseReport,
  type ExpenseReportStatus,
} from "@/lib/db/schema";
import {
  canApproveExpenseReports,
  canEditBudget,
  canViewBudget,
} from "@/lib/budget/people";
import { normalizeEmail } from "@/lib/roles";
import {
  canTransition,
  computeReportTotal,
  parseExpenseReportPayload,
  type ExpenseReportInput,
} from "@/lib/budget/er-schema";
import {
  allocateNextReportNumber,
  getExpenseReportById,
} from "@/lib/budget/er-queries";
import { deleteBlob, isBlobConfigured, uploadBlob } from "@/lib/budget/blob";
import { renderExpenseReportPdf } from "@/lib/budget/er-pdf";
import {
  enrichLinesForPdf,
  fetchLineReceipts,
} from "@/lib/budget/er-pdf-helpers";
import { appendReceiptsToClaimPdf } from "@/lib/claims/receipts";
import {
  emailErCancellation,
  emailErDecision,
  emailErSubmission,
} from "@/lib/budget/er-email";

// ---------- constants ----------

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024; // 8 MB per file
const MAX_TOTAL_RECEIPT_BYTES = 30 * 1024 * 1024; // 30 MB per save
const ALLOWED_RECEIPT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

// ---------- shared types ----------

export type ErActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  reportId?: string;
  warnings?: string[];
};

// ---------- guards ----------

type SubmitterGuard = {
  userId: string;
  email: string;
  name: string;
};

async function requireSubmitter(): Promise<SubmitterGuard | ErActionState> {
  const session = await auth();
  const email = session?.user?.email;
  const userId = session?.user?.id;
  if (!email || !userId) return { ok: false, error: "Not signed in." };
  if (!canEditBudget(email)) {
    return { ok: false, error: "You don't have edit access to expense reports." };
  }
  return { userId, email, name: session?.user?.name ?? email };
}

type ApproverGuard = { email: string };

async function requireApprover(): Promise<ApproverGuard | ErActionState> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { ok: false, error: "Not signed in." };
  if (!canApproveExpenseReports(email)) {
    return { ok: false, error: "You aren't set up to approve expense reports." };
  }
  return { email };
}

// ---------- receipt helpers ----------

/**
 * Extract per-line receipts from form data. Keys are `receipt_<clientId>`.
 * Returns a map keyed by clientId so we can attach the resulting URL back
 * to the matching line at insert time.
 */
async function readReceiptsFromForm(
  formData: FormData,
): Promise<
  | { ok: true; receipts: Map<string, { file: File }> }
  | { ok: false; error: string }
> {
  const receipts = new Map<string, { file: File }>();
  let totalBytes = 0;
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("receipt_")) continue;
    if (!(value instanceof File) || value.size === 0) continue;
    if (value.size > MAX_RECEIPT_BYTES) {
      return {
        ok: false,
        error: `Receipt "${value.name}" exceeds the 8 MB per-file limit.`,
      };
    }
    totalBytes += value.size;
    if (totalBytes > MAX_TOTAL_RECEIPT_BYTES) {
      return {
        ok: false,
        error: "Total receipt uploads exceed the 30 MB limit — save in batches.",
      };
    }
    if (value.type && !ALLOWED_RECEIPT_TYPES.has(value.type.toLowerCase())) {
      return {
        ok: false,
        error: `Receipt "${value.name}" has unsupported type ${value.type}. Use PDF or image.`,
      };
    }
    const clientId = key.slice("receipt_".length);
    receipts.set(clientId, { file: value });
  }
  return { ok: true, receipts };
}

// ---------- save / submit ----------

type SaveMode = "draft" | "submit";

/**
 * Server action: save (or create + save) a draft, optionally also submitting
 * it for approval. Idempotent w.r.t. lines — the client sends the full line
 * array on every save and we replace in place.
 */
export async function saveExpenseReport(
  _prev: ErActionState | undefined,
  formData: FormData,
): Promise<ErActionState> {
  const guard = await requireSubmitter();
  if ("ok" in guard) return guard;

  const rawPayload = formData.get("payload");
  if (typeof rawPayload !== "string") {
    return { ok: false, error: "Missing report payload." };
  }
  let json: unknown;
  try {
    json = JSON.parse(rawPayload);
  } catch {
    return { ok: false, error: "Report payload was not valid JSON." };
  }

  const parsed = parseExpenseReportPayload(json);
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
  const input: ExpenseReportInput = parsed.data;

  const rawMode = String(formData.get("mode") ?? "draft");
  const mode: SaveMode = rawMode === "submit" ? "submit" : "draft";
  const existingId = String(formData.get("reportId") ?? "").trim() || null;

  // Fiscal-year check: period must belong to a seeded fiscal year.
  const periodYear = Number(input.periodFrom.slice(0, 4));
  const [fy] = await db
    .select()
    .from(budgetFiscalYears)
    .where(eq(budgetFiscalYears.year, periodYear));
  if (!fy) {
    return {
      ok: false,
      error: `Fiscal year ${periodYear} isn't seeded yet. Run seed:budget first or pick a different period.`,
    };
  }

  // Validate every budget line + funding source exists and grab snapshot codes.
  const lineIds = input.lines.map((l) => l.budgetLineId);
  const budgetRows = await db
    .select({
      id: budgetLines.id,
      fullCode: budgetLines.fullCode,
    })
    .from(budgetLines)
    .where(inArray(budgetLines.id, Array.from(new Set(lineIds))));
  const budgetCodeById = new Map(budgetRows.map((r) => [r.id, r.fullCode]));

  const missingBudget = lineIds.filter((id) => !budgetCodeById.has(id));
  if (missingBudget.length > 0) {
    return {
      ok: false,
      error: `Budget line no longer exists: ${missingBudget[0].slice(0, 8)}…`,
    };
  }

  const fundingIds = input.lines
    .map((l) => l.fundingSourceId)
    .filter((v): v is string => Boolean(v));
  if (fundingIds.length > 0) {
    const rows = await db
      .select({ id: fundingSources.id })
      .from(fundingSources)
      .where(inArray(fundingSources.id, Array.from(new Set(fundingIds))));
    const known = new Set(rows.map((r) => r.id));
    const missing = fundingIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      return { ok: false, error: `Funding source not found: ${missing[0].slice(0, 8)}…` };
    }
  }

  const receiptRead = await readReceiptsFromForm(formData);
  if (!receiptRead.ok) return { ok: false, error: receiptRead.error };
  const receiptFiles = receiptRead.receipts;

  const totalAmount = computeReportTotal(input.lines).toFixed(2);

  // ---------- load existing (edit) or create new draft ----------

  let report: ExpenseReport | null = null;
  const now = new Date();

  if (existingId) {
    const detail = await getExpenseReportById(existingId);
    if (!detail) return { ok: false, error: "Report not found." };
    // Only the submitter (or when Ali cancels their own) can edit.
    if (detail.report.submitterUserId !== guard.userId) {
      return { ok: false, error: "You can only edit reports you submitted." };
    }
    if (!["draft", "rejected"].includes(detail.report.status)) {
      return {
        ok: false,
        error: `Report is ${detail.report.status}; only drafts and rejected reports are editable.`,
      };
    }
    report = detail.report;
  }

  const warnings: string[] = [];
  if (receiptFiles.size > 0 && !isBlobConfigured()) {
    warnings.push(
      "BLOB_READ_WRITE_TOKEN isn't set — receipts aren't being persisted. Configure Vercel Blob to keep them.",
    );
  }

  // ---------- upsert header ----------

  if (!report) {
    const reportNumber = await allocateNextReportNumber();
    const [inserted] = await db
      .insert(expenseReports)
      .values({
        reportNumber,
        fiscalYearId: fy.id,
        submitterUserId: guard.userId,
        submitterName: guard.name,
        submitterEmail: guard.email,
        approverEmail: input.approverEmail,
        title: input.title,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        businessPurpose: input.businessPurpose,
        totalAmount,
        status: "draft",
        updatedAt: now,
      })
      .returning();
    report = inserted;
  } else {
    // If Ali edited a rejected report, flip it back to draft so its state
    // reflects "reopened".
    const currentStatus = report.status as ExpenseReportStatus;
    const nextStatus: ExpenseReportStatus =
      currentStatus === "rejected" ? "draft" : currentStatus;

    await db
      .update(expenseReports)
      .set({
        title: input.title,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        businessPurpose: input.businessPurpose,
        approverEmail: input.approverEmail,
        fiscalYearId: fy.id,
        totalAmount,
        status: nextStatus,
        updatedAt: now,
        // Clear prior decision fields on re-open.
        ...(report.status === "rejected"
          ? { decidedAt: null, decidedBy: null, decisionNote: null }
          : {}),
      })
      .where(eq(expenseReports.id, report.id));
    report = { ...report, status: nextStatus, totalAmount };
  }

  // ---------- replace lines ----------

  // Fetch existing lines to preserve their receipt URLs when we don't
  // upload a new one for that clientId.
  const existingLines = await db
    .select()
    .from(expenseReportLines)
    .where(eq(expenseReportLines.reportId, report.id));

  // clientId is not stored — we match on `id` sent from the client instead.
  // The form sends a `clientId` (may equal `id` for existing lines, or a
  // random string for new ones). Existing-lines whose clientId equals a
  // real uuid keep their receipt across saves.
  const existingReceiptByClientId = new Map<
    string,
    { url: string | null; filename: string | null; contentType: string | null }
  >();
  for (const l of existingLines) {
    existingReceiptByClientId.set(l.id, {
      url: l.receiptUrl,
      filename: l.receiptFilename,
      contentType: l.receiptContentType,
    });
  }

  // Wipe previous lines. We don't try to preserve stable IDs across saves —
  // simplest, and every ER save is cheap. But we DO delete abandoned blobs.
  const keptUrls = new Set<string>();
  for (const line of input.lines) {
    const prior = existingReceiptByClientId.get(line.clientId);
    if (prior?.url && !receiptFiles.has(line.clientId)) keptUrls.add(prior.url);
  }
  for (const l of existingLines) {
    if (l.receiptUrl && !keptUrls.has(l.receiptUrl)) {
      await deleteBlob(l.receiptUrl);
    }
  }

  await db.delete(expenseReportLines).where(eq(expenseReportLines.reportId, report.id));

  // Insert one at a time so we can upload receipts sequentially and preserve
  // ordering; ER lines are always small numbers of rows.
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    const prior = existingReceiptByClientId.get(line.clientId) ?? null;
    let receiptUrl: string | null = prior?.url ?? null;
    let receiptFilename: string | null = prior?.filename ?? null;
    let receiptContentType: string | null = prior?.contentType ?? null;

    const newFile = receiptFiles.get(line.clientId);
    if (newFile) {
      if (prior?.url) {
        await deleteBlob(prior.url);
      }
      try {
        const buf = Buffer.from(await newFile.file.arrayBuffer());
        const uploaded = await uploadBlob({
          filename: newFile.file.name,
          content: buf,
          contentType: newFile.file.type || undefined,
          pathPrefix: `expense-reports/${report.id}`,
        });
        if (uploaded) {
          receiptUrl = uploaded.url;
          receiptFilename = newFile.file.name;
          receiptContentType = newFile.file.type || null;
        } else {
          // Blob not configured — skip persistence but keep the filename so
          // the UI can show "not saved".
          receiptFilename = newFile.file.name;
          receiptContentType = newFile.file.type || null;
        }
      } catch (err) {
        return {
          ok: false,
          error: `Receipt upload failed for line ${i + 1}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    await db.insert(expenseReportLines).values({
      reportId: report.id,
      sortOrder: i,
      expenseDate: line.expenseDate,
      description: line.description,
      budgetLineId: line.budgetLineId,
      budgetLineCode: budgetCodeById.get(line.budgetLineId) ?? "",
      fundingSourceId: line.fundingSourceId ?? null,
      cost: line.cost.toFixed(2),
      receiptUrl,
      receiptFilename,
      receiptContentType,
    });
  }

  // ---------- submit path ----------

  if (mode === "submit") {
    if (
      !canTransition({
        from: report.status as ExpenseReportStatus,
        to: "submitted",
        role: "submitter",
      })
    ) {
      return {
        ok: false,
        error: `Can't submit a ${report.status} report.`,
      };
    }

    // Refresh from DB to get the final state.
    const refreshed = await getExpenseReportById(report.id);
    if (!refreshed) return { ok: false, error: "Report vanished mid-save." };

    await db
      .update(expenseReports)
      .set({
        status: "submitted",
        submittedAt: now,
        submitEmailError: null,
        updatedAt: now,
      })
      .where(eq(expenseReports.id, report.id));

    // Build PDF + email.
    try {
      const pdfLines = await enrichLinesForPdf(refreshed.lines);
      const receiptAttachments = await fetchLineReceipts(refreshed.lines);
      const receiptNames = receiptAttachments.map((r) => r.filename);
      const basePdf = await renderExpenseReportPdf({
        report: { ...refreshed.report, status: "submitted", submittedAt: now },
        lines: pdfLines,
        receiptNames,
      });
      const merged = await appendReceiptsToClaimPdf(basePdf, receiptAttachments);
      const emailRes = await emailErSubmission({
        report: { ...refreshed.report, status: "submitted", submittedAt: now },
        lines: refreshed.lines,
        pdf: merged.pdf,
      });
      await db
        .update(expenseReports)
        .set({ submitEmailMessageId: emailRes.id })
        .where(eq(expenseReports.id, report.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(expenseReports)
        .set({ submitEmailError: msg })
        .where(eq(expenseReports.id, report.id));
      return {
        ok: false,
        error: `Report submitted, but the notification email failed: ${msg}. Ask ${input.approverEmail} to review manually.`,
        reportId: report.id,
        warnings,
      };
    }
  }

  revalidatePath(`/budget/${periodYear}`);
  revalidatePath(`/budget/${periodYear}/reports`);
  revalidatePath(`/budget/${periodYear}/reports/${report.id}`);

  if (mode === "submit") {
    redirect(`/budget/${periodYear}/reports/${report.id}?submitted=1`);
  }
  redirect(`/budget/${periodYear}/reports/${report.id}?saved=1`);
}

// ---------- decide (approve / reject) ----------

export type DecisionState = ErActionState;

export async function decideExpenseReport(
  _prev: DecisionState | undefined,
  formData: FormData,
): Promise<DecisionState> {
  const guard = await requireApprover();
  if ("ok" in guard) return guard;

  const reportId = String(formData.get("reportId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  if (!reportId) return { ok: false, error: "Missing report reference." };
  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, error: "Pick approve or reject." };
  }

  const detail = await getExpenseReportById(reportId);
  if (!detail) return { ok: false, error: "Report not found." };
  const { report } = detail;

  if (
    !canTransition({
      from: report.status as ExpenseReportStatus,
      to: decision as ExpenseReportStatus,
      role: "approver",
    })
  ) {
    return {
      ok: false,
      error: `Can't ${decision} a ${report.status} report.`,
    };
  }
  if (normalizeEmail(report.submitterEmail) === normalizeEmail(guard.email)) {
    return { ok: false, error: "You can't approve your own report." };
  }
  if (decision === "rejected" && note.length < 3) {
    return {
      ok: false,
      error: "Add a short reason so the submitter knows what to fix.",
      fieldErrors: { note: "Give a short reason." },
    };
  }

  const now = new Date();
  await db
    .update(expenseReports)
    .set({
      status: decision as ExpenseReportStatus,
      decidedAt: now,
      decidedBy: guard.email,
      decisionNote: note || null,
      decisionEmailError: null,
      updatedAt: now,
    })
    .where(eq(expenseReports.id, report.id));

  try {
    const pdfLines = await enrichLinesForPdf(detail.lines);
    const receiptAttachments =
      decision === "approved" ? await fetchLineReceipts(detail.lines) : [];
    const basePdf = await renderExpenseReportPdf({
      report: {
        ...report,
        status: decision as ExpenseReportStatus,
        decidedAt: now,
        decidedBy: guard.email,
        decisionNote: note || null,
      },
      lines: pdfLines,
      receiptNames: receiptAttachments.map((r) => r.filename),
    });
    const merged =
      receiptAttachments.length > 0
        ? await appendReceiptsToClaimPdf(basePdf, receiptAttachments)
        : { pdf: basePdf };
    const emailRes = await emailErDecision({
      report: {
        ...report,
        status: decision as ExpenseReportStatus,
        decidedAt: now,
        decidedBy: guard.email,
        decisionNote: note || null,
      },
      decision: decision as "approved" | "rejected",
      decidedBy: guard.email,
      note: note || null,
      pdf: merged.pdf,
    });
    await db
      .update(expenseReports)
      .set({ decisionEmailMessageId: emailRes.id })
      .where(eq(expenseReports.id, report.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(expenseReports)
      .set({ decisionEmailError: msg })
      .where(eq(expenseReports.id, report.id));
    // Non-fatal — the decision stands, we just failed to notify the submitter.
  }

  const year = report.periodTo.slice(0, 4);
  revalidatePath(`/budget/${year}/reports`);
  revalidatePath(`/budget/${year}/reports/${report.id}`);
  revalidatePath(`/budget/${year}`);
  return { ok: true, reportId: report.id };
}

// ---------- cancel ----------

export type CancelErState = ErActionState;

export async function cancelExpenseReport(
  _prev: CancelErState | undefined,
  formData: FormData,
): Promise<CancelErState> {
  const session = await auth();
  const actor = session?.user?.email;
  if (!actor) return { ok: false, error: "Not signed in." };
  if (!canViewBudget(actor)) return { ok: false, error: "Access denied." };

  const reportId = String(formData.get("reportId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!reportId) return { ok: false, error: "Missing report reference." };

  const detail = await getExpenseReportById(reportId);
  if (!detail) return { ok: false, error: "Report not found." };
  const { report } = detail;

  const isSubmitter = report.submitterUserId === session?.user?.id;
  const isApprover = canApproveExpenseReports(actor);
  if (!isSubmitter && !isApprover) {
    return { ok: false, error: "You aren't allowed to cancel this report." };
  }

  const role = isSubmitter ? "submitter" : "approver";
  if (
    !canTransition({
      from: report.status as ExpenseReportStatus,
      to: "cancelled",
      role,
    })
  ) {
    return {
      ok: false,
      error: `Can't cancel a ${report.status} report.`,
    };
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(expenseReports)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: actor,
        cancelReason: reason || null,
        updatedAt: now,
      })
      .where(eq(expenseReports.id, report.id));

    // If the report was already paid, unlink the bank txn so it can be
    // reclassified. (Rare — but keeps the reconciliation invariant safe.)
    if (report.paidByBankTxnId) {
      await tx
        .update(bankTransactions)
        .set({
          expenseReportId: null,
          classification: "unclassified",
          classifiedBy: null,
          classifiedAt: null,
        })
        .where(eq(bankTransactions.id, report.paidByBankTxnId));
      await tx
        .update(expenseReports)
        .set({ paidAt: null, paidByBankTxnId: null })
        .where(eq(expenseReports.id, report.id));
    }
  });

  try {
    await emailErCancellation({
      report,
      cancelledBy: actor,
      reason: reason || null,
    });
  } catch {
    // Cancellation stands even if the notification fails.
  }

  const year = report.periodTo.slice(0, 4);
  revalidatePath(`/budget/${year}/reports`);
  revalidatePath(`/budget/${year}/reports/${report.id}`);
  revalidatePath(`/budget/${year}/bank`);
  revalidatePath(`/budget/${year}`);
  return { ok: true };
}

