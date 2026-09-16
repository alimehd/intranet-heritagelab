/**
 * Access allowlist for magic-link sign-in.
 *
 * Three layers (any one is enough to get in):
 *   1. ALLOWED_EMAIL_DOMAINS — whole domains (default: heritagelab.ca)
 *   2. ALLOWED_EMAILS — individual exceptions (e.g. board on personal Gmail)
 *   3. GUEST_EMAILS — external collaborators with a deliberately narrow
 *      surface once signed in (see `isGuestEmail`). Defaults include
 *      jacob.seguin@mila.quebec for travel-claim submission only.
 *
 * Sign-in ≠ visibility. Guests pass `isEmailAllowed` so they can log in,
 * but AppShell / page guards hide everything except travel claims.
 */

const DEFAULT_GUEST_EMAILS = ["jacob.seguin@mila.quebec"] as const;

function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowedDomains(): Set<string> {
  const list = parseList(process.env.ALLOWED_EMAIL_DOMAINS);
  return new Set(list.length > 0 ? list : ["heritagelab.ca"]);
}

export function getGuestEmails(): Set<string> {
  const configured = parseList(process.env.GUEST_EMAILS);
  return new Set(configured.length > 0 ? configured : DEFAULT_GUEST_EMAILS);
}

/** True for external collaborators with travel-claims-only access. */
export function isGuestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getGuestEmails().has(email.toLowerCase().trim());
}

export function getAllowedEmails(): Set<string> {
  // Individual exceptions (board on Gmail, etc.) PLUS guests — guests must
  // be in this set so `isEmailAllowed` lets them through the sign-in gate.
  return new Set([...parseList(process.env.ALLOWED_EMAILS), ...getGuestEmails()]);
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const at = normalized.lastIndexOf("@");
  if (at < 0) return false;
  const domain = normalized.slice(at + 1);

  if (getAllowedDomains().has(domain)) return true;
  if (getAllowedEmails().has(normalized)) return true;
  return false;
}
