import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ArrowLeft } from "lucide-react";
import { canEditBudget } from "@/lib/budget/people";
import { getBudgetGrid, getFiscalYear } from "@/lib/budget/queries";
import { parseYearParam } from "../../../BudgetNav";
import { FundingSourceForm } from "../FundingSourceForm";

export const metadata = { title: "New Funding Source — Heritage Lab" };

export default async function NewFundingSourcePage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const session = await auth();
  if (!canEditBudget(session?.user?.email)) notFound();

  const { year: yearParam } = await params;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const fiscalYear = await getFiscalYear(year);
  if (!fiscalYear) notFound();

  const grid = await getBudgetGrid(year);
  const categories = (grid?.categories ?? []).map((c) => ({
    code: c.code,
    name: c.name,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/budget/${year}/grants`} className="hl-btn-ghost -ml-3 mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to grants
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-hl-ink">
          New funding source for {year}
        </h1>
        <p className="mt-1 text-sm text-hl-muted">
          Grants, service contracts, and donations feed the projected receipts
          side of the budget.
        </p>
      </div>

      <FundingSourceForm
        year={year}
        fiscalYearId={fiscalYear.id}
        categories={categories}
      />
    </div>
  );
}
