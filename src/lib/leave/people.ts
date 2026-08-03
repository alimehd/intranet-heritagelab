import { isBoardMember, normalizeEmail } from "@/lib/roles";

/**
 * Alternate addresses that belong to an existing employee. Signing in with an
 * alias must land on the same leave balance, so everything is folded onto the
 * canonical address before it touches the database.
 */
const EMAIL_ALIASES: Record<string, string> = {
  "shawn@heritagelab.ca": "shaun@heritagelab.ca",
};

export type LeaveEmployee = { email: string; name: string };

/**
 * Staff who accrue leave. Override with LEAVE_EMPLOYEES="email:Name,…" so
 * adding someone doesn't require a deploy.
 */
const DEFAULT_LEAVE_EMPLOYEES: LeaveEmployee[] = [
  { email: "shaun@heritagelab.ca", name: "Shaun Annanack" },
  { email: "ali.mehdi@heritagelab.ca", name: "Ali Mehdi" },
];

/** Resolves aliases so one person always has one balance. */
export function canonicalLeaveEmail(email: string | null | undefined): string {
  const normalized = normalizeEmail(email);
  return EMAIL_ALIASES[normalized] ?? normalized;
}

export function getLeaveEmployees(): LeaveEmployee[] {
  const raw = process.env.LEAVE_EMPLOYEES?.trim();
  if (!raw) return DEFAULT_LEAVE_EMPLOYEES;

  const parsed: LeaveEmployee[] = [];
  for (const entry of raw.split(",")) {
    const [email, ...nameParts] = entry.split(":");
    const normalized = canonicalLeaveEmail(email);
    if (!normalized) continue;
    parsed.push({
      email: normalized,
      name: nameParts.join(":").trim() || normalized,
    });
  }
  return parsed.length > 0 ? parsed : DEFAULT_LEAVE_EMPLOYEES;
}

export function findLeaveEmployee(
  email: string | null | undefined,
): LeaveEmployee | null {
  const canonical = canonicalLeaveEmail(email);
  return getLeaveEmployees().find((e) => e.email === canonical) ?? null;
}

/** True for staff who accrue leave and may therefore book it. */
export function hasLeaveEntitlement(email: string | null | undefined): boolean {
  return findLeaveEmployee(email) !== null;
}

/**
 * Who is notified of every request and may approve or decline vacation.
 * Override with LEAVE_APPROVER_EMAILS (comma-separated).
 */
const DEFAULT_LEAVE_APPROVERS = ["ali.mehdi@heritagelab.ca"] as const;

export function getLeaveApprovers(): string[] {
  const configured = (process.env.LEAVE_APPROVER_EMAILS ?? "")
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
  return configured.length > 0 ? configured : [...DEFAULT_LEAVE_APPROVERS];
}

/**
 * Approvers sign off on everyone's leave; board members can also act, which
 * covers the case where an approver requests their own leave.
 */
export function canApproveLeave(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getLeaveApprovers().includes(normalized) || isBoardMember(normalized);
}

/**
 * A second pair of eyes for requests made by an approver, so nobody silently
 * signs off on their own vacation. Defaults to the board.
 */
export function getSelfRequestWitnesses(requesterEmail: string): string[] {
  const requester = normalizeEmail(requesterEmail);
  const configured = (process.env.LEAVE_SELF_REQUEST_CC ?? "")
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
  const witnesses = configured.length > 0 ? configured : [];
  return witnesses.filter((e) => e !== requester);
}
