function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowedDomains(): Set<string> {
  // Default to heritagelab.ca if nothing is configured.
  const list = parseList(process.env.ALLOWED_EMAIL_DOMAINS);
  return new Set(list.length > 0 ? list : ["heritagelab.ca"]);
}

export function getAllowedEmails(): Set<string> {
  // Optional extra allowlist for board members on personal Gmail, etc.
  return new Set(parseList(process.env.ALLOWED_EMAILS));
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
