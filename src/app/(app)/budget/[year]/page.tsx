import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
  Banknote,
  Landmark,
  AlertCircle,
  Inbox,
} from "lucide-react";
import {
  canApproveExpenseReports,
  canEditBudget,
  canViewBudget,
} from "@/lib/budget/people";
import { normalizeEmail } from "@/lib/roles";
import {
  getBudgetGrid,
  getCashPosition,
  getFiscalYears,
  getFundingSources,
  getReconciliationHealth,
  getRevenueGrid,
} from "@/lib/budget/queries";
import { countPendingApprovals } from "@/lib/budget/er-queries";
import { getExpenseLedger, groupByCategory, groupByMonth } from "@/lib/budget/ledger";
import { BudgetTabs, BudgetYearSwitcher, parseYearParam } from "../BudgetNav";
import { OpeningBalanceForm } from "./OpeningBalanceForm";

export const metadata = { title: "Budget — Heritage Lab" };

export default async function BudgetOverviewPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const session = await auth();
  if (!canViewBudget(session?.user?.email)) notFound();

  const { year: yearParam } = await params;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const [allYears, grid, revenue, cash, health, pendingApprovals, expenseRows] =
    await Promise.all([
      getFiscalYears(),
      getBudgetGrid(year),
      getRevenueGrid(year),
      getCashPosition(year),
      getReconciliationHealth(year),
      canApproveExpenseReports(session?.user?.email)
        ? countPendingApprovals(normalizeEmail(session?.user?.email ?? ""))
        : Promise.resolve(0),
      getExpenseLedger({ year, includeUnclassified: false }),
    ]);
  const availableYears = allYears.map((y) => y.year);
  const editable = canEditBudget(session?.user?.email);

  // ---- Spend breakdown & runway ----
  const spendTotal = expenseRows.reduce((s, r) => s + r.cost, 0);
  const monthsWithSpend = groupByMonth(expenseRows).length || 1;
  const avgMonthlySpend = spendTotal / monthsWithSpend;
  const runwayMonths =
    cash?.currentBalance != null && avgMonthlySpend > 0
      ? cash.currentBalance / avgMonthlySpend
      : null;
  const categoryBreakdown = groupByCategory(expenseRows).filter((c) => c.total > 0);

  const grantsCount = grid
    ? (await getFundingSources(grid.fiscalYear.id)).length
    : 0;

  const unclassified =
    health.find((r) => r.classification === "unclassified")?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-hl-ink">
            <Wallet className="h-7 w-7 text-hl-green-600" />
            Budget {year}
          </h1>
          <p className="mt-1 text-sm text-hl-muted">
            Overview of the {year} fiscal year — cash position, projected
            receipts, projected disbursements, and reconciliation health.
          </p>
        </div>
        <BudgetYearSwitcher year={year} availableYears={availableYears} />
      </div>

      <BudgetTabs year={year} active="overview" />

      {grid ? (
        <>
          <CashPositionCard
            year={year}
            openingBalance={cash?.openingBalance ?? null}
            currentBalance={cash?.currentBalance ?? null}
            credits={cash?.totalCredits ?? 0}
            debits={cash?.totalDebits ?? 0}
            accountsCount={cash?.accountsCount ?? 0}
            transactionsCount={cash?.transactionsCount ?? 0}
            editable={editable}
          />

          {spendTotal > 0 ? (
            <SpendBreakdownCard
              year={year}
              breakdown={categoryBreakdown}
              total={spendTotal}
              avgMonthlySpend={avgMonthlySpend}
              monthsWithSpend={monthsWithSpend}
              currentBalance={cash?.currentBalance ?? null}
              runwayMonths={runwayMonths}
            />
          ) : null}

          {unclassified > 0 ? (
            <ReconciliationAlert year={year} unclassified={unclassified} />
          ) : null}
          {pendingApprovals > 0 ? (
            <ApprovalsAlert year={year} count={pendingApprovals} />
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <QuickCard
              href={`/budget/${year}/budget`}
              icon={<Wallet className="h-5 w-5 text-hl-green-600" />}
              title="Budget grid"
              value={formatCad(grid.annualTotal)}
              caption={`Projected disbursements · ${grid.categories.length} categories`}
            />
            <QuickCard
              href={`/budget/${year}/grants`}
              icon={<Landmark className="h-5 w-5 text-hl-green-600" />}
              title="Grants & contracts"
              value={formatCad(revenue?.annualTotal ?? 0)}
              caption={`${grantsCount} funding source${grantsCount === 1 ? "" : "s"} projected`}
            />
            <QuickCard
              href={`/budget/${year}/bank`}
              icon={<Banknote className="h-5 w-5 text-hl-green-600" />}
              title="Bank ledger"
              value={String(cash?.transactionsCount ?? 0)}
              caption={
                cash && cash.accountsCount > 0
                  ? `${cash.accountsCount} account${cash.accountsCount === 1 ? "" : "s"} · txns imported for ${year}`
                  : "No accounts yet — import a TD CSV to get started"
              }
            />
            <QuickCard
              href={`/budget/${year}/reports`}
              icon={<Inbox className="h-5 w-5 text-hl-green-600" />}
              title="Expense reports"
              value={
                pendingApprovals > 0
                  ? `${pendingApprovals} pending`
                  : "Open reports"
              }
              caption={
                pendingApprovals > 0
                  ? "Awaiting your approval"
                  : "Draft, submit, approve, and pay reimbursements"
              }
            />
          </div>
        </>
      ) : (
        <div className="hl-card p-6">
          <h2 className="text-lg font-semibold tracking-tight text-hl-ink">
            No budget on file for {year}
          </h2>
          <p className="mt-2 text-sm text-hl-muted">
            Run{" "}
            <code className="rounded bg-hl-cream px-1 py-0.5 text-xs">
              npm run seed:budget
            </code>{" "}
            to import the 2026 baseline, or pick another year above.
          </p>
        </div>
      )}
    </div>
  );
}

function CashPositionCard({
  year,
  openingBalance,
  currentBalance,
  credits,
  debits,
  accountsCount,
  transactionsCount,
  editable,
}: {
  year: number;
  openingBalance: number | null;
  currentBalance: number | null;
  credits: number;
  debits: number;
  accountsCount: number;
  transactionsCount: number;
  editable: boolean;
}) {
  const hasBankData = accountsCount > 0 && transactionsCount > 0;
  const net = credits - debits;
  return (
    <section className="hl-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-hl-ink">
          Cash position
        </h2>
        <p className="text-xs text-hl-muted">
          {hasBankData
            ? `Derived from ${transactionsCount} bank transaction${transactionsCount === 1 ? "" : "s"} across ${accountsCount} account${accountsCount === 1 ? "" : "s"}.`
            : "Import a TD CSV to populate credits, debits, and current balance."}
        </p>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-4">
        <Stat
          icon={<Coins className="h-4 w-4" />}
          label={`Opening ${year}`}
          value={openingBalance === null ? "—" : formatCad(openingBalance)}
          muted={openingBalance === null}
        />
        <Stat
          icon={<ArrowDownRight className="h-4 w-4 text-hl-green-700" />}
          label="YTD credits"
          value={formatCad(credits)}
        />
        <Stat
          icon={<ArrowUpRight className="h-4 w-4 text-red-700" />}
          label="YTD debits"
          value={formatCad(debits)}
        />
        <Stat
          icon={<Banknote className="h-4 w-4" />}
          label="Current balance"
          value={currentBalance === null ? "—" : formatCad(currentBalance)}
          muted={currentBalance === null}
          emphasis={
            currentBalance !== null && currentBalance < 0 ? "danger" : "primary"
          }
        />
      </dl>
      {hasBankData ? (
        <p className="mt-3 text-xs text-hl-muted">
          Net for {year}:{" "}
          <span className={net < 0 ? "font-medium text-red-700" : "font-medium text-hl-ink"}>
            {formatCad(net)}
          </span>
        </p>
      ) : null}

      {editable ? (
        <div className="mt-5 border-t border-hl-border pt-4">
          <OpeningBalanceForm year={year} openingBalance={openingBalance} />
        </div>
      ) : null}
    </section>
  );
}

const PIE_COLORS = [
  "#2f6f4f", // hl-green-700
  "#4f9d6d", // hl-green-500
  "#8fc79f", // hl-green-300
  "#c99a3c", // amber
  "#b56576", // rose
  "#5b7ba3", // slate blue
  "#8a6fb0", // violet
  "#9a9a9a", // gray — "Other"
];

function SpendBreakdownCard({
  year,
  breakdown,
  total,
  avgMonthlySpend,
  monthsWithSpend,
  currentBalance,
  runwayMonths,
}: {
  year: number;
  breakdown: Array<{ categoryCode: string; categoryName: string; total: number }>;
  total: number;
  avgMonthlySpend: number;
  monthsWithSpend: number;
  currentBalance: number | null;
  runwayMonths: number | null;
}) {
  // Keep the chart legible: top 6 categories + an "Other" bucket for the rest.
  const MAX_SLICES = 6;
  const sorted = [...breakdown].sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, MAX_SLICES);
  const restTotal = sorted.slice(MAX_SLICES).reduce((s, c) => s + c.total, 0);
  const slices =
    restTotal > 0
      ? [...top, { categoryCode: "other", categoryName: "Other categories", total: restTotal }]
      : top;

  let cursor = 0;
  const stops = slices.map((s, i) => {
    const pct = (s.total / total) * 100;
    const start = cursor;
    const end = cursor + pct;
    cursor = end;
    return { ...s, color: PIE_COLORS[i % PIE_COLORS.length], start, end, pct };
  });
  const gradient = `conic-gradient(${stops
    .map((s) => `${s.color} ${s.start}% ${s.end}%`)
    .join(", ")})`;

  const runwayLabel =
    runwayMonths === null
      ? "—"
      : runwayMonths >= 120
        ? "120+ mo"
        : `${runwayMonths.toFixed(1)} mo`;
  const runwayTone =
    runwayMonths === null ? "" : runwayMonths < 6 ? "text-red-700" : runwayMonths < 12 ? "text-amber-700" : "text-hl-ink";

  return (
    <section className="hl-card grid gap-6 p-5 md:grid-cols-2">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-hl-ink">
          Spend breakdown
        </h2>
        <p className="mt-1 text-xs text-hl-muted">
          {formatCad(total)} spent in {year} across classified bank expenses
          and paid expense reports.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-5">
          <div
            className="h-32 w-32 shrink-0 rounded-full"
            style={{ backgroundImage: gradient }}
            role="img"
            aria-label="Pie chart of expense breakdown by category"
          />
          <ul className="flex-1 space-y-1.5 text-xs">
            {stops.map((s) => (
              <li key={s.categoryCode} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 truncate text-hl-ink">
                  {s.categoryName}
                </span>
                <span className="shrink-0 tabular-nums text-hl-muted">
                  {formatCad(s.total)} · {s.pct.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-hl-border pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
        <h2 className="text-base font-semibold tracking-tight text-hl-ink">
          Runway
        </h2>
        <p className="mt-1 text-xs text-hl-muted">
          Current balance divided by the average monthly spend so far in{" "}
          {year} ({monthsWithSpend} month{monthsWithSpend === 1 ? "" : "s"} of
          data).
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs uppercase tracking-wider text-hl-muted">
              Avg. monthly spend
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-hl-ink">
              {formatCad(avgMonthlySpend)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-hl-muted">
              Runway
            </dt>
            <dd className={`mt-1 text-lg font-semibold tabular-nums ${runwayTone}`}>
              {runwayLabel}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-hl-muted">
          Based on a current balance of{" "}
          {currentBalance === null ? "—" : formatCad(currentBalance)}.
          Runway shrinks if spend accelerates or grant receipts slow down —
          treat it as a rough guide, not a forecast.
        </p>
      </div>
    </section>
  );
}

function ApprovalsAlert({ year, count }: { year: number; count: number }) {
  return (
    <section className="hl-card border-blue-300 bg-blue-50/60 p-5">
      <div className="flex items-start gap-3">
        <Inbox className="mt-0.5 h-5 w-5 text-blue-700" />
        <div className="flex-1">
          <h2 className="text-base font-semibold tracking-tight text-hl-ink">
            {count} expense report{count === 1 ? "" : "s"} awaiting your approval
          </h2>
          <p className="mt-1 text-sm text-hl-muted">
            The submitter is blocked on payment until you approve or reject.
          </p>
        </div>
        <Link
          href={`/budget/${year}/reports?scope=approvals&status=submitted`}
          className="hl-btn-primary"
        >
          Review
        </Link>
      </div>
    </section>
  );
}

function ReconciliationAlert({
  year,
  unclassified,
}: {
  year: number;
  unclassified: number;
}) {
  return (
    <section className="hl-card border-amber-300 bg-amber-50/60 p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
        <div className="flex-1">
          <h2 className="text-base font-semibold tracking-tight text-hl-ink">
            {unclassified} bank txn{unclassified === 1 ? "" : "s"} need classifying
          </h2>
          <p className="mt-1 text-sm text-hl-muted">
            Unclassified rows don&rsquo;t count toward spend-to-date or grant
            coverage until you tag them.
          </p>
        </div>
        <Link
          href={`/budget/${year}/bank?classification=unclassified`}
          className="hl-btn-primary"
        >
          Review
        </Link>
      </div>
    </section>
  );
}

function QuickCard({
  href,
  icon,
  title,
  value,
  caption,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  value: string;
  caption: string;
}) {
  return (
    <Link
      href={href}
      className="hl-card block p-5 transition hover:border-hl-green-600 hover:shadow-md"
    >
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-hl-ink">{title}</h3>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-hl-ink">
        {value}
      </p>
      <p className="mt-1 text-xs text-hl-muted">{caption}</p>
    </Link>
  );
}

function Stat({
  icon,
  label,
  value,
  emphasis = "default",
  muted = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  emphasis?: "default" | "primary" | "danger";
  muted?: boolean;
}) {
  const cls =
    emphasis === "danger"
      ? "text-red-700"
      : emphasis === "primary"
        ? "text-hl-ink"
        : muted
          ? "text-hl-muted"
          : "text-hl-ink";
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-hl-muted">
        {icon}
        {label}
      </dt>
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
