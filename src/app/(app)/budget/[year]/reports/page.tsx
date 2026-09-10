import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { FilePlus, Inbox } from "lucide-react";
import {
  canApproveExpenseReports,
  canEditBudget,
  canViewBudget,
} from "@/lib/budget/people";
import { normalizeEmail } from "@/lib/roles";
import { getFiscalYear, getFiscalYears } from "@/lib/budget/queries";
import { listExpenseReports } from "@/lib/budget/er-queries";
import {
  EXPENSE_REPORT_STATUSES,
  EXPENSE_REPORT_STATUS_LABELS,
  type ExpenseReportStatus,
} from "@/lib/budget/er-schema";
import { BudgetTabs, BudgetYearSwitcher, parseYearParam } from "../../BudgetNav";

export const metadata = { title: "Expense Reports — Heritage Lab" };

const STATUS_TAB_ORDER: (ExpenseReportStatus | "all")[] = [
  "submitted",
  "draft",
  "rejected",
  "approved",
  "paid",
  "cancelled",
  "all",
];

export default async function ExpenseReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<{ status?: string; scope?: string }>;
}) {
  const session = await auth();
  const actor = session?.user?.email;
  if (!canViewBudget(actor)) notFound();

  const { year: yearParam } = await params;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const { status: statusParam, scope: scopeParam } = await searchParams;
  const status =
    statusParam && (STATUS_TAB_ORDER as string[]).includes(statusParam)
      ? (statusParam as ExpenseReportStatus | "all")
      : "submitted";

  const [fy, allYears] = await Promise.all([getFiscalYear(year), getFiscalYears()]);
  const availableYears = allYears.map((y) => y.year);

  const canSubmit = canEditBudget(actor);
  const canApprove = canApproveExpenseReports(actor);
  const scope: "mine" | "approvals" | "all" =
    scopeParam === "mine" || scopeParam === "approvals" || scopeParam === "all"
      ? (scopeParam as "mine" | "approvals" | "all")
      : canApprove
        ? "approvals"
        : canSubmit
          ? "mine"
          : "all";

  const filters: Parameters<typeof listExpenseReports>[0] = {
    fiscalYearId: fy?.id,
    includeCancelled: status === "cancelled" || status === "all",
  };
  if (status !== "all") filters.status = status as ExpenseReportStatus;
  if (scope === "mine" && session?.user?.id) {
    filters.submitterUserId = session.user.id;
  }
  if (scope === "approvals" && actor) {
    filters.approverEmail = normalizeEmail(actor);
  }

  const reports = fy ? await listExpenseReports(filters) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-hl-ink">
            <Inbox className="h-7 w-7 text-hl-green-600" />
            Expense reports {year}
          </h1>
          <p className="mt-1 text-sm text-hl-muted">
            Monthly reimbursement submissions — draft, submit for approval, and
            track through payment.
          </p>
        </div>
        <BudgetYearSwitcher year={year} availableYears={availableYears} subPath="/reports" />
      </div>

      <BudgetTabs year={year} active="reports" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScopeTabs year={year} scope={scope} status={status} canApprove={canApprove} canSubmit={canSubmit} />
        {canSubmit ? (
          <Link
            href={`/budget/${year}/reports/new`}
            className="hl-btn-primary"
          >
            <FilePlus className="h-4 w-4" />
            New report
          </Link>
        ) : null}
      </div>

      <StatusTabs year={year} scope={scope} status={status} />

      {!fy ? (
        <div className="hl-card p-6 text-sm text-hl-muted">
          Fiscal year {year} isn&rsquo;t seeded yet — expense reports need a
          fiscal year to attach to.
        </div>
      ) : reports.length === 0 ? (
        <div className="hl-card p-6 text-sm text-hl-muted">
          No reports match. Try a different tab or{" "}
          {canSubmit ? (
            <Link
              href={`/budget/${year}/reports/new`}
              className="font-medium text-hl-green-700 hover:underline"
            >
              start a new one
            </Link>
          ) : (
            "wait for a submission"
          )}
          .
        </div>
      ) : (
        <div className="hl-card overflow-hidden">
          <table className="hl-table">
            <thead>
              <tr>
                <th className="text-left">#</th>
                <th className="text-left">Title</th>
                <th className="text-left">Submitter</th>
                <th className="text-left">Period</th>
                <th className="text-right">Lines</th>
                <th className="text-right">Total</th>
                <th className="text-left">Status</th>
                <th className="text-left">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td className="tabular-nums">
                    <Link
                      href={`/budget/${year}/reports/${r.id}`}
                      className="font-medium text-hl-green-700 hover:underline"
                    >
                      {r.reportNumber}
                    </Link>
                  </td>
                  <td>{r.title}</td>
                  <td className="text-hl-muted">{r.submitterName}</td>
                  <td className="tabular-nums text-hl-muted">
                    {r.periodFrom} → {r.periodTo}
                  </td>
                  <td className="text-right tabular-nums">{r.lineCount}</td>
                  <td className="text-right tabular-nums font-medium">
                    {formatCad(Number(r.totalAmount))}
                  </td>
                  <td>
                    <StatusPill status={r.status as ExpenseReportStatus} />
                  </td>
                  <td className="tabular-nums text-hl-muted">
                    {r.submittedAt
                      ? new Date(r.submittedAt).toLocaleDateString("en-CA")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScopeTabs({
  year,
  scope,
  status,
  canApprove,
  canSubmit,
}: {
  year: number;
  scope: "mine" | "approvals" | "all";
  status: string;
  canApprove: boolean;
  canSubmit: boolean;
}) {
  const tabs: Array<{ key: typeof scope; label: string; show: boolean }> = [
    { key: "approvals", label: "For me to approve", show: canApprove },
    { key: "mine", label: "Mine", show: canSubmit },
    { key: "all", label: "Everyone", show: true },
  ];
  return (
    <div className="flex overflow-hidden rounded-md border border-hl-border bg-white">
      {tabs
        .filter((t) => t.show)
        .map((t) => (
          <Link
            key={t.key}
            href={`/budget/${year}/reports?scope=${t.key}&status=${status}`}
            className={`px-3 py-2 text-sm font-medium transition ${
              scope === t.key
                ? "bg-hl-green-600 text-white"
                : "text-hl-muted hover:bg-hl-cream hover:text-hl-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
    </div>
  );
}

function StatusTabs({
  year,
  scope,
  status,
}: {
  year: number;
  scope: "mine" | "approvals" | "all";
  status: string;
}) {
  const tabs = [...EXPENSE_REPORT_STATUSES, "all"] as (ExpenseReportStatus | "all")[];
  return (
    <div className="flex flex-wrap gap-1 border-b border-hl-border">
      {tabs.map((s) => {
        const active = status === s;
        const label = s === "all" ? "All" : EXPENSE_REPORT_STATUS_LABELS[s];
        return (
          <Link
            key={s}
            href={`/budget/${year}/reports?scope=${scope}&status=${s}`}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition ${
              active
                ? "border-hl-green-600 text-hl-green-700"
                : "border-transparent text-hl-muted hover:border-hl-border hover:text-hl-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: ExpenseReportStatus }) {
  const cls = STATUS_STYLES[status] ?? "bg-hl-cream text-hl-muted";
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {EXPENSE_REPORT_STATUS_LABELS[status]}
    </span>
  );
}

const STATUS_STYLES: Record<ExpenseReportStatus, string> = {
  draft: "bg-hl-cream text-hl-muted",
  submitted: "bg-amber-100 text-amber-900",
  approved: "bg-blue-100 text-blue-900",
  rejected: "bg-red-100 text-red-900",
  paid: "bg-hl-green-100 text-hl-green-700",
  cancelled: "bg-hl-cream text-hl-muted",
};

function formatCad(v: number): string {
  return v.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  });
}
