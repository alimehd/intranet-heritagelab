import { getClaimsRecipient, getMailFrom, getResend } from "@/lib/email";
import { renderClaimPdf } from "./pdf";
import {
  computeTotals,
  formatMoney,
  type TravelClaimInput,
} from "./schema";

export type ReceiptAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export async function emailTravelClaim(args: {
  claim: TravelClaimInput;
  claimId: string;
  submittedAt: Date;
  receipts: ReceiptAttachment[];
}): Promise<{ id: string | null }> {
  const { claim, claimId, submittedAt, receipts } = args;
  const totals = computeTotals(claim);
  const pdf = await renderClaimPdf({ claim, submittedAt, claimId });

  const subject = `Travel Claim — ${claim.fullName} — ${claim.startDate} to ${claim.endDate} — ${formatMoney(totals.grandTotal)}`;

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
    `Ground transport:  ${formatMoney(totals.transport)}`,
    `Personal vehicle:  ${formatMoney(totals.km)}`,
    `Meals:             ${formatMoney(totals.meals)}`,
    `Other:             ${formatMoney(totals.other)}`,
    `GRAND TOTAL:       ${formatMoney(totals.grandTotal)}`,
    ``,
    claim.notes ? `Notes:\n${claim.notes}\n` : ``,
    `Claim ID: ${claimId}`,
    `Submitted: ${submittedAt.toISOString()}`,
    receipts.length
      ? `\n${receipts.length} receipt file(s) attached.`
      : `\nNo receipts attached.`,
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
        <tr><td style="padding:6px 10px; border-bottom:1px solid #e4e2db;">Ground transport</td><td style="padding:6px 10px; border-bottom:1px solid #e4e2db; text-align:right;">${formatMoney(totals.transport)}</td></tr>
        <tr><td style="padding:6px 10px; border-bottom:1px solid #e4e2db;">Personal vehicle</td><td style="padding:6px 10px; border-bottom:1px solid #e4e2db; text-align:right;">${formatMoney(totals.km)}</td></tr>
        <tr><td style="padding:6px 10px; border-bottom:1px solid #e4e2db;">Meals</td><td style="padding:6px 10px; border-bottom:1px solid #e4e2db; text-align:right;">${formatMoney(totals.meals)}</td></tr>
        <tr><td style="padding:6px 10px; border-bottom:1px solid #e4e2db;">Other</td><td style="padding:6px 10px; border-bottom:1px solid #e4e2db; text-align:right;">${formatMoney(totals.other)}</td></tr>
        <tr style="background:#f8f6f1;"><td style="padding:8px 10px; font-weight:bold;">Grand Total</td><td style="padding:8px 10px; text-align:right; font-weight:bold; color:#3d5a3b;">${formatMoney(totals.grandTotal)}</td></tr>
      </table>
      ${claim.notes ? `<div style="margin-top:16px;"><div style="color:#6b7066; font-size:12px; text-transform:uppercase; letter-spacing:.05em;">Notes</div><div style="white-space:pre-wrap;">${escapeHtml(claim.notes)}</div></div>` : ""}
      <p style="margin-top:24px; font-size:12px; color:#6b7066;">
        Full claim PDF is attached.${receipts.length ? ` ${receipts.length} receipt file(s) also attached.` : " No receipts were attached."}<br/>
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
    ...receipts.map((r) => ({
      filename: r.filename,
      content: r.content,
      contentType: r.contentType,
    })),
  ];

  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: getMailFrom(),
    to: [getClaimsRecipient()],
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
