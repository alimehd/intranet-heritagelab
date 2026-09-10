import { getMailFrom, getResend } from "@/lib/email";
import { normalizeEmail } from "@/lib/roles";
import type { ExpenseReport, ExpenseReportLine } from "@/lib/db/schema";

/**
 * Where to link users to review or act on an ER. Falls back to a relative
 * URL if PUBLIC_APP_URL isn't set (still useful in email preview, but the
 * clickable link only fires from an environment with the env var).
 */
function getAppUrl(): string {
  const raw =
    process.env.PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.VERCEL_URL;
  if (!raw) return "";
  return raw.startsWith("http") ? raw.replace(/\/+$/, "") : `https://${raw.replace(/\/+$/, "")}`;
}

export function getErUrl(report: Pick<ExpenseReport, "id" | "periodTo">): string {
  const year = report.periodTo.slice(0, 4);
  const base = getAppUrl();
  const path = `/budget/${year}/reports/${report.id}`;
  return base ? `${base}${path}` : path;
}

function money(n: number): string {
  return n.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ------------------------------------------------------------------
// Submission → approver
// ------------------------------------------------------------------

export async function emailErSubmission(args: {
  report: ExpenseReport;
  lines: ExpenseReportLine[];
  pdf: Buffer;
}): Promise<{ id: string | null }> {
  const { report, lines, pdf } = args;
  const approver = normalizeEmail(report.approverEmail);
  const submitter = normalizeEmail(report.submitterEmail);
  const reviewUrl = getErUrl(report);
  const total = Number(report.totalAmount ?? 0);

  const subject = `Expense Report ${report.reportNumber} — ${report.submitterName} — ${money(total)}`;

  const linesText = lines
    .map(
      (l) =>
        `  • ${l.expenseDate}  ${l.budgetLineCode}  ${l.description}  ${money(Number(l.cost))}`,
    )
    .join("\n");

  const text = [
    `${report.submitterName} has submitted an expense report for your approval.`,
    ``,
    `Report:      ${report.reportNumber} — ${report.title}`,
    `Period:      ${report.periodFrom} → ${report.periodTo}`,
    `Line items:  ${lines.length}`,
    `Total:       ${money(total)}`,
    report.businessPurpose ? `Purpose:     ${report.businessPurpose}` : "",
    ``,
    `Lines:`,
    linesText,
    ``,
    reviewUrl ? `Review & decide: ${reviewUrl}` : "",
    ``,
    `The full PDF (with any receipts) is attached.`,
  ]
    .filter(Boolean)
    .join("\n");

  const linesHtml = lines
    .map(
      (l) => `
        <tr>
          <td style="padding:4px 8px; border-bottom:1px solid #e4e2db;">${l.expenseDate}</td>
          <td style="padding:4px 8px; border-bottom:1px solid #e4e2db; font-family:monospace;">${escapeHtml(l.budgetLineCode)}</td>
          <td style="padding:4px 8px; border-bottom:1px solid #e4e2db;">${escapeHtml(l.description)}</td>
          <td style="padding:4px 8px; border-bottom:1px solid #e4e2db; text-align:right;">${money(Number(l.cost))}</td>
        </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2421;max-width:640px;">
      <h2 style="color:#4d6a4b;margin:0 0 4px;">Expense Report — Awaiting Approval</h2>
      <p style="color:#6b7066;margin:0 0 16px;font-size:13px;">Submitted via the Heritage Lab Intranet</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td style="padding:4px 8px;color:#6b7066;">Report</td><td style="padding:4px 8px;"><strong>${report.reportNumber}</strong> — ${escapeHtml(report.title)}</td></tr>
        <tr><td style="padding:4px 8px;color:#6b7066;">Submitter</td><td style="padding:4px 8px;">${escapeHtml(report.submitterName)} &lt;${escapeHtml(report.submitterEmail)}&gt;</td></tr>
        <tr><td style="padding:4px 8px;color:#6b7066;">Period</td><td style="padding:4px 8px;">${report.periodFrom} → ${report.periodTo}</td></tr>
        ${report.businessPurpose ? `<tr><td style="padding:4px 8px;color:#6b7066;">Purpose</td><td style="padding:4px 8px;">${escapeHtml(report.businessPurpose)}</td></tr>` : ""}
        <tr><td style="padding:4px 8px;color:#6b7066;">Total</td><td style="padding:4px 8px;font-weight:bold;color:#3d5a3b;">${money(total)}</td></tr>
      </table>
      <table style="border-collapse:collapse;width:100%;margin-top:14px;font-size:13px;border:1px solid #e4e2db;">
        <tr style="background:#f8f6f1;">
          <th style="padding:6px 8px;text-align:left;color:#6b7066;">Date</th>
          <th style="padding:6px 8px;text-align:left;color:#6b7066;">Code</th>
          <th style="padding:6px 8px;text-align:left;color:#6b7066;">Description</th>
          <th style="padding:6px 8px;text-align:right;color:#6b7066;">Cost</th>
        </tr>
        ${linesHtml}
      </table>
      ${
        reviewUrl
          ? `<p style="margin-top:18px;"><a href="${reviewUrl}" style="background:#4d6a4b;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:bold;">Review & decide →</a></p>`
          : ""
      }
      <p style="margin-top:16px;font-size:12px;color:#6b7066;">
        Full PDF attached.<br/>
        Report ID: <code>${report.id}</code>
      </p>
    </div>
  `;

  const attachments = [
    {
      filename: `${report.reportNumber}-${report.submitterName.replace(/\s+/g, "_")}.pdf`,
      content: pdf,
      contentType: "application/pdf",
    },
  ];

  const from = getMailFrom();
  const { data, error } = await getResend().emails.send({
    from,
    to: [approver],
    cc: submitter ? [submitter] : undefined,
    replyTo: submitter,
    subject,
    text,
    html,
    attachments,
  });
  if (error) throw new Error(error.message ?? "Resend failed");
  return { id: data?.id ?? null };
}

// ------------------------------------------------------------------
// Decision → submitter
// ------------------------------------------------------------------

export async function emailErDecision(args: {
  report: ExpenseReport;
  decision: "approved" | "rejected";
  decidedBy: string;
  note: string | null;
  pdf?: Buffer;
}): Promise<{ id: string | null }> {
  const { report, decision, decidedBy, note, pdf } = args;
  const submitter = normalizeEmail(report.submitterEmail);
  const approver = normalizeEmail(report.approverEmail);
  const reviewUrl = getErUrl(report);
  const total = Number(report.totalAmount ?? 0);

  const verb = decision === "approved" ? "Approved" : "Rejected";
  const subject = `${verb}: Expense Report ${report.reportNumber} — ${money(total)}`;

  const text = [
    decision === "approved"
      ? `Your expense report ${report.reportNumber} was approved.`
      : `Your expense report ${report.reportNumber} was rejected.`,
    ``,
    `Report:     ${report.reportNumber} — ${report.title}`,
    `Period:     ${report.periodFrom} → ${report.periodTo}`,
    `Total:      ${money(total)}`,
    `Decided by: ${decidedBy}`,
    note ? `Note:       ${note}` : "",
    ``,
    decision === "approved"
      ? "Payment will be processed via the next TD transfer. The report flips to Paid once the reimbursement is imported and linked."
      : "Edit the draft (it's been reopened) and resubmit, or cancel it if it's no longer needed.",
    ``,
    reviewUrl ? `View report: ${reviewUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2421;max-width:640px;">
      <h2 style="color:${decision === "approved" ? "#4d6a4b" : "#a33"};margin:0 0 4px;">
        Expense Report ${verb}
      </h2>
      <p style="color:#6b7066;margin:0 0 16px;font-size:13px;">${escapeHtml(decidedBy)} decided on <strong>${report.reportNumber}</strong></p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td style="padding:4px 8px;color:#6b7066;">Report</td><td style="padding:4px 8px;"><strong>${report.reportNumber}</strong> — ${escapeHtml(report.title)}</td></tr>
        <tr><td style="padding:4px 8px;color:#6b7066;">Period</td><td style="padding:4px 8px;">${report.periodFrom} → ${report.periodTo}</td></tr>
        <tr><td style="padding:4px 8px;color:#6b7066;">Total</td><td style="padding:4px 8px;font-weight:bold;">${money(total)}</td></tr>
        ${note ? `<tr><td style="padding:4px 8px;color:#6b7066;vertical-align:top;">Note</td><td style="padding:4px 8px;white-space:pre-wrap;">${escapeHtml(note)}</td></tr>` : ""}
      </table>
      <p style="margin-top:14px;font-size:14px;">
        ${
          decision === "approved"
            ? "Payment will be processed via the next TD transfer. The report flips to <strong>Paid</strong> once the reimbursement is imported and linked."
            : "Edit the draft (it's been reopened) and resubmit, or cancel it if it's no longer needed."
        }
      </p>
      ${
        reviewUrl
          ? `<p style="margin-top:12px;"><a href="${reviewUrl}" style="color:#4d6a4b;font-weight:bold;">View report →</a></p>`
          : ""
      }
    </div>
  `;

  const attachments = pdf
    ? [
        {
          filename: `${report.reportNumber}-${report.submitterName.replace(/\s+/g, "_")}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ]
    : undefined;

  const from = getMailFrom();
  const { data, error } = await getResend().emails.send({
    from,
    to: [submitter],
    cc: [approver].filter((a) => a && a !== submitter),
    replyTo: approver,
    subject,
    text,
    html,
    attachments,
  });
  if (error) throw new Error(error.message ?? "Resend failed");
  return { id: data?.id ?? null };
}

// ------------------------------------------------------------------
// Cancellation → approver
// ------------------------------------------------------------------

export async function emailErCancellation(args: {
  report: ExpenseReport;
  cancelledBy: string;
  reason: string | null;
}): Promise<{ id: string | null }> {
  const { report, cancelledBy, reason } = args;
  const submitter = normalizeEmail(report.submitterEmail);
  const approver = normalizeEmail(report.approverEmail);
  const total = Number(report.totalAmount ?? 0);
  const reviewUrl = getErUrl(report);

  const subject = `Cancelled: Expense Report ${report.reportNumber}`;
  const text = [
    `Expense report ${report.reportNumber} was cancelled by ${cancelledBy}.`,
    ``,
    `Total (was): ${money(total)}`,
    reason ? `Reason:      ${reason}` : "",
    ``,
    reviewUrl ? `View report: ${reviewUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2421;max-width:640px;">
      <h2 style="color:#6b7066;margin:0 0 4px;">Expense Report Cancelled</h2>
      <p style="color:#6b7066;margin:0 0 16px;font-size:13px;">${escapeHtml(cancelledBy)} cancelled <strong>${report.reportNumber}</strong></p>
      ${reason ? `<p style="margin:0 0 12px;"><em>Reason:</em> ${escapeHtml(reason)}</p>` : ""}
      <p style="font-size:14px;">Total (was): <strong>${money(total)}</strong></p>
      ${reviewUrl ? `<p style="margin-top:12px;"><a href="${reviewUrl}" style="color:#4d6a4b;">View report →</a></p>` : ""}
    </div>
  `;

  // Cancellation goes to whichever side didn't do the cancelling.
  const actor = normalizeEmail(cancelledBy);
  const to = actor === submitter ? [approver] : [submitter];
  const cc = actor === submitter ? [submitter] : [approver];

  const from = getMailFrom();
  const { data, error } = await getResend().emails.send({
    from,
    to,
    cc: cc.filter(Boolean),
    subject,
    text,
    html,
  });
  if (error) throw new Error(error.message ?? "Resend failed");
  return { id: data?.id ?? null };
}
