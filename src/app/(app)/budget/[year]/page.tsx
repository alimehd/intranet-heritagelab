import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
  AlertCircle,
  Inbox,
  FileDown,
} from "lucide-react";
import {
  canApproveExpenseReports,
  canViewBudget,
} from "@/lib/budget/people";
import { normalizeEmail } from "@/lib/roles";
import {
  getBudgetGrid,
  getCashPosition,
  getFiscalYears,
  getReconciliationHealth,
} from "@/lib/budget/queries";
import { countPendingApprovals } from "@/lib/budget/er-queries";
import { getExpenseLedger, groupByFundingSource, groupByMonth } from "@/lib/budget/ledger";
import { BudgetTabs, BudgetYearSwitcher, parseYearParam } from "../BudgetNav";

export const metadata = { title: "Budget — Heritage Lab" };

const KIND_ORDER = ["service_contract", "grant", "donation", "other", "untagged"] as const;

const KIND_LABEL: Record<string, string> = {
  service_contract: "Service contracts",
  grant: "Grants",
  donation: "Donations",
  other: "Other",
  untagged: "Untagged",
};

const KIND_HINT: Record<string, string> = {
  service_contract: "Earned / more flexible",
  grant: "Typically restricted",
  donation: "Usually unrestricted",
  other: "",
  untagged: "Not assigned to a source yet",
};

const KIND_COLOR: Record<string, string> = {
  service_contract: "#2f6f4f",
  grant: "#c99a3c",
  donation: "#8a6fb0",
  other: "#5b7ba3",
  untagged: "#9a9a9a",
};

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

  const [allYears, grid, cash, health, pendingApprovals, expenseRows] =
    await Promise.all([
      getFiscalYears(),
      getBudgetGrid(year),
      getCashPosition(year),
      getReconciliationHealth(year),
      canApproveExpenseReports(session?.user?.email)
        ? countPendingApprovals(normalizeEmail(session?.user?.email ?? ""))
        : Promise.resolve(0),
      getExpenseLedger({ year, includeUnclassified: false }),
    ]);
  const availableYears = allYears.map((y) => y.year);

  const spendTotal = expenseRows.reduce((s, r) => s + r.cost, 0);
  const monthsWithSpend = groupByMonth(expenseRows).length || 1;
  const avgMonthlySpend = spendTotal / monthsWithSpend;
  const runwayMonths =
    cash?.currentBalance != null && avgMonthlySpend > 0
      ? cash.currentBalance / avgMonthlySpend
      : null;
  const fundingBreakdown = groupByFundingSource(expenseRows).filter((c) => c.total > 0);

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
            Overview of the {year} fiscal year — cash position, spend by
            funding source, and runway.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {grid ? (
            <Link
              href={`/budget/${year}/financial-report/pdf`}
              target="_blank"
              className="hl-btn-secondary"
              title="Funder-facing financial report — cash position, revenue by source, expenses by category. Good for grant applications."
            >
              <FileDown className="h-4 w-4" />
              Financial report (PDF)
            </Link>
          ) : null}
          <BudgetYearSwitcher year={year} availableYears={availableYears} />
        </div>
      </div>

      <BudgetTabs year={year} active="overview" />

      {grid ? (
        <>
          <CashPositionCard
            year={year}
            currentBalance={cash?.currentBalance ?? null}
            credits={cash?.totalCredits ?? 0}
            debits={cash?.totalDebits ?? 0}
            accountsCount={cash?.accountsCount ?? 0}
            transactionsCount={cash?.transactionsCount ?? 0}
          />

          {spendTotal > 0 ? (
            <SpendBreakdownCard
              year={year}
              breakdown={fundingBreakdown}
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
  currentBalance,
  credits,
  debits,
  accountsCount,
  transactionsCount,
}: {
  year: number;
  currentBalance: number | null;
  credits: number;
  debits: number;
  accountsCount: number;
  transactionsCount: number;
}) {
  const hasBankData = accountsCount > 0 && transactionsCount > 0;
  const net = credits - debits;
  return (
    <section className="hl-card p-5">
      <h2 className="text-base font-semibold tracking-tight text-hl-ink">
        Cash position
      </h2>
      {!hasBankData ? (
        <p className="mt-1 text-xs text-hl-muted">
          Import a TD CSV to populate credits, debits, and current balance.
        </p>
      ) : null}
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
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
    </section>
  );
}

type FundingSlice = {
  fundingSourceId: string | null;
  fundingSourceName: string;
  fundingSourceKind: string | null;
  total: number;
};

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
  breakdown: FundingSlice[];
  total: number;
  avgMonthlySpend: number;
  monthsWithSpend: number;
  currentBalance: number | null;
  runwayMonths: number | null;
}) {
  const kindTotals = new Map<string, number>();
  const byKind = new Map<string, FundingSlice[]>();
  for (const s of breakdown) {
    const kind = s.fundingSourceKind ?? "untagged";
    kindTotals.set(kind, (kindTotals.get(kind) ?? 0) + s.total);
    const list = byKind.get(kind) ?? [];
    list.push(s);
    byKind.set(kind, list);
  }

  const kindSlices = KIND_ORDER.filter((k) => (kindTotals.get(k) ?? 0) > 0).map(
    (kind) => ({
      kind,
      label: KIND_LABEL[kind],
      total: kindTotals.get(kind) ?? 0,
      color: KIND_COLOR[kind],
      hint: KIND_HINT[kind],
    }),
  );

  let cursor = 0;
  const stops = kindSlices.map((s) => {
    const pct = (s.total / total) * 100;
    const start = cursor;
    const end = cursor + pct;
    cursor = end;
    return { ...s, start, end, pct };
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
    runwayMonths === null
      ? ""
      : runwayMonths < 6
        ? "text-red-700"
        : runwayMonths < 12
          ? "text-amber-700"
          : "text-hl-ink";

  return (
    <section className="hl-card grid gap-6 p-5 md:grid-cols-2">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-hl-ink">
          Spend by funding source
        </h2>
        <p className="mt-1 text-xs text-hl-muted">
          {formatCad(total)} spent in {year}, grouped by grant vs service
          contract so you can see restricted vs more flexible spend.
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-5">
          <div
            className="h-32 w-32 shrink-0 rounded-full"
            style={{ backgroundImage: gradient }}
            role="img"
            aria-label="Pie chart of expense breakdown by funding source kind"
          />
          <ul className="flex-1 space-y-3 text-xs">
            {stops.map((s) => (
              <li key={s.kind}>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="flex-1 font-medium text-hl-ink">{s.label}</span>
                  <span className="shrink-0 tabular-nums text-hl-muted">
                    {formatCad(s.total)} · {s.pct.toFixed(0)}%
                  </span>
                </div>
                {s.hint ? (
                  <p className="mt-0.5 pl-[18px] text-[11px] text-hl-muted">
                    {s.hint}
                  </p>
                ) : null}
                <ul className="mt-1 space-y-0.5 pl-[18px] text-hl-muted">
                  {(byKind.get(s.kind) ?? []).map((src) => (
                    <li
                      key={src.fundingSourceId ?? "untagged"}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{src.fundingSourceName}</span>
                      <span className="shrink-0 tabular-nums">
                        {formatCad(src.total)}
                      </span>
                    </li>
                  ))}
                </ul>
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
