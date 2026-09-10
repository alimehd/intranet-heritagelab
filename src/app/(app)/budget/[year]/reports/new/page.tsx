import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { canEditBudget } from "@/lib/budget/people";
import { getBudgetGrid, getFundingSources } from "@/lib/budget/queries";
import { isBlobConfigured } from "@/lib/budget/blob";
import { getFiscalYear } from "@/lib/budget/queries";
import { parseYearParam } from "../../../BudgetNav";
import { ExpenseReportForm } from "../ExpenseReportForm";

export const metadata = { title: "New Expense Report — Heritage Lab" };

/** Default approver = first BUDGET_VIEWER_EMAILS entry (Elias by default). */
function pickDefaultApprover(): string {
  const raw = process.env.BUDGET_VIEWER_EMAILS?.split(",")[0]?.trim();
  return raw && raw.length > 0 ? raw : "elias.moukannas@heritagelab.ca";
}

export default async function NewExpenseReportPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const session = await auth();
  const actor = session?.user?.email;
  if (!canEditBudget(actor)) notFound();

  const { year: yearParam } = await params;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const fy = await getFiscalYear(year);
  if (!fy) {
    return (
      <div className="space-y-6">
        <Link
          href={`/budget/${year}/reports`}
          className="hl-btn-ghost -ml-3 mb-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to reports
        </Link>
        <div className="hl-card p-6 text-sm text-hl-muted">
          Fiscal year {year} isn&rsquo;t seeded — run <code>npm run seed:budget</code>{" "}
          first.
        </div>
      </div>
    );
  }

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

  const fundingOptions = fundingList.map((f) => ({
    id: f.id,
    name: f.name,
    kind: f.kind,
  }));

  const periodDefaults = defaultPeriodForYear(year);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/budget/${year}/reports`}
          className="hl-btn-ghost -ml-3 mb-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to reports
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-hl-ink">
          New expense report
        </h1>
        <p className="mt-1 text-sm text-hl-muted">
          Add each line, then either save the draft or submit for approval.
        </p>
      </div>

      <ExpenseReportForm
        year={year}
        initial={{
          id: null,
          title: `${monthLabel(periodDefaults.from)} ${year} Expenses`,
          periodFrom: periodDefaults.from,
          periodTo: periodDefaults.to,
          businessPurpose: "",
          approverEmail: "",
          status: "draft",
          lines: [],
        }}
        categories={categoryOptions}
        fundingSources={fundingOptions}
        defaultApproverEmail={pickDefaultApprover()}
        blobConfigured={isBlobConfigured()}
      />
    </div>
  );
}

function defaultPeriodForYear(year: number): { from: string; to: string } {
  // Default to the previous full month (typical monthly cadence).
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  if (currentYear !== year) {
    return { from: `${year}-01-01`, to: `${year}-01-31` };
  }
  const targetMonth = currentMonth === 0 ? 0 : currentMonth - 1;
  const firstOfMonth = new Date(Date.UTC(year, targetMonth, 1));
  const lastOfMonth = new Date(Date.UTC(year, targetMonth + 1, 0));
  return { from: iso(firstOfMonth), to: iso(lastOfMonth) };
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleString("en-CA", { month: "long", timeZone: "UTC" });
}
