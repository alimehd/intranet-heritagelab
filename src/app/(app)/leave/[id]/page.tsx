import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { leaveRequests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { LeaveStatusBadge } from "@/components/LeaveStatusBadge";
import {
  formatDays,
  formatLong,
  formatRange,
  pluralDays,
} from "@/lib/leave/dates";
import { canApproveLeave, canonicalLeaveEmail } from "@/lib/leave/people";
import { getBalancesFor } from "@/lib/leave/queries";
import {
  countLeaveDays,
  LEAVE_TYPE_LABELS,
  type LeaveType,
} from "@/lib/leave/schema";
import { CancelLeaveForm } from "./CancelLeaveForm";
import { LeaveDecisionForm } from "./LeaveDecisionForm";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ submitted?: string }>;

export default async function LeaveDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { submitted } = await searchParams;
  const session = await auth();

  const [row] = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.id, id))
    .limit(1);

  const viewerEmail = canonicalLeaveEmail(session?.user?.email);
  const isApprover = canApproveLeave(session?.user?.email);
  const isOwn = !!row && row.employeeEmail === viewerEmail;

  // Approvers see everyone's leave; everyone else only their own.
  if (!row || (!isOwn && !isApprover)) notFound();

  const leaveType = row.leaveType as LeaveType;
  const dayCount = Number(row.dayCount);
  const balances = await getBalancesFor(row.employeeEmail, row.leaveYear);
  const balance = balances[leaveType];

  const breakdown = countLeaveDays({
    startDate: row.startDate,
    endDate: row.endDate,
    halfDay: row.halfDay,
  });
  const skipped = breakdown.days.filter((d) => d.excluded === "holiday");

  const canReview = isApprover && row.status === "pending";
  const canCancel =
    (isOwn || isApprover) &&
    row.status !== "cancelled" &&
    row.status !== "declined";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/leave?year=${row.leaveYear}`}
          className="hl-btn-ghost -ml-3 mb-2"
        >
          <ArrowLeft className="h-4 w-4" /> All vacation &amp; sick days
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-hl-ink">
              {LEAVE_TYPE_LABELS[leaveType] ?? row.leaveType}
            </h1>
            <p className="mt-1 text-sm text-hl-muted">
              {row.employeeName} · {formatRange(row.startDate, row.endDate)} ·{" "}
              {pluralDays(dayCount)}
            </p>
          </div>
          <LeaveStatusBadge status={row.status} />
        </div>
      </div>

      {submitted ? (
        <div className="flex items-start gap-2 rounded-md border border-hl-green-200 bg-hl-green-50 px-4 py-3 text-sm text-hl-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {row.status === "pending"
              ? "Your request was submitted and emailed for approval."
              : "Your sick leave was recorded and the notification was sent."}
          </span>
        </div>
      ) : null}

      <section className="hl-card p-6">
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-hl-ink">
          Details
        </h2>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Detail label="Employee" value={row.employeeName} />
          <Detail label="Type" value={LEAVE_TYPE_LABELS[leaveType]} />
          <Detail label="First day" value={formatLong(row.startDate)} />
          <Detail label="Last day" value={formatLong(row.endDate)} />
          <Detail
            label="Days charged"
            value={`${pluralDays(dayCount)}${row.halfDay ? " (half day)" : ""}`}
          />
          <Detail label="Leave year" value={String(row.leaveYear)} />
        </dl>

        {breakdown.weekendDays > 0 || skipped.length > 0 ? (
          <div className="mt-4 border-t border-hl-border pt-4">
            <div className="text-xs uppercase tracking-wider text-hl-muted">
              Not charged
            </div>
            <ul className="mt-2 space-y-1 text-sm text-hl-muted">
              {breakdown.weekendDays > 0 ? (
                <li>
                  {breakdown.weekendDays} weekend day
                  {breakdown.weekendDays === 1 ? "" : "s"}
                </li>
              ) : null}
              {skipped.map((d) => (
                <li key={d.date}>
                  {formatLong(d.date)} — {d.holidayName}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {row.reason ? (
          <div className="mt-4 border-t border-hl-border pt-4">
            <div className="text-xs uppercase tracking-wider text-hl-muted">
              Note
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-hl-ink">
              {row.reason}
            </p>
          </div>
        ) : null}
      </section>

      <section className="hl-card p-6">
        <h2 className="mb-1 text-lg font-semibold tracking-tight text-hl-ink">
          {row.leaveYear} {LEAVE_TYPE_LABELS[leaveType].toLowerCase()} balance
        </h2>
        <p className="mb-4 text-sm text-hl-muted">
          For {row.employeeName}, including this entry.
        </p>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Entitlement" value={balance.entitled} />
          <Stat label="Taken" value={balance.used} />
          <Stat label="Pending" value={balance.pending} />
          <Stat
            label="Remaining"
            value={balance.remaining}
            highlight={balance.remaining < 0 ? "danger" : "good"}
          />
        </dl>
      </section>

      {row.decidedAt ? (
        <section className="hl-card p-6">
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-hl-ink">
            Decision
          </h2>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Detail
              label={row.status === "approved" ? "Approved by" : "Declined by"}
              value={row.decidedBy ?? "—"}
            />
            <Detail
              label="Decided"
              value={row.decidedAt.toLocaleString("en-CA")}
            />
          </dl>
          {row.decisionNote ? (
            <p className="mt-4 whitespace-pre-wrap border-t border-hl-border pt-4 text-sm text-hl-ink">
              {row.decisionNote}
            </p>
          ) : null}
        </section>
      ) : null}

      {row.cancelledAt ? (
        <section className="hl-card p-6">
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-hl-ink">
            Cancellation
          </h2>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Detail label="Cancelled by" value={row.cancelledBy ?? "—"} />
            <Detail
              label="Cancelled"
              value={row.cancelledAt.toLocaleString("en-CA")}
            />
          </dl>
          {row.cancelReason ? (
            <p className="mt-4 whitespace-pre-wrap border-t border-hl-border pt-4 text-sm text-hl-ink">
              {row.cancelReason}
            </p>
          ) : null}
        </section>
      ) : null}

      {row.emailError ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Notification issue:</strong> {row.emailError}
        </div>
      ) : null}

      {canReview ? (
        <LeaveDecisionForm
          requestId={row.id}
          employeeName={row.employeeName}
          dayCount={dayCount}
        />
      ) : null}

      {canCancel ? (
        <CancelLeaveForm
          requestId={row.id}
          dayCount={dayCount}
          isOwn={isOwn}
        />
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-hl-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-hl-ink">{value}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: "good" | "danger";
}) {
  const color =
    highlight === "danger"
      ? "text-red-700"
      : highlight === "good"
        ? "text-hl-green-700"
        : "text-hl-ink";
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-hl-muted">
        {label}
      </dt>
      <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>
        {formatDays(value)}
      </dd>
    </div>
  );
}
