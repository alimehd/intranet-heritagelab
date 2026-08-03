import Link from "next/link";
import { auth } from "@/auth";
import { formatLong } from "@/lib/leave/dates";
import {
  buildCalendarDays,
  buildMonthGrids,
  countCalendarDays,
  type CalendarDay,
} from "@/lib/leave/calendar";
import { canApproveLeave, findLeaveEmployee } from "@/lib/leave/people";
import { getRequestsFor, getTeamRequestsFor } from "@/lib/leave/queries";
import { LeaveTabs, LeaveYearSwitcher, resolveYear } from "../LeaveNav";

export const metadata = { title: "Leave Calendar — Heritage Lab" };

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export default async function LeaveCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; view?: string }>;
}) {
  const session = await auth();
  const { year: yearParam, view } = await searchParams;

  const currentYear = new Date().getUTCFullYear();
  const year = resolveYear(yearParam, currentYear);

  const employee = findLeaveEmployee(session?.user?.email);
  const isApprover = canApproveLeave(session?.user?.email);
  // Approvers can widen the calendar to everyone; it defaults to their own.
  const teamView = isApprover && (view === "team" || !employee);

  const requests = teamView
    ? await getTeamRequestsFor(year)
    : employee
      ? await getRequestsFor(employee.email, year)
      : [];

  const days = buildCalendarDays({
    year,
    requests,
    showEmployee: teamView,
  });
  const months = buildMonthGrids(year);
  const totals = countCalendarDays(days);
  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-hl-ink">
            Calendar {year}
          </h1>
          <p className="mt-1 text-sm text-hl-muted">
            {teamView
              ? "Everyone's booked time off and the paid holidays."
              : "Your booked time off and the paid holidays."}
          </p>
        </div>
        <LeaveYearSwitcher
          basePath="/leave/calendar"
          year={year}
          currentYear={currentYear}
        />
      </div>

      <LeaveTabs active="/leave/calendar" year={year} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <LegendItem className="bg-hl-green-600" label="Vacation" />
          <LegendItem
            className="border border-dashed border-hl-green-600 bg-hl-green-100"
            label="Vacation (awaiting approval)"
          />
          <LegendItem className="bg-amber-500" label="Sick day" />
          <LegendItem className="bg-hl-green-200" label="Paid holiday" />
          <LegendItem className="bg-hl-cream" label="Weekend" />
        </div>

        {isApprover && employee ? (
          <div className="flex overflow-hidden rounded-md border border-hl-border bg-white">
            <Link
              href={`/leave/calendar?year=${year}`}
              aria-current={!teamView ? "page" : undefined}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                !teamView
                  ? "bg-hl-green-600 text-white"
                  : "text-hl-muted hover:bg-hl-cream hover:text-hl-ink"
              }`}
            >
              Just me
            </Link>
            <Link
              href={`/leave/calendar?year=${year}&view=team`}
              aria-current={teamView ? "page" : undefined}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                teamView
                  ? "bg-hl-green-600 text-white"
                  : "text-hl-muted hover:bg-hl-cream hover:text-hl-ink"
              }`}
            >
              Everyone
            </Link>
          </div>
        ) : null}
      </div>

      <div className="hl-card p-4 sm:p-6">
        <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {months.map((month) => (
            <div key={month.month}>
              <h2 className="mb-2 text-sm font-semibold tracking-tight text-hl-ink">
                {month.name}
              </h2>
              <table className="w-full table-fixed border-collapse">
                <thead>
                  <tr>
                    {WEEKDAY_INITIALS.map((initial, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="pb-1 text-center text-[10px] font-medium uppercase text-hl-muted"
                      >
                        <span aria-hidden="true">{initial}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {month.weeks.map((week, wi) => (
                    <tr key={wi}>
                      {week.map((date, di) => (
                        <td key={di} className="p-[1px]">
                          {date ? (
                            <DayCell
                              date={date}
                              day={days.get(date)}
                              weekend={di === 0 || di === 6}
                              isToday={date === todayISO}
                            />
                          ) : (
                            <span className="block h-7" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <TotalCard label="Vacation days marked" value={totals.vacation} />
        <TotalCard label="Sick days marked" value={totals.sick} />
        <TotalCard label="Paid holidays" value={totals.holidays} />
      </div>

      <p className="text-xs text-hl-muted">
        Weekends and paid holidays inside a booked range are left unmarked,
        because they are never charged against an entitlement. Click any marked
        day to open the underlying entry.
      </p>
    </div>
  );
}

function DayCell({
  date,
  day,
  weekend,
  isToday,
}: {
  date: string;
  day: CalendarDay | undefined;
  weekend: boolean;
  isToday: boolean;
}) {
  const dayNumber = Number(date.slice(8, 10));

  let tone = "text-hl-ink";
  if (weekend && !day) tone = "bg-hl-cream text-hl-muted";
  if (day?.kind === "holiday") tone = "bg-hl-green-200 text-hl-green-900";
  if (day?.kind === "sick") tone = "bg-amber-500 font-medium text-white";
  if (day?.kind === "vacation") {
    tone =
      day.status === "pending"
        ? "border border-dashed border-hl-green-600 bg-hl-green-100 text-hl-green-800"
        : "bg-hl-green-600 font-medium text-white";
  }

  const ring = isToday ? " ring-2 ring-hl-ink ring-offset-1" : "";
  const title = day ? `${formatLong(date)} — ${day.label}` : formatLong(date);

  const cell = (
    <span
      className={`flex h-7 items-center justify-center rounded text-xs tabular-nums ${tone}${ring}`}
      title={title}
    >
      {dayNumber}
    </span>
  );

  if (day?.requestId) {
    return (
      <Link
        href={`/leave/${day.requestId}`}
        className="block rounded transition hover:opacity-80"
      >
        <span className="sr-only">{title}</span>
        <span aria-hidden="true">{cell}</span>
      </Link>
    );
  }

  return cell;
}

function LegendItem({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-hl-muted">
      <span className={`h-3.5 w-3.5 rounded ${className}`} />
      {label}
    </span>
  );
}

function TotalCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="hl-card p-4">
      <div className="text-sm text-hl-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-hl-ink">
        {value}
      </div>
    </div>
  );
}
