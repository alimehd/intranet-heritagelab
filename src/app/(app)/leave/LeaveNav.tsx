import Link from "next/link";

/** Shared chrome for the vacation and sick days section. */

const TABS = [
  { href: "/leave", label: "Overview" },
  { href: "/leave/calendar", label: "Calendar" },
  { href: "/leave/holidays", label: "Paid holidays" },
] as const;

export type LeaveTabHref = (typeof TABS)[number]["href"];

export function LeaveTabs({
  active,
  year,
}: {
  active: LeaveTabHref;
  year: number;
}) {
  return (
    <nav className="flex gap-1 border-b border-hl-border">
      {TABS.map((tab) => {
        const selected = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={`${tab.href}?year=${year}`}
            aria-current={selected ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              selected
                ? "border-hl-green-600 text-hl-green-700"
                : "border-transparent text-hl-muted hover:border-hl-border hover:text-hl-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function LeaveYearSwitcher({
  basePath,
  year,
  currentYear,
}: {
  basePath: string;
  year: number;
  currentYear: number;
}) {
  const years = [currentYear - 1, currentYear, currentYear + 1];
  return (
    <div className="flex overflow-hidden rounded-md border border-hl-border bg-white">
      {years.map((y) => (
        <Link
          key={y}
          href={`${basePath}?year=${y}`}
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
  );
}

/** Clamps a ?year= query value to a sane range, falling back to this year. */
export function resolveYear(
  raw: string | undefined,
  currentYear: number,
): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100
    ? parsed
    : currentYear;
}
