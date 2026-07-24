import { getAllowedDomains } from "./allowlist";

/**
 * Board of Directors. Overridable via BOARD_MEMBER_EMAILS (comma-separated) so
 * membership changes don't require a deploy.
 */
const DEFAULT_BOARD_MEMBERS = [
  "lisa.mesher@heritagelab.ca",
  "natasha.macdonald@heritagelab.ca",
  "thomassie@heritagelab.ca",
  "yasmine.charara@heritagelab.ca",
  "elias.moukannas@heritagelab.ca",
] as const;

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function getBoardMembers(): Set<string> {
  const configured = (process.env.BOARD_MEMBER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured.length > 0 ? configured : DEFAULT_BOARD_MEMBERS);
}

export function isBoardMember(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && getBoardMembers().has(normalized);
}

/** True for anyone signed in with a Heritage Lab domain address. */
export function isInternalStaff(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at < 0) return false;
  return getAllowedDomains().has(normalized.slice(at + 1));
}
