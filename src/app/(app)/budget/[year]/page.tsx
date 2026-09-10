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

  const [allYears, grid, revenue, cash, health, pendingApprovals] =
    await Promise.all([
      getFiscalYears(),
      getBudgetGrid(year),
      getRevenueGrid(year),
      getCashPosition(year),
      getReconciliationHealth(year),
      canApproveExpenseReports(session?.user?.email)
        ? countPendingApprovals(normalizeEmail(session?.user?.email ?? ""))
        : Promise.resolve(0),
    ]);
  const availableYears = allYears.map((y) => y.year);
  const editable = canEditBudget(session?.user?.email);

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
