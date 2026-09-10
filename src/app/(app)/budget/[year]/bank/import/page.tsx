import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ArrowLeft, Upload } from "lucide-react";
import { canEditBudget } from "@/lib/budget/people";
import { getBankAccounts } from "@/lib/budget/queries";
import { parseYearParam } from "../../../BudgetNav";
import { ImportForm } from "./ImportForm";

export const metadata = { title: "Import Bank CSV — Heritage Lab" };

export default async function ImportPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const session = await auth();
  if (!canEditBudget(session?.user?.email)) notFound();

  const { year: yearParam } = await params;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const accounts = await getBankAccounts();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/budget/${year}/bank`} className="hl-btn-ghost -ml-3 mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to bank ledger
        </Link>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-hl-ink">
          <Upload className="h-7 w-7 text-hl-green-600" />
          Import TD CSV
        </h1>
        <p className="mt-1 text-sm text-hl-muted">
          Drop your TD account activity export. Re-uploading an overlapping
          period is safe — dupes are skipped by hash.
        </p>
      </div>

      <ImportForm year={year} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />

      <section className="hl-card p-5 text-sm text-hl-muted">
        <h2 className="text-base font-semibold text-hl-ink">Expected format</h2>
        <p className="mt-2">
          TD Business exports as headerless CSV in this exact column order:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-hl-cream p-3 text-xs text-hl-ink">
          date (MM/DD/YYYY), description, debit, credit, running balance
        </pre>
        <p className="mt-3">
          On import, bank fees (transfer fees, monthly plan, service charges,
          overdraft interest) are auto-tagged to line{" "}
          <code className="rounded bg-hl-cream px-1 py-0.5 text-xs">005-1</code>
          . Reversals get flagged for you to pair with their original transfer.
          Everything else lands as <span className="font-medium">unclassified</span>
          and needs your review.
        </p>
      </section>
    </div>
  );
}
