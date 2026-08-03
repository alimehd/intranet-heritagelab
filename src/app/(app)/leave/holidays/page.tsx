import { formatLong, formatRange, weekday, WEEKDAY_NAMES } from "@/lib/leave/dates";
import { getHolidayPeriods } from "@/lib/leave/holidays";
import { LeaveTabs, LeaveYearSwitcher, resolveYear } from "../LeaveNav";

export const metadata = { title: "Paid Holidays — Heritage Lab" };

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const currentYear = new Date().getUTCFullYear();
  const year = resolveYear(yearParam, currentYear);

  const periods = getHolidayPeriods(year);
  const totalDays = periods.reduce((sum, p) => sum + p.days, 0);
  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-hl-ink">
            Paid holidays {year}
          </h1>
          <p className="mt-1 text-sm text-hl-muted">
            {totalDays} paid days off across {periods.length} holiday periods.
            These are never charged against vacation or sick days.
          </p>
        </div>
        <LeaveYearSwitcher
          basePath="/leave/holidays"
          year={year}
          currentYear={currentYear}
        />
      </div>

      <LeaveTabs active="/leave/holidays" year={year} />

      <div className="hl-card p-0">
        <div className="overflow-x-auto">
          <table className="hl-table">
            <thead>
              <tr>
                <th>Holiday</th>
                <th>Dates</th>
                <th>Day</th>
                <th className="text-right">Days off</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const past = p.end < todayISO;
                return (
                  <tr
                    key={`${p.name}-${p.start}`}
                    className={past ? "text-hl-muted" : undefined}
                  >
                    <td className="font-medium">
                      {p.name}
                      {p.observedFor ? (
                        <span className="block text-xs font-normal text-hl-muted">
                          Falls on {formatLong(p.observedFor)}, observed the
                          following Monday
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap">
                      {p.start === p.end
                        ? formatLong(p.start)
                        : formatRange(p.start, p.end)}
                    </td>
                    <td className="whitespace-nowrap text-hl-muted">
                      {p.days === 1 ? WEEKDAY_NAMES[weekday(p.start)] : "—"}
                    </td>
                    <td className="text-right tabular-nums">{p.days}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hl-card p-6">
        <h2 className="text-lg font-semibold tracking-tight text-hl-ink">
          How these are applied
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-hl-muted">
          <li>
            The office closes from <strong>December 22 to January 2</strong>.
            Only the working days in that span are listed, since weekends are not
            extra days off.
          </li>
          <li>
            When a fixed-date holiday such as Canada Day falls on a weekend, the
            day off moves to the following Monday and is marked{" "}
            <em>observed</em>.
          </li>
          <li>
            Booking time off across a holiday is safe — the holiday is skipped
            automatically and only true working days are charged.
          </li>
        </ul>
      </div>
    </div>
  );
}
