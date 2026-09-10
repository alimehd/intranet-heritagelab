import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ArrowLeft } from "lucide-react";
import { canEditBudget } from "@/lib/budget/people";
import {
  getBudgetGrid,
  getFiscalYear,
  getFundingSourceById,
} from "@/lib/budget/queries";
import { parseYearParam } from "../../../../BudgetNav";
import { FundingSourceForm } from "../../FundingSourceForm";

export const metadata = { title: "Edit Funding Source — Heritage Lab" };

export default async function EditFundingSourcePage({
  params,
}: {
  params: Promise<{ year: string; id: string }>;
}) {
  const session = await auth();
  if (!canEditBudget(session?.user?.email)) notFound();

  const { year: yearParam, id } = await params;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const fiscalYear = await getFiscalYear(year);
  const source = await getFundingSourceById(id);
  if (!source || !fiscalYear || source.fiscalYearId !== fiscalYear.id) notFound();

  const grid = await getBudgetGrid(year);
  const categories = (grid?.categories ?? []).map((c) => ({
    code: c.code,
    name: c.name,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/budget/${year}/grants/${source.id}`}
          className="hl-btn-ghost -ml-3 mb-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {source.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-hl-ink">
          Edit {source.name}
        </h1>
        <p className="mt-1 text-sm text-hl-muted">
          Adjustments apply immediately and revalidate the budget grid and
          grants dashboards.
        </p>
      </div>

      <FundingSourceForm
        year={year}
        fiscalYearId={fiscalYear.id}
        existing={source}
        categories={categories}
      />
    </div>
  );
}
