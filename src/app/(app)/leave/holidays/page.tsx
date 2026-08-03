import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatLong, formatRange, weekday, WEEKDAY_NAMES } from "@/lib/leave/dates";
import { getHolidayPeriods } from "@/lib/leave/holidays";

export const metadata = { title: "Paid Holidays — Heritage Lab" };

function selectableYears(current: number): number[] {
  return [current - 1, current, current + 1];
}

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const currentYear = new Date().getUTCFullYear();
  const parsed = Number(yearParam);
  const year =
    Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100
      ? parsed
      : currentYear;

  const periods = getHolidayPeriods(year);
  const totalDays = periods.reduce((sum, p) => sum + p.days, 0);
  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/leave?year=${year}`} className="hl-btn-ghost -ml-3 mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to leave
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-hl-ink">
              Paid holidays {year}
            </h1>
            <p className="mt-1 text-sm text-hl-muted">
              {totalDays} paid days off across {periods.length} holiday periods.
              These are never charged against vacation or sick leave.
            </p>
          </div>
          <div className="flex overflow-hidden rounded-md border border-hl-border bg-white">
            {selectableYears(currentYear).map((y) => (
              <Link
                key={y}
                href={`/leave/holidays?year=${y}`}
                aria-current={y === year ? "page" : undefined}
                className={`px-3 py-2 text-sm font-medium transition ${
                  y === year
                    ? "bg-hl-green-600 text-white"
                    : "text-hl-muted hover:bg-hl-cream hover:text-hl-ink"
                }`}
              >
                {y}
              </Link>
            ))}
          </div>
        </div>
      </div>

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
            Booking leave across a holiday is safe — the holiday is skipped
            automatically and only true working days are charged.
          </li>
        </ul>
      </div>
    </div>
  );
}
