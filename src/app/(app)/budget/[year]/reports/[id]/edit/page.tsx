import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { canEditBudget } from "@/lib/budget/people";
import { getBudgetGrid, getFiscalYear, getFundingSources } from "@/lib/budget/queries";
import { getExpenseReportById } from "@/lib/budget/er-queries";
import { isBlobConfigured } from "@/lib/budget/blob";
import { parseYearParam } from "../../../../BudgetNav";
import { ExpenseReportForm } from "../../ExpenseReportForm";

export const metadata = { title: "Edit Expense Report — Heritage Lab" };

export default async function EditExpenseReportPage({
  params,
}: {
  params: Promise<{ year: string; id: string }>;
}) {
  const session = await auth();
  const actor = session?.user?.email;
  if (!canEditBudget(actor)) notFound();

  const { year: yearParam, id } = await params;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const detail = await getExpenseReportById(id);
  if (!detail) notFound();
  if (detail.report.submitterUserId !== session?.user?.id) notFound();
  if (!["draft", "rejected"].includes(detail.report.status)) notFound();

  const fy = await getFiscalYear(year);
  if (!fy) notFound();

  const [grid, fundingList] = await Promise.all([
    getBudgetGrid(year),
    getFundingSources(fy.id),
  ]);
  if (!grid) notFound();

  const categoryOptions = grid.categories.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    lines: c.lines.map((l) => ({
      id: l.id,
      code: l.code,
      fullCode: l.fullCode,
      name: l.name,
    })),
  }));

  const lineIdToCategoryId = new Map<string, string>();
  for (const c of grid.categories) {
    for (const l of c.lines) lineIdToCategoryId.set(l.id, c.id);
  }

  const fundingOptions = fundingList.map((f) => ({
    id: f.id,
    name: f.name,
    kind: f.kind,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/budget/${year}/reports/${detail.report.id}`}
          className="hl-btn-ghost -ml-3 mb-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to report
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-hl-ink">
          Edit {detail.report.reportNumber}
        </h1>
        <p className="mt-1 text-sm text-hl-muted">
          {detail.report.status === "rejected"
            ? "This report was rejected — edit and resubmit."
            : "Draft — save changes any time; submit when ready."}
        </p>
      </div>

      <ExpenseReportForm
        year={year}
        initial={{
          id: detail.report.id,
          title: detail.report.title,
          periodFrom: detail.report.periodFrom,
          periodTo: detail.report.periodTo,
          businessPurpose: detail.report.businessPurpose ?? "",
          approverEmail: detail.report.approverEmail,
          status: detail.report.status,
          lines: detail.lines.map((l) => ({
            clientId: l.id, // reuse the row's id so receipts are preserved
            expenseDate: l.expenseDate,
            description: l.description,
            categoryId: lineIdToCategoryId.get(l.budgetLineId) ?? "",
            budgetLineId: l.budgetLineId,
            fundingSourceId: l.fundingSourceId ?? "",
            cost: String(Number(l.cost)),
            existingReceiptName: l.receiptFilename,
            existingReceiptUrl: l.receiptUrl,
            newReceiptName: null,
          })),
        }}
        categories={categoryOptions}
        fundingSources={fundingOptions}
        defaultApproverEmail={detail.report.approverEmail}
        blobConfigured={isBlobConfigured()}
      />
    </div>
  );
}
