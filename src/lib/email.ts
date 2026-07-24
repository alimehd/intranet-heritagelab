import { Resend } from "resend";

let _resend: Resend | null = null;
export function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export function getMailFrom(): string {
  return process.env.MAIL_FROM ?? "Heritage Lab Intranet <onboarding@resend.dev>";
}

export function getClaimsRecipient(): string {
  return process.env.CLAIMS_RECIPIENT ?? "payments@heritagelab.ca";
}

/**
 * Submitters whose claims must be approved by someone else before payments
 * acts on them. The approver becomes the primary recipient and payments is
 * copied. Override with CLAIM_APPROVER_OVERRIDES="submitter:approver,…".
 */
const DEFAULT_APPROVER_OVERRIDES: Record<string, string> = {
  "ali.mehdi@heritagelab.ca": "elias.moukannas@heritagelab.ca",
};

function getApproverOverrides(): Record<string, string> {
  const raw = process.env.CLAIM_APPROVER_OVERRIDES?.trim();
  if (!raw) return DEFAULT_APPROVER_OVERRIDES;

  const parsed: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const [submitter, approver] = pair.split(":").map((s) => s.trim().toLowerCase());
    if (submitter && approver) parsed[submitter] = approver;
  }
  return Object.keys(parsed).length > 0 ? parsed : DEFAULT_APPROVER_OVERRIDES;
}

export function getApproverFor(submitterEmail: string): string | null {
  return getApproverOverrides()[submitterEmail.trim().toLowerCase()] ?? null;
}

export type MailRouting = { to: string[]; cc: string[] };

export function getClaimRouting(submitterEmail: string): MailRouting {
  const payments = getClaimsRecipient();
  const approver = getApproverFor(submitterEmail);
  return approver ? { to: [approver], cc: [payments] } : { to: [payments], cc: [] };
}

/** Cancellations always land in payments; the approver is copied when there is one. */
export function getCancellationRouting(submitterEmail: string): MailRouting {
  const approver = getApproverFor(submitterEmail);
  return { to: [getClaimsRecipient()], cc: approver ? [approver] : [] };
}
