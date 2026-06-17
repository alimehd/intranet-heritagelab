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
