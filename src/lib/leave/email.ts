import { getMailFrom, getResend } from "@/lib/email";
import { normalizeEmail } from "@/lib/roles";
import { formatDays, formatRange, pluralDays } from "./dates";
import { getLeaveApprovers, getSelfRequestWitnesses } from "./people";
import {
  LEAVE_TYPE_LABELS,
  requiresApproval,
  type LeaveBalance,
  type LeaveType,
} from "./schema";

export type MailRouting = { to: string[]; cc: string[] };

/**
 * Requests go to the approvers with the employee copied in. When an approver
 * files their own leave they stay on the To line (there is nobody above them to
 * route to) and the configured witnesses are copied instead.
 */
export function getLeaveRouting(employeeEmail: string): MailRouting {
  const employee = normalizeEmail(employeeEmail);
  const approvers = getLeaveApprovers();
  const others = approvers.filter((a) => a !== employee);

  if (others.length === 0) {
    return { to: [employee], cc: getSelfRequestWitnesses(employee) };
  }
  return { to: others, cc: [employee] };
}

/** Decisions are addressed to the employee, with the other approvers copied. */
export function getDecisionRouting(
  employeeEmail: string,
  decidedBy: string,
): MailRouting {
  const employee = normalizeEmail(employeeEmail);
  const decider = normalizeEmail(decidedBy);
  const cc = getLeaveApprovers().filter(
    (a) => a !== employee && a !== decider,
  );
  return { to: [employee], cc };
}

type LeaveEmailBase = {
  requestId: string;
  employeeName: string;
  employeeEmail: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  dayCount: number;
  halfDay: boolean;
  reason: string;
  balance: LeaveBalance;
  leaveYear: number;
};

export async function emailLeaveRequest(
  args: LeaveEmailBase & { submittedAt: Date },
): Promise<{ id: string | null }> {
  const {
    requestId,
    employeeName,
    employeeEmail,
    leaveType,
    startDate,
    endDate,
    dayCount,
    halfDay,
    reason,
    balance,
    leaveYear,
    submittedAt,
  } = args;

  const typeLabel = LEAVE_TYPE_LABELS[leaveType];
  const needsApproval = requiresApproval(leaveType);
  const range = formatRange(startDate, endDate);
  const verb = needsApproval ? "Request" : "Notification";

  const subject = `${typeLabel} ${verb} — ${employeeName} — ${range} (${pluralDays(dayCount)})`;

  const headline = needsApproval
    ? `${employeeName} has requested vacation and needs your approval.`
    : `${employeeName} has reported sick leave. No approval is required — this is for your records.`;

  const text = [
    headline,
    ``,
    `Employee:  ${employeeName} <${employeeEmail}>`,
    `Type:      ${typeLabel}`,
    `Dates:     ${range}${halfDay ? " (half day)" : ""}`,
    `Charged:   ${pluralDays(dayCount)}`,
    ``,
    `${leaveYear} ${typeLabel.toLowerCase()} balance after this request:`,
    `  Entitlement: ${formatDays(balance.entitled)} days`,
    `  Taken:       ${formatDays(balance.used)} days`,
    `  Pending:     ${formatDays(balance.pending)} days`,
    `  Remaining:   ${formatDays(balance.remaining)} days`,
    ``,
    reason ? `Note from ${employeeName.split(" ")[0]}:\n${reason}\n` : ``,
    `Weekends and paid holidays are never charged against an entitlement.`,
    ``,
    `Request ID: ${requestId}`,
    `Submitted:  ${submittedAt.toISOString()}`,
  ].join("\n");

  const html = wrapHtml({
    heading: needsApproval ? "Vacation Request" : "Sick Leave Reported",
    headingColor: needsApproval ? "#4d6a4b" : "#8a6d1f",
    subheading: headline,
    body: `
      ${detailsTable([
        ["Employee", `<strong>${escapeHtml(employeeName)}</strong> &lt;${escapeHtml(employeeEmail)}&gt;`],
        ["Type", escapeHtml(typeLabel)],
        ["Dates", `${escapeHtml(range)}${halfDay ? " <em>(half day)</em>" : ""}`],
        ["Charged", `<strong>${pluralDays(dayCount)}</strong>`],
      ])}
      ${balanceTable(balance, leaveYear, typeLabel)}
      ${reason ? noteBlock(`Note from ${employeeName.split(" ")[0]}`, reason) : ""}
      <p style="margin-top:16px; font-size:12px; color:#6b7066;">
        Weekends and paid holidays are never charged against an entitlement.
      </p>
    `,
    footer: `Submitted ${submittedAt.toISOString()}<br/>Request ID: <code>${escapeHtml(requestId)}</code>`,
  });

  const { to, cc } = getLeaveRouting(employeeEmail);
  return send({ to, cc, replyTo: employeeEmail, subject, text, html });
}

export async function emailLeaveDecision(
  args: LeaveEmailBase & {
    decision: "approved" | "declined";
    decidedBy: string;
    decidedAt: Date;
    decisionNote: string;
  },
): Promise<{ id: string | null }> {
  const {
    requestId,
    employeeName,
    employeeEmail,
    leaveType,
    startDate,
    endDate,
    dayCount,
    reason,
    balance,
    leaveYear,
    decision,
    decidedBy,
    decidedAt,
    decisionNote,
  } = args;

  const typeLabel = LEAVE_TYPE_LABELS[leaveType];
  const range = formatRange(startDate, endDate);
  const approved = decision === "approved";
  const word = approved ? "Approved" : "Declined";

  const subject = `${typeLabel} ${word} — ${employeeName} — ${range} (${pluralDays(dayCount)})`;

  const text = [
    `Your ${typeLabel.toLowerCase()} request has been ${decision}.`,
    ``,
    `Employee:    ${employeeName} <${employeeEmail}>`,
    `Dates:       ${range}`,
    `Charged:     ${pluralDays(dayCount)}`,
    `${word} by:  ${decidedBy}`,
    `Decided:     ${decidedAt.toISOString()}`,
    decisionNote ? `Note:        ${decisionNote}` : ``,
    ``,
    `${leaveYear} ${typeLabel.toLowerCase()} balance:`,
    `  Entitlement: ${formatDays(balance.entitled)} days`,
    `  Taken:       ${formatDays(balance.used)} days`,
    `  Pending:     ${formatDays(balance.pending)} days`,
    `  Remaining:   ${formatDays(balance.remaining)} days`,
    ``,
    reason ? `Original note:\n${reason}\n` : ``,
    `Request ID: ${requestId}`,
  ].join("\n");

  const html = wrapHtml({
    heading: `${typeLabel} ${word}`,
    headingColor: approved ? "#3d5a3b" : "#b42318",
    subheading: `Your ${typeLabel.toLowerCase()} request for ${escapeHtml(range)} was ${decision}.`,
    body: `
      ${detailsTable([
        ["Employee", `<strong>${escapeHtml(employeeName)}</strong>`],
        ["Dates", escapeHtml(range)],
        ["Charged", `<strong>${pluralDays(dayCount)}</strong>`],
        [`${word} by`, escapeHtml(decidedBy)],
        ["Note", decisionNote ? escapeHtml(decisionNote) : "<em>None given</em>"],
      ])}
      ${balanceTable(balance, leaveYear, typeLabel)}
    `,
    footer: `Decided ${decidedAt.toISOString()}<br/>Request ID: <code>${escapeHtml(requestId)}</code>`,
  });

  const { to, cc } = getDecisionRouting(employeeEmail, decidedBy);
  return send({ to, cc, replyTo: decidedBy, subject, text, html });
}

export async function emailLeaveCancellation(
  args: LeaveEmailBase & {
    cancelledBy: string;
    cancelledAt: Date;
    cancelReason: string;
  },
): Promise<{ id: string | null }> {
  const {
    requestId,
    employeeName,
    employeeEmail,
    leaveType,
    startDate,
    endDate,
    dayCount,
    balance,
    leaveYear,
    cancelledBy,
    cancelledAt,
    cancelReason,
  } = args;

  const typeLabel = LEAVE_TYPE_LABELS[leaveType];
  const range = formatRange(startDate, endDate);

  const subject = `CANCELLED — ${typeLabel} — ${employeeName} — ${range} (${pluralDays(dayCount)})`;

  const text = [
    `A ${typeLabel.toLowerCase()} entry has been cancelled in the Heritage Lab Intranet.`,
    `The ${pluralDays(dayCount)} have been returned to the ${leaveYear} entitlement.`,
    ``,
    `Employee:     ${employeeName} <${employeeEmail}>`,
    `Dates:        ${range}`,
    `Days returned: ${pluralDays(dayCount)}`,
    `Cancelled by: ${cancelledBy}`,
    `Cancelled at: ${cancelledAt.toISOString()}`,
    cancelReason ? `Reason:       ${cancelReason}` : `Reason:       (none given)`,
    ``,
    `${leaveYear} ${typeLabel.toLowerCase()} balance:`,
    `  Remaining:   ${formatDays(balance.remaining)} of ${formatDays(balance.entitled)} days`,
    ``,
    `Request ID: ${requestId}`,
  ].join("\n");

  const html = wrapHtml({
    heading: `${typeLabel} Cancelled`,
    headingColor: "#b42318",
    subheading: `${pluralDays(dayCount)} returned to the ${leaveYear} entitlement.`,
    body: `
      ${detailsTable([
        ["Employee", `<strong>${escapeHtml(employeeName)}</strong> &lt;${escapeHtml(employeeEmail)}&gt;`],
        ["Dates", escapeHtml(range)],
        ["Days returned", `<strong>${pluralDays(dayCount)}</strong>`],
        ["Cancelled by", escapeHtml(cancelledBy)],
        ["Reason", cancelReason ? escapeHtml(cancelReason) : "<em>None given</em>"],
      ])}
      ${balanceTable(balance, leaveYear, typeLabel)}
    `,
    footer: `Cancelled ${cancelledAt.toISOString()}<br/>Request ID: <code>${escapeHtml(requestId)}</code>`,
  });

  const { to, cc } = getLeaveRouting(employeeEmail);
  return send({ to, cc, replyTo: cancelledBy, subject, text, html });
}

async function send(args: {
  to: string[];
  cc: string[];
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ id: string | null }> {
  const { to, cc, replyTo, subject, text, html } = args;
  if (to.length === 0) {
    throw new Error("No leave notification recipients are configured.");
  }

  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: getMailFrom(),
    to,
    ...(cc.length > 0 ? { cc } : {}),
    replyTo,
    subject,
    text,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message || JSON.stringify(error)}`);
  }
  return { id: data?.id ?? null };
}

// ---------- HTML helpers ----------

function wrapHtml(args: {
  heading: string;
  headingColor: string;
  subheading: string;
  body: string;
  footer: string;
}): string {
  const { heading, headingColor, subheading, body, footer } = args;
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#1f2421; max-width:640px;">
      <h2 style="color:${headingColor}; margin:0 0 4px;">${escapeHtml(heading)}</h2>
      <p style="color:#6b7066; margin:0 0 16px; font-size:13px;">${subheading}</p>
      ${body}
      <p style="margin-top:24px; font-size:12px; color:#6b7066;">${footer}</p>
    </div>
  `;
}

function detailsTable(rows: [string, string][]): string {
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 8px; color:#6b7066; white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:4px 8px;">${value}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse; width:100%; font-size:14px;">${cells}</table>`;
}

function balanceTable(
  balance: LeaveBalance,
  leaveYear: number,
  typeLabel: string,
): string {
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:6px 10px; border-bottom:1px solid #e4e2db;${strong ? "font-weight:bold;" : ""}">${escapeHtml(label)}</td><td style="padding:6px 10px; border-bottom:1px solid #e4e2db; text-align:right;${strong ? "font-weight:bold;" : ""}">${escapeHtml(value)}</td></tr>`;

  return `
    <div style="margin-top:16px;">
      <div style="color:#6b7066; font-size:12px; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px;">
        ${escapeHtml(`${leaveYear} ${typeLabel} balance`)}
      </div>
      <table style="border-collapse:collapse; width:100%; font-size:14px; border:1px solid #e4e2db;">
        ${row("Annual entitlement", `${formatDays(balance.entitled)} days`)}
        ${row("Taken", `${formatDays(balance.used)} days`)}
        ${row("Pending approval", `${formatDays(balance.pending)} days`)}
        <tr style="background:#f8f6f1;">
          <td style="padding:8px 10px; font-weight:bold;">Remaining</td>
          <td style="padding:8px 10px; text-align:right; font-weight:bold; color:${balance.remaining < 0 ? "#b42318" : "#3d5a3b"};">${formatDays(balance.remaining)} days</td>
        </tr>
      </table>
    </div>
  `;
}

function noteBlock(label: string, value: string): string {
  return `<div style="margin-top:16px;">
    <div style="color:#6b7066; font-size:12px; text-transform:uppercase; letter-spacing:.05em;">${escapeHtml(label)}</div>
    <div style="white-space:pre-wrap;">${escapeHtml(value)}</div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
