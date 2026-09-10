import Link from "next/link";

/**
 * Shared chrome for the Budget section. Tabs marked `soon` are placeholders
 * for future phases so the eventual URL layout is visible from day one.
 */

const TABS = [
  { key: "overview", label: "Overview", path: "", soon: false },
  { key: "budget", label: "Budget", path: "/budget", soon: false },
  { key: "grants", label: "Grants & Contracts", path: "/grants", soon: false },
  { key: "bank", label: "Bank", path: "/bank", soon: false },
  { key: "reports", label: "Expense Reports", path: "/reports", soon: false },
] as const;

export type BudgetTabKey = (typeof TABS)[number]["key"];

export function BudgetTabs({
  year,
  active,
}: {
  year: number;
  active: BudgetTabKey;
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-hl-border">
      {TABS.map((tab) => {
        const selected = tab.key === active;
        const inner = (
          <span className="flex items-center gap-2">
            {tab.label}
            {tab.soon ? (
              <span className="rounded bg-hl-cream px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-hl-muted">
                Soon
              </span>
            ) : null}
          </span>
        );
        const className = `-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
          selected
            ? "border-hl-green-600 text-hl-green-700"
            : "border-transparent text-hl-muted hover:border-hl-border hover:text-hl-ink"
        }`;
        if (tab.soon) {
          return (
            <span
              key={tab.key}
              aria-disabled
              className={`${className} cursor-not-allowed`}
            >
              {inner}
            </span>
          );
        }
        return (
          <Link
            key={tab.key}
            href={`/budget/${year}${tab.path}`}
            aria-current={selected ? "page" : undefined}
            className={className}
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}

export function BudgetYearSwitcher({
  year,
  availableYears,
  subPath = "",
}: {
  year: number;
  availableYears: number[];
  /** Preserve the current sub-tab when hopping years, e.g. "/grants". */
  subPath?: string;
}) {
  const currentYear = new Date().getUTCFullYear();
  const years = Array.from(
    new Set([currentYear - 1, currentYear, currentYear + 1, ...availableYears]),
  ).sort((a, b) => a - b);

  return (
    <div className="flex overflow-hidden rounded-md border border-hl-border bg-white">
      {years.map((y) => (
        <Link
          key={y}
          href={`/budget/${y}${subPath}`}
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

/** Clamp a URL segment to a sane fiscal year. */
export function parseYearParam(raw: string | undefined): number | null {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) return null;
  return parsed;
}
