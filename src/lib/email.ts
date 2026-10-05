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
 * Every travel claim must be approved before payments acts on it. By default
 * Ali approves everyone's claims; Ali's own claims are approved by Elias. The
 * approver becomes the primary recipient and payments is copied.
 *
 * - CLAIM_DEFAULT_APPROVER: approver for any submitter without an override
 *   (default ali.mehdi@heritagelab.ca).
 * - CLAIM_APPROVER_OVERRIDES="submitter:approver,…": per-submitter exceptions
 *   (default: Ali's claims go to Elias).
 */
const DEFAULT_APPROVER = "ali.mehdi@heritagelab.ca";
const DEFAULT_APPROVER_OVERRIDES: Record<string, string> = {
  "ali.mehdi@heritagelab.ca": "elias.moukannas@heritagelab.ca",
};

function getDefaultApprover(): string {
  return (process.env.CLAIM_DEFAULT_APPROVER?.trim() || DEFAULT_APPROVER).toLowerCase();
}

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

/**
 * Who must approve this submitter's claims. Never the submitter themselves:
 * if the default approver is the submitter and there's no explicit override,
 * fall back to the built-in override (Elias for Ali).
 */
export function getApproverFor(submitterEmail: string): string | null {
  const submitter = submitterEmail.trim().toLowerCase();
  const explicit = getApproverOverrides()[submitter];
  if (explicit) return explicit;
  const fallback = getDefaultApprover();
  if (fallback !== submitter) return fallback;
  return DEFAULT_APPROVER_OVERRIDES[submitter] ?? null;
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
