import Link from "next/link";
import { auth } from "@/auth";
import { CalendarPlus, CalendarDays, Inbox } from "lucide-react";
import { LeaveStatusBadge } from "@/components/LeaveStatusBadge";
import { formatDays, formatLong, formatRange, pluralDays } from "@/lib/leave/dates";
import { getHolidayPeriods } from "@/lib/leave/holidays";
import { canApproveLeave, findLeaveEmployee } from "@/lib/leave/people";
import {
  getBalancesFor,
  getRequestsFor,
  getTeamRequestsFor,
} from "@/lib/leave/queries";
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  type LeaveBalance,
  type LeaveType,
} from "@/lib/leave/schema";
import type { LeaveRequest } from "@/lib/db/schema";

export const metadata = { title: "Leave — Heritage Lab" };

/** Years offered in the switcher: last year through next year. */
function selectableYears(current: number): number[] {
  return [current - 1, current, current + 1];
}

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await auth();
  const { year: yearParam } = await searchParams;

  const currentYear = new Date().getUTCFullYear();
  const parsedYear = Number(yearParam);
  const leaveYear =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : currentYear;

  const employee = findLeaveEmployee(session?.user?.email);
  const isApprover = canApproveLeave(session?.user?.email);

  const [balances, myRequests, teamRequests] = await Promise.all([
    employee
      ? getBalancesFor(employee.email, leaveYear)
      : Promise.resolve(null),
    employee ? getRequestsFor(employee.email, leaveYear) : Promise.resolve([]),
    isApprover ? getTeamRequestsFor(leaveYear) : Promise.resolve([]),
  ]);

  const awaitingReview = teamRequests.filter((r) => r.status === "pending");
  const othersLeave = teamRequests.filter(
    (r) => !employee || r.employeeEmail !== employee.email,
  );
  const holidayPeriods = getHolidayPeriods(leaveYear);
  const todayISO = new Date().toISOString().slice(0, 10);
  const upcomingHolidays = holidayPeriods
    .filter((p) => p.end >= todayISO)
    .slice(0, 4);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-hl-ink">
            Leave
          </h1>
          <p className="mt-1 text-sm text-hl-muted">
            Vacation and sick days for {leaveYear}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-hl-border bg-white">
            {selectableYears(currentYear).map((y) => (
              <Link
                key={y}
                href={`/leave?year=${y}`}
                aria-current={y === leaveYear ? "page" : undefined}
                className={`px-3 py-2 text-sm font-medium transition ${
                  y === leaveYear
                    ? "bg-hl-green-600 text-white"
                    : "text-hl-muted hover:bg-hl-cream hover:text-hl-ink"
                }`}
              >
                {y}
              </Link>
            ))}
          </div>
          <Link href="/leave/new" className="hl-btn-primary">
            <CalendarPlus className="h-4 w-4" /> Book leave
          </Link>
        </div>
      </div>

      {balances ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {LEAVE_TYPES.map((type) => (
            <BalanceCard key={type} balance={balances[type]} year={leaveYear} />
          ))}
        </div>
      ) : (
        <div className="hl-card p-6">
          <h2 className="text-lg font-semibold tracking-tight text-hl-ink">
            No leave entitlement on this account
          </h2>
          <p className="mt-1 text-sm text-hl-muted">
            You can still see the paid holiday calendar below.
          </p>
        </div>
      )}

      {isApprover && awaitingReview.length > 0 ? (
        <section className="hl-card border-amber-200 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Inbox className="h-5 w-5 text-amber-700" />
            <h2 className="text-xl font-semibold tracking-tight text-hl-ink">
              Awaiting your approval
            </h2>
            <span className="hl-badge bg-amber-50 text-amber-800 ring-1 ring-amber-200">
              {awaitingReview.length}
            </span>
          </div>
          <RequestTable requests={awaitingReview} showEmployee />
        </section>
      ) : null}

      {employee ? (
        <section className="hl-card p-6">
          <h2 className="mb-4 text-xl font-semibold tracking-tight text-hl-ink">
            My leave in {leaveYear}
          </h2>
          {myRequests.length === 0 ? (
            <div className="rounded-md border border-dashed border-hl-border bg-hl-cream/60 px-4 py-10 text-center text-sm text-hl-muted">
              Nothing booked for {leaveYear} yet.{" "}
              <Link
                href="/leave/new"
                className="font-medium text-hl-green-700 underline-offset-2 hover:underline"
              >
                Book leave →
              </Link>
            </div>
          ) : (
            <RequestTable requests={myRequests} />
          )}
        </section>
      ) : null}

      {isApprover && othersLeave.length > 0 ? (
        <section className="hl-card p-6">
          <h2 className="mb-4 text-xl font-semibold tracking-tight text-hl-ink">
            Team leave in {leaveYear}
          </h2>
          <RequestTable requests={othersLeave} showEmployee />
        </section>
      ) : null}

      <section className="hl-card p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-hl-green-600" />
            <h2 className="text-xl font-semibold tracking-tight text-hl-ink">
              Paid holidays
            </h2>
          </div>
          <Link href={`/leave/holidays?year=${leaveYear}`} className="hl-btn-ghost">
            View all {holidayPeriods.length}
          </Link>
        </div>
        {upcomingHolidays.length === 0 ? (
          <p className="text-sm text-hl-muted">
            No paid holidays remain in {leaveYear}.
          </p>
        ) : (
          <ul className="divide-y divide-hl-border">
            {upcomingHolidays.map((p) => (
              <li
                key={`${p.name}-${p.start}`}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2 first:pt-0 last:pb-0"
              >
                <span className="text-sm font-medium text-hl-ink">
                  {p.name}
                </span>
                <span className="text-sm text-hl-muted">
                  {formatRange(p.start, p.end)}
                  {p.days > 1 ? ` · ${p.days} days off` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 border-t border-hl-border pt-3 text-xs text-hl-muted">
          The office is closed on these days. They are never charged against
          your vacation or sick entitlement.
        </p>
      </section>
    </div>
  );
}

function BalanceCard({
  balance,
  year,
}: {
  balance: LeaveBalance;
  year: number;
}) {
  const { entitled, used, pending, remaining } = balance;
  const usedPct = Math.min(100, (used / entitled) * 100);
  const pendingPct = Math.min(100 - usedPct, (pending / entitled) * 100);
  const overdrawn = remaining < 0;

  return (
    <div className="hl-card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold tracking-tight text-hl-ink">
          {LEAVE_TYPE_LABELS[balance.type]}
        </h2>
        <span className="text-xs uppercase tracking-wider text-hl-muted">
          {year}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          className={`text-3xl font-semibold tabular-nums ${
            overdrawn ? "text-red-700" : "text-hl-ink"
          }`}
        >
          {formatDays(remaining)}
        </span>
        <span className="text-sm text-hl-muted">
          of {formatDays(entitled)} days left
        </span>
      </div>

      <div
        className="mt-3 flex h-2 overflow-hidden rounded-full bg-hl-cream"
        role="img"
        aria-label={`${formatDays(used)} days taken, ${formatDays(pending)} days pending, of ${formatDays(entitled)}`}
      >
        <div
          className={overdrawn ? "bg-red-600" : "bg-hl-green-600"}
          style={{ width: `${usedPct}%` }}
        />
        <div className="bg-amber-400" style={{ width: `${pendingPct}%` }} />
      </div>

      <dl className="mt-3 flex gap-4 text-xs text-hl-muted">
        <div>
          <dt className="inline">Taken </dt>
          <dd className="inline font-medium text-hl-ink">
            {formatDays(used)}
          </dd>
        </div>
        {pending > 0 ? (
          <div>
            <dt className="inline">Pending </dt>
            <dd className="inline font-medium text-amber-700">
              {formatDays(pending)}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function RequestTable({
  requests,
  showEmployee = false,
}: {
  requests: LeaveRequest[];
  showEmployee?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="hl-table">
        <thead>
          <tr>
            {showEmployee ? <th>Employee</th> : null}
            <th>Dates</th>
            <th>Type</th>
            <th className="text-right">Days</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              {showEmployee ? (
                <td className="whitespace-nowrap">{r.employeeName}</td>
              ) : null}
              <td className="whitespace-nowrap">
                <Link
                  href={`/leave/${r.id}`}
                  className="text-hl-green-700 hover:underline"
                >
                  {r.startDate === r.endDate
                    ? formatLong(r.startDate)
                    : formatRange(r.startDate, r.endDate)}
                </Link>
              </td>
              <td className="whitespace-nowrap text-hl-muted">
                {LEAVE_TYPE_LABELS[r.leaveType as LeaveType] ?? r.leaveType}
                {r.halfDay ? " · half day" : ""}
              </td>
              <td className="text-right tabular-nums">
                {pluralDays(Number(r.dayCount))}
              </td>
              <td>
                <LeaveStatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
