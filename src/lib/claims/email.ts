import {
  getCancellationRouting,
  getClaimRouting,
  getMailFrom,
  getResend,
} from "@/lib/email";
import { renderClaimPdf } from "./pdf";
import { appendReceiptsToClaimPdf, type ReceiptAttachment } from "./receipts";
import {
  computeTotals,
  formatMoney,
  RATES,
  type TravelClaimInput,
} from "./schema";

export type { ReceiptAttachment };

export async function emailTravelClaim(args: {
  claim: TravelClaimInput;
  claimId: string;
  submittedAt: Date;
  receipts: ReceiptAttachment[];
}): Promise<{ id: string | null }> {
  const { claim, claimId, submittedAt, receipts } = args;
  const totals = computeTotals(claim);

  const basePdf = await renderClaimPdf({
    claim,
    submittedAt,
    claimId,
    receiptNames: receipts.map((r) => r.filename),
  });
  const { pdf, appended, unsupported } = await appendReceiptsToClaimPdf(
    basePdf,
    receipts,
  );

  const subject = `Travel Claim — ${claim.fullName} — ${claim.startDate} to ${claim.endDate} — ${formatMoney(totals.grandTotal)}`;

  const receiptSummary = describeReceipts(appended.length, unsupported.length);

  const text = [
    `New travel expense claim submitted via the Heritage Lab Intranet.`,
    ``,
    `Submitter: ${claim.fullName} <${claim.email}>`,
    `Purpose:   ${claim.purpose}`,
    `Type:      ${claim.travelType}`,
    `Dates:     ${claim.startDate} → ${claim.endDate}`,
    ``,
    `Airfare:           ${formatMoney(totals.airfare)}`,
    `Hotel:             ${formatMoney(totals.hotel)}`,
    `Private host:      ${formatMoney(totals.privateHost)}${totals.privateHostNights > 0 ? ` (${totals.privateHostNights} night(s))` : ""}`,
    `Ground transport:  ${formatMoney(totals.transport)}`,
    `Personal vehicle:  ${formatMoney(totals.km)}`,
    `Meals:             ${formatMoney(totals.meals)}`,
    `Other:             ${formatMoney(totals.other)}`,
    `GRAND TOTAL:       ${formatMoney(totals.grandTotal)}`,
    ``,
    totals.privateHostNights > 0
      ? [
          `Private host (paid to the claimant at ${formatMoney(RATES.privateHostPerNight)}/night):`,
          `  Name:    ${claim.privateHost.hostName}`,
          `  Email:   ${claim.privateHost.hostEmail}`,
          `  Address: ${claim.privateHost.hostAddress}`,
          `  Stay:    ${claim.privateHost.checkIn} → ${claim.privateHost.checkOut}`,
          ``,
        ].join("\n")
      : ``,
    claim.notes ? `Notes:\n${claim.notes}\n` : ``,
    `Claim ID: ${claimId}`,
    `Submitted: ${submittedAt.toISOString()}`,
    ``,
    receiptSummary,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#1f2421; max-width:640px;">
      <h2 style="color:#4d6a4b; margin:0 0 4px;">New Travel Expense Claim</h2>
      <p style="color:#6b7066; margin:0 0 16px; font-size:13px;">Submitted via the Heritage Lab Intranet</p>
      <table style="border-collapse:collapse; width:100%; font-size:14px;">
        <tr><td style="padding:4px 8px; color:#6b7066;">Submitter</td><td style="padding:4px 8px;"><strong>${escapeHtml(claim.fullName)}</strong> &lt;${escapeHtml(claim.email)}&gt;</td></tr>
        <tr><td style="padding:4px 8px; color:#6b7066;">Purpose</td><td style="padding:4px 8px;">${escapeHtml(claim.purpose)}</td></tr>
        <tr><td style="padding:4px 8px; color:#6b7066;">Type</td><td style="padding:4px 8px;">${escapeHtml(claim.travelType)}</td></tr>
        <tr><td style="padding:4px 8px; color:#6b7066;">Dates</td><td style="padding:4px 8px;">${claim.startDate} → ${claim.endDate}</td></tr>
      </table>
      <table style="border-collapse:collapse; width:100%; margin-top:16px; font-size:14px; border:1px solid #e4e2db;">
        <tr><td style="padding:6px 10px; border-bottom:1px solid #e4e2db;">Airfare</td><td style="padding:6px 10px; border-bottom:1px solid #e4e2db; text-align:right;">${formatMoney(totals.airfare)}</td></tr>
        <tr><td style="padding:6px 10px; border-bottom:1px solid #e4e2db;">Hotel</td><td style="padding:6px 10px; border-bottom:1px solid #e4e2db; text-align:right;">${formatMoney(totals.hotel)}</td></tr>
        <tr><td style="padding:6px 10px; border-bottom:1px solid #e4e2db;">Private host${totals.privateHostNights > 0 ? ` (${totals.privateHostNights} × ${formatMoney(RATES.privateHostPerNight)})` : ""}</td><td style="padding:6px 10px; border-bottom:1px solid #e4e2db; text-align:right;">${formatMoney(totals.privateHost)}</td></tr>
        <tr><td style="padding:6px 10px; border-bottom:1px solid #e4e2db;">Ground transport</td><td style="padding:6px 10px; border-bottom:1px solid #e4e2db; text-align:right;">${formatMoney(totals.transport)}</td></tr>
        <tr><td style="padding:6px 10px; border-bottom:1px solid #e4e2db;">Personal vehicle</td><td style="padding:6px 10px; border-bottom:1px solid #e4e2db; text-align:right;">${formatMoney(totals.km)}</td></tr>
        <tr><td style="padding:6px 10px; border-bottom:1px solid #e4e2db;">Meals</td><td style="padding:6px 10px; border-bottom:1px solid #e4e2db; text-align:right;">${formatMoney(totals.meals)}</td></tr>
        <tr><td style="padding:6px 10px; border-bottom:1px solid #e4e2db;">Other</td><td style="padding:6px 10px; border-bottom:1px solid #e4e2db; text-align:right;">${formatMoney(totals.other)}</td></tr>
        <tr style="background:#f8f6f1;"><td style="padding:8px 10px; font-weight:bold;">Grand Total</td><td style="padding:8px 10px; text-align:right; font-weight:bold; color:#3d5a3b;">${formatMoney(totals.grandTotal)}</td></tr>
      </table>
      ${
        totals.privateHostNights > 0
          ? `<div style="margin-top:16px;">
        <div style="color:#6b7066; font-size:12px; text-transform:uppercase; letter-spacing:.05em;">Private host</div>
        <table style="border-collapse:collapse; width:100%; font-size:14px;">
          <tr><td style="padding:4px 8px; color:#6b7066;">Name</td><td style="padding:4px 8px;">${escapeHtml(claim.privateHost.hostName)}</td></tr>
          <tr><td style="padding:4px 8px; color:#6b7066;">Email</td><td style="padding:4px 8px;">${escapeHtml(claim.privateHost.hostEmail)}</td></tr>
          <tr><td style="padding:4px 8px; color:#6b7066;">Address</td><td style="padding:4px 8px; white-space:pre-wrap;">${escapeHtml(claim.privateHost.hostAddress)}</td></tr>
          <tr><td style="padding:4px 8px; color:#6b7066;">Stay</td><td style="padding:4px 8px;">${claim.privateHost.checkIn} → ${claim.privateHost.checkOut} (${totals.privateHostNights} night${totals.privateHostNights === 1 ? "" : "s"})</td></tr>
        </table>
        <p style="margin:6px 0 0; font-size:12px; color:#6b7066;">The nightly allowance is reimbursed to the claimant, not paid to the host.</p>
      </div>`
          : ""
      }
      ${claim.notes ? `<div style="margin-top:16px;"><div style="color:#6b7066; font-size:12px; text-transform:uppercase; letter-spacing:.05em;">Notes</div><div style="white-space:pre-wrap;">${escapeHtml(claim.notes)}</div></div>` : ""}
      <p style="margin-top:24px; font-size:12px; color:#6b7066;">
        ${escapeHtml(receiptSummary)}<br/>
        Claim ID: <code>${claimId}</code>
      </p>
    </div>
  `;

  const attachments = [
    {
      filename: `travel-claim-${claim.fullName.replace(/\s+/g, "_")}-${claim.startDate}.pdf`,
      content: pdf,
      contentType: "application/pdf",
    },
    // Anything pdf-lib could not embed still travels with the claim.
    ...unsupported.map((r) => ({
      filename: r.filename,
      content: r.content,
      contentType: r.contentType,
    })),
  ];

  const { to, cc } = getClaimRouting(claim.email);
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: getMailFrom(),
    to,
    ...(cc.length > 0 ? { cc } : {}),
    replyTo: claim.email,
    subject,
    text,
    html,
    attachments,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message || JSON.stringify(error)}`);
  }
  return { id: data?.id ?? null };
}

export async function emailClaimCancellation(args: {
  claimId: string;
  submitterName: string;
  submitterEmail: string;
  purpose: string;
  startDate: string;
  endDate: string;
  totalAmount: number;
  reason: string;
  cancelledBy: string;
  cancelledAt: Date;
}): Promise<{ id: string | null }> {
  const {
    claimId,
    submitterName,
    submitterEmail,
    purpose,
    startDate,
    endDate,
    totalAmount,
    reason,
    cancelledBy,
    cancelledAt,
  } = args;

  const subject = `CANCELLED — Travel Claim — ${submitterName} — ${startDate} to ${endDate} — ${formatMoney(totalAmount)}`;

  const text = [
    `A travel expense claim has been cancelled in the Heritage Lab Intranet.`,
    `Do not process this claim for payment.`,
    ``,
    `Submitter:    ${submitterName} <${submitterEmail}>`,
    `Purpose:      ${purpose}`,
    `Dates:        ${startDate} → ${endDate}`,
    `Amount:       ${formatMoney(totalAmount)}`,
    ``,
    `Cancelled by: ${cancelledBy}`,
    `Cancelled at: ${cancelledAt.toISOString()}`,
    reason ? `Reason:       ${reason}` : `Reason:       (none given)`,
    ``,
    `Claim ID: ${claimId}`,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#1f2421; max-width:640px;">
      <h2 style="color:#b42318; margin:0 0 4px;">Travel Claim Cancelled</h2>
      <p style="color:#6b7066; margin:0 0 16px; font-size:13px;">Do not process this claim for payment.</p>
      <table style="border-collapse:collapse; width:100%; font-size:14px;">
        <tr><td style="padding:4px 8px; color:#6b7066;">Submitter</td><td style="padding:4px 8px;"><strong>${escapeHtml(submitterName)}</strong> &lt;${escapeHtml(submitterEmail)}&gt;</td></tr>
        <tr><td style="padding:4px 8px; color:#6b7066;">Purpose</td><td style="padding:4px 8px;">${escapeHtml(purpose)}</td></tr>
        <tr><td style="padding:4px 8px; color:#6b7066;">Dates</td><td style="padding:4px 8px;">${startDate} → ${endDate}</td></tr>
        <tr><td style="padding:4px 8px; color:#6b7066;">Amount</td><td style="padding:4px 8px;"><strong>${formatMoney(totalAmount)}</strong></td></tr>
        <tr><td style="padding:4px 8px; color:#6b7066;">Cancelled by</td><td style="padding:4px 8px;">${escapeHtml(cancelledBy)}</td></tr>
        <tr><td style="padding:4px 8px; color:#6b7066;">Reason</td><td style="padding:4px 8px;">${reason ? escapeHtml(reason) : "<em>None given</em>"}</td></tr>
      </table>
      <p style="margin-top:24px; font-size:12px; color:#6b7066;">
        Cancelled ${cancelledAt.toISOString()}<br/>
        Claim ID: <code>${claimId}</code>
      </p>
    </div>
  `;

  const { to, cc } = getCancellationRouting(submitterEmail);
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: getMailFrom(),
    to,
    ...(cc.length > 0 ? { cc } : {}),
    replyTo: submitterEmail,
    subject,
    text,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message || JSON.stringify(error)}`);
  }
  return { id: data?.id ?? null };
}

function describeReceipts(appended: number, unsupported: number): string {
  if (appended === 0 && unsupported === 0) {
    return "No receipts were attached.";
  }
  const parts: string[] = [];
  if (appended > 0) {
    parts.push(
      `${appended} receipt${appended === 1 ? "" : "s"} appended to the end of the claim PDF.`,
    );
  }
  if (unsupported > 0) {
    parts.push(
      `${unsupported} receipt${unsupported === 1 ? "" : "s"} could not be embedded and ${unsupported === 1 ? "is" : "are"} attached separately.`,
    );
  }
  return parts.join(" ");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
