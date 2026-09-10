import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ArrowLeft, FileText, Paperclip, Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import {
  budgetCategories,
  budgetLines,
  fundingSources,
  type BudgetCategory,
  type BudgetLine,
  type FundingSource,
} from "@/lib/db/schema";
import {
  canApproveExpenseReports,
  canEditBudget,
  canViewBudget,
} from "@/lib/budget/people";
import { normalizeEmail } from "@/lib/roles";
import { getExpenseReportById } from "@/lib/budget/er-queries";
import type { ExpenseReport } from "@/lib/db/schema";
import {
  EXPENSE_REPORT_STATUS_LABELS,
  canTransition,
  type ExpenseReportStatus,
} from "@/lib/budget/er-schema";
import { parseYearParam } from "../../../BudgetNav";
import { DecisionForm } from "./DecisionForm";
import { CancelForm } from "./CancelForm";

export const metadata = { title: "Expense Report — Heritage Lab" };

export default async function ExpenseReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string; id: string }>;
  searchParams: Promise<{ submitted?: string; saved?: string }>;
}) {
  const session = await auth();
  const actor = session?.user?.email;
  if (!canViewBudget(actor)) notFound();

  const { year: yearParam, id } = await params;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const detail = await getExpenseReportById(id);
  if (!detail) notFound();

  const { report, lines } = detail;
  const { submitted, saved } = await searchParams;

  const isSubmitter = report.submitterUserId === session?.user?.id;
  const isApprover =
    canApproveExpenseReports(actor) &&
    normalizeEmail(report.submitterEmail) !== normalizeEmail(actor ?? "");
  const canEditThis =
    isSubmitter &&
    canEditBudget(actor) &&
    ["draft", "rejected"].includes(report.status);
  const canDecide =
    isApprover &&
    canTransition({
      from: report.status as ExpenseReportStatus,
      to: "approved",
      role: "approver",
    });
  const canCancel =
    (isSubmitter &&
      canTransition({
        from: report.status as ExpenseReportStatus,
        to: "cancelled",
        role: "submitter",
      })) ||
    (isApprover &&
      canTransition({
        from: report.status as ExpenseReportStatus,
        to: "cancelled",
        role: "approver",
      }));

  // Fetch reference data for line rendering (line name + category name + funding source name).
  const lineIds = Array.from(new Set(lines.map((l) => l.budgetLineId)));
  const fundingIds = Array.from(
    new Set(lines.map((l) => l.fundingSourceId).filter((v): v is string => Boolean(v))),
  );

  const [budgetRows, cats, fundingRows] = await Promise.all([
    lineIds.length
      ? db.select().from(budgetLines).where(inArray(budgetLines.id, lineIds))
      : Promise.resolve<BudgetLine[]>([]),
    db.select().from(budgetCategories),
    fundingIds.length
      ? db
          .select()
          .from(fundingSources)
          .where(inArray(fundingSources.id, fundingIds))
      : Promise.resolve<FundingSource[]>([]),
  ]);

  const budgetById = new Map(budgetRows.map((r) => [r.id, r]));
  const categoryById = new Map<string, BudgetCategory>(cats.map((c) => [c.id, c]));
  const fundingById = new Map(fundingRows.map((r) => [r.id, r]));

  const status = report.status as ExpenseReportStatus;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/budget/${year}/reports`}
          className="hl-btn-ghost -ml-3 mb-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to reports
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-hl-ink">
              <span>{report.reportNumber}</span>
              <StatusPill status={status} />
            </h1>
            <p className="mt-1 text-sm text-hl-muted">{report.title}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEditThis ? (
              <Link
                href={`/budget/${year}/reports/${report.id}/edit`}
                className="hl-btn-secondary"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            ) : null}
            <Link
              href={`/budget/${year}/reports/${report.id}/pdf`}
              className="hl-btn-ghost"
              target="_blank"
            >
              <FileText className="h-4 w-4" />
              PDF
            </Link>
          </div>
        </div>
      </div>

      {submitted ? (
        <div className="hl-card border-hl-green-200 bg-hl-green-50/50 p-4 text-sm text-hl-green-800">
          Submitted to <strong>{report.approverEmail}</strong> for approval. Watch
          your inbox for a decision.
        </div>
      ) : null}
      {saved && !submitted ? (
        <div className="hl-card border-hl-green-200 bg-hl-green-50/50 p-4 text-sm text-hl-green-800">
          Draft saved.
        </div>
      ) : null}

      {report.submitEmailError ? (
        <div className="hl-card border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
          The approval notification email failed:{" "}
          <code>{report.submitEmailError}</code>. Ask{" "}
          <strong>{report.approverEmail}</strong> to review this page directly.
        </div>
      ) : null}
      {report.decisionEmailError ? (
        <div className="hl-card border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
          The decision notification email failed:{" "}
          <code>{report.decisionEmailError}</code>. Notify the submitter manually.
        </div>
      ) : null}

      <section className="hl-card p-5">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Info label="Submitter">
            {report.submitterName}
            <span className="block text-xs text-hl-muted">
              {report.submitterEmail}
            </span>
          </Info>
          <Info label="Approver">{report.approverEmail}</Info>
          <Info label="Period">
            {report.periodFrom} → {report.periodTo}
          </Info>
          <Info label="Total">
            <span className="font-semibold tabular-nums">
              {formatCad(Number(report.totalAmount))}
            </span>
          </Info>
          <Info label="Line count">{lines.length}</Info>
          <Info label="Submitted">
            {report.submittedAt
              ? new Date(report.submittedAt).toLocaleString("en-CA", {
                  timeZone: "America/Toronto",
                })
              : "—"}
          </Info>
          {report.businessPurpose ? (
            <Info label="Business purpose" span={3}>
              <div className="whitespace-pre-wrap">{report.businessPurpose}</div>
            </Info>
          ) : null}
        </dl>
      </section>

      <section className="hl-card overflow-hidden">
        <div className="border-b border-hl-border bg-hl-cream/50 px-5 py-3">
          <h2 className="text-base font-semibold tracking-tight text-hl-ink">
            Line items
          </h2>
        </div>
        <table className="hl-table">
          <thead>
            <tr>
              <th className="text-left">Date</th>
              <th className="text-left">Description</th>
              <th className="text-left">Budget code</th>
              <th className="text-left">Funding source</th>
              <th className="text-left">Receipt</th>
              <th className="text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const bl = budgetById.get(l.budgetLineId);
              const cat = bl ? categoryById.get(bl.categoryId) : null;
              const fs = l.fundingSourceId ? fundingById.get(l.fundingSourceId) : null;
              return (
                <tr key={l.id}>
                  <td className="tabular-nums">{l.expenseDate}</td>
                  <td>{l.description}</td>
                  <td className="text-hl-muted">
                    <span className="font-medium text-hl-ink">
                      {l.budgetLineCode}
                    </span>
                    <span className="block text-xs">
                      {bl?.name}
                      {cat ? ` · ${cat.name}` : ""}
                    </span>
                  </td>
                  <td className="text-hl-muted">{fs?.name ?? "—"}</td>
                  <td className="text-xs">
                    {l.receiptUrl ? (
                      <a
                        href={l.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-hl-green-700 hover:underline"
                      >
                        <Paperclip className="h-3 w-3" />
                        {l.receiptFilename ?? "receipt"}
                      </a>
                    ) : (
                      <span className="text-hl-muted">—</span>
                    )}
                  </td>
                  <td className="text-right font-medium tabular-nums">
                    {formatCad(Number(l.cost))}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="text-right text-sm font-medium text-hl-muted">
                Total reimbursement
              </td>
              <td className="text-right text-lg font-semibold tabular-nums text-hl-ink">
                {formatCad(Number(report.totalAmount))}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <TimelineSection report={report} />

      {canDecide ? (
        <DecisionForm reportId={report.id} year={year} />
      ) : null}
      {canCancel ? (
        <CancelForm reportId={report.id} year={year} status={status} />
      ) : null}
    </div>
  );
}

function TimelineSection({ report }: { report: ExpenseReport }) {
  const events: Array<{ when: Date; label: string; note?: string | null }> = [];
  events.push({ when: report.createdAt, label: "Draft created" });
  if (report.submittedAt) {
    events.push({
      when: report.submittedAt,
      label: `Submitted to ${report.approverEmail}`,
    });
  }
  if (report.decidedAt && report.decidedBy) {
    events.push({
      when: report.decidedAt,
      label: `${report.status === "approved" ? "Approved" : report.status === "rejected" ? "Rejected" : "Decided"} by ${report.decidedBy}`,
      note: report.decisionNote,
    });
  }
  if (report.paidAt) {
    events.push({
      when: report.paidAt,
      label: "Paid via bank reimbursement",
    });
  }
  if (report.cancelledAt) {
    events.push({
      when: report.cancelledAt,
      label: `Cancelled by ${report.cancelledBy ?? "—"}`,
      note: report.cancelReason,
    });
  }
  events.sort((a, b) => a.when.getTime() - b.when.getTime());
  return (
    <section className="hl-card p-5">
      <h2 className="text-base font-semibold tracking-tight text-hl-ink">
        Timeline
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        {events.map((e, i) => (
          <li key={i}>
            <span className="tabular-nums text-hl-muted">
              {new Date(e.when).toLocaleString("en-CA", {
                timeZone: "America/Toronto",
              })}
              {" · "}
            </span>
            <span className="text-hl-ink">{e.label}</span>
            {e.note ? (
              <blockquote className="mt-1 border-l-2 border-hl-border pl-3 text-xs italic text-hl-muted">
                {e.note}
              </blockquote>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Info({
  label,
  children,
  span = 1,
}: {
  label: string;
  children: React.ReactNode;
  span?: 1 | 2 | 3;
}) {
  const cls =
    span === 3 ? "sm:col-span-3" : span === 2 ? "sm:col-span-2" : "";
  return (
    <div className={cls}>
      <dt className="text-xs uppercase tracking-wider text-hl-muted">{label}</dt>
      <dd className="mt-1 text-sm text-hl-ink">{children}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: ExpenseReportStatus }) {
  const styles: Record<ExpenseReportStatus, string> = {
    draft: "bg-hl-cream text-hl-muted",
    submitted: "bg-amber-100 text-amber-900",
    approved: "bg-blue-100 text-blue-900",
    rejected: "bg-red-100 text-red-900",
    paid: "bg-hl-green-100 text-hl-green-700",
    cancelled: "bg-hl-cream text-hl-muted",
  };
  return (
    <span
      className={`inline-flex rounded px-2.5 py-1 text-xs font-medium ${styles[status] ?? ""}`}
    >
      {EXPENSE_REPORT_STATUS_LABELS[status]}
    </span>
  );
}

function formatCad(v: number): string {
  return v.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  });
}
