import { Fragment } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Wallet, Lock } from "lucide-react";
import { canEditBudget, canViewBudget } from "@/lib/budget/people";
import {
  getBudgetGrid,
  getFiscalYears,
  getRevenueGrid,
} from "@/lib/budget/queries";
import type { BudgetGrid, RevenueGrid } from "@/lib/budget/queries";
import {
  BudgetTabs,
  BudgetYearSwitcher,
  parseYearParam,
} from "../../BudgetNav";

export const metadata = { title: "Budget — Heritage Lab" };

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default async function BudgetGridPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const session = await auth();
  if (!canViewBudget(session?.user?.email)) notFound();

  const { year: yearParam } = await params;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const [grid, revenue, allYears] = await Promise.all([
    getBudgetGrid(year),
    getRevenueGrid(year),
    getFiscalYears(),
  ]);
  const availableYears = allYears.map((y) => y.year);
  const editable = canEditBudget(session?.user?.email);

  const openingBalance = grid?.fiscalYear.openingBalance
    ? Number(grid.fiscalYear.openingBalance)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-hl-ink">
            <Wallet className="h-7 w-7 text-hl-green-600" />
            Budget {year}
          </h1>
          <p className="mt-1 text-sm text-hl-muted">
            Projected receipts &amp; disbursements by month.{" "}
            {editable ? "You have edit access." : "Read-only view."}
          </p>
        </div>
        <BudgetYearSwitcher
          year={year}
          availableYears={availableYears}
          subPath="/budget"
        />
      </div>

      <BudgetTabs year={year} active="budget" />

      {grid ? (
        <>
          {revenue && revenue.rows.length > 0 ? (
            <RevenueTable revenue={revenue} />
          ) : null}
          <DisbursementTable grid={grid} />
          <ProjectedClosingCard
            openingBalance={openingBalance}
            receipts={revenue?.annualTotal ?? 0}
            disbursements={grid.annualTotal}
          />
        </>
      ) : (
        <UnseededYear year={year} />
      )}
    </div>
  );
}

function UnseededYear({ year }: { year: number }) {
  return (
    <div className="hl-card p-6">
      <h2 className="text-lg font-semibold tracking-tight text-hl-ink">
        No budget on file for {year}
      </h2>
      <p className="mt-2 text-sm text-hl-muted">
        The {year} fiscal year hasn&rsquo;t been seeded yet. Run{" "}
        <code className="rounded bg-hl-cream px-1 py-0.5 text-xs">
          npm run seed:budget
        </code>{" "}
        to import the 2026 baseline, or pick another year above.
      </p>
    </div>
  );
}

function RevenueTable({ revenue }: { revenue: RevenueGrid }) {
  return (
    <section className="hl-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hl-border px-5 py-3">
        <h2 className="text-base font-semibold tracking-tight text-hl-ink">
          Projected receipts (grants, contracts, donations)
        </h2>
        <div className="text-xs text-hl-muted">
          Annual{" "}
          <span className="ml-1 font-semibold tabular-nums text-hl-ink">
            {formatCad(revenue.annualTotal)}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-hl-border bg-hl-cream text-xs font-semibold uppercase tracking-wide text-hl-muted">
              <th className="sticky left-0 z-10 bg-hl-cream px-3 py-2 text-left">
                Source
              </th>
              {MONTHS.map((m) => (
                <th key={m} className="px-2 py-2 text-right tabular-nums">
                  {m}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Annual</th>
            </tr>
          </thead>
          <tbody>
            {revenue.rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-hl-border last:border-b-0 hover:bg-hl-cream/30"
              >
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-hl-ink">
                  <div className="flex items-baseline gap-2">
                    <span>{r.name}</span>
                    <span className="text-[10px] uppercase tracking-wider text-hl-muted">
                      {r.kind.replace("_", " ")}
                    </span>
                  </div>
                </td>
                {r.monthly.map((v, i) => (
                  <td key={i} className="px-2 py-1.5 text-right tabular-nums text-hl-ink">
                    {formatCell(v)}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right font-medium tabular-nums text-hl-ink">
                  {formatCell(r.annual)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-hl-green-600 text-white">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-hl-green-600 px-3 py-2 text-left text-sm font-semibold uppercase tracking-wide"
              >
                Total receipts
              </th>
              {revenue.monthlyTotals.map((v, i) => (
                <td
                  key={i}
                  className="px-2 py-2 text-right font-semibold tabular-nums"
                >
                  {formatCell(v)}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                {formatCell(revenue.annualTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function DisbursementTable({ grid }: { grid: BudgetGrid }) {
  return (
    <section className="hl-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hl-border px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold tracking-tight text-hl-ink">
            Projected disbursements
          </h2>
          {grid.fiscalYear.isLocked ? (
            <span className="hl-badge bg-amber-50 text-amber-800 ring-1 ring-amber-200">
              <Lock className="mr-1 h-3 w-3" />
              Locked
            </span>
          ) : null}
        </div>
        <div className="text-xs text-hl-muted">
          Annual{" "}
          <span className="ml-1 font-semibold tabular-nums text-hl-ink">
            {formatCad(grid.annualTotal)}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-hl-border bg-hl-cream text-xs font-semibold uppercase tracking-wide text-hl-muted">
              <th className="sticky left-0 z-10 bg-hl-cream px-3 py-2 text-left">
                Line
              </th>
              {MONTHS.map((m) => (
                <th key={m} className="px-2 py-2 text-right tabular-nums">
                  {m}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Annual</th>
            </tr>
          </thead>
          <tbody>
            {grid.categories.map((cat) => (
              <Fragment key={cat.id}>
                <tr className="border-b border-hl-border bg-hl-cream/50">
                  <th
                    scope="rowgroup"
                    className="sticky left-0 z-10 bg-hl-cream/95 px-3 py-2 text-left text-sm font-semibold text-hl-ink"
                  >
                    <span className="mr-2 text-hl-muted">{cat.code}</span>
                    {cat.name}
                  </th>
                  {cat.monthlyTotals.map((v, i) => (
                    <td
                      key={i}
                      className="px-2 py-2 text-right font-semibold tabular-nums text-hl-ink"
                    >
                      {formatCell(v)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-hl-ink">
                    {formatCell(cat.annualTotal)}
                  </td>
                </tr>
                {cat.lines.map((line, lineIdx) => (
                  <tr
                    key={line.id}
                    className={`border-b border-hl-border hover:bg-hl-cream/30 ${
                      lineIdx === cat.lines.length - 1 ? "border-b-2" : ""
                    }`}
                  >
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-hl-ink">
                      <div className="flex items-baseline gap-2 pl-4">
                        <span className="text-xs font-medium text-hl-muted">
                          {line.fullCode}
                        </span>
                        <span>{line.name}</span>
                      </div>
                    </td>
                    {line.monthly.map((v, i) => (
                      <td
                        key={i}
                        className="px-2 py-1.5 text-right tabular-nums text-hl-ink"
                      >
                        {formatCell(v)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums text-hl-ink">
                      {formatCell(line.annual)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-hl-green-600 text-white">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-hl-green-600 px-3 py-2 text-left text-sm font-semibold uppercase tracking-wide"
              >
                Total disbursements
              </th>
              {grid.monthlyTotals.map((v, i) => (
                <td
                  key={i}
                  className="px-2 py-2 text-right font-semibold tabular-nums"
                >
                  {formatCell(v)}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                {formatCell(grid.annualTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function ProjectedClosingCard({
  openingBalance,
  receipts,
  disbursements,
}: {
  openingBalance: number | null;
  receipts: number;
  disbursements: number;
}) {
  const opening = openingBalance ?? 0;
  const closing = opening + receipts - disbursements;
  return (
    <section className="hl-card p-5">
      <h2 className="text-base font-semibold tracking-tight text-hl-ink">
        Projected closing cash balance
      </h2>
      <p className="mt-1 text-xs text-hl-muted">
        Opening + projected receipts − projected disbursements. Update the
        opening balance from the year overview once the actual number is known.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-4">
        <Stat
          label="Opening"
          value={openingBalance === null ? "not set" : formatCad(openingBalance)}
          muted={openingBalance === null}
        />
        <Stat label="Projected receipts" value={formatCad(receipts)} />
        <Stat label="Projected disbursements" value={formatCad(disbursements)} />
        <Stat
          label="Projected closing"
          value={formatCad(closing)}
          emphasis={closing < 0 ? "danger" : "primary"}
        />
      </dl>
    </section>
  );
}

function Stat({
  label,
  value,
  emphasis = "default",
  muted = false,
}: {
  label: string;
  value: string;
  emphasis?: "default" | "primary" | "danger";
  muted?: boolean;
}) {
  const cls =
    emphasis === "danger"
      ? "text-red-700"
      : emphasis === "primary"
        ? "text-hl-green-700"
        : muted
          ? "text-hl-muted"
          : "text-hl-ink";
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-hl-muted">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold tabular-nums ${cls}`}>{value}</dd>
    </div>
  );
}

function formatCad(v: number): string {
  return v.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });
}

function formatCell(v: number): string {
  if (!v) return "—";
  return v.toLocaleString("en-CA", { maximumFractionDigits: 0 });
}
