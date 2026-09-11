import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ArrowLeft } from "lucide-react";
import { canEditBudget, canViewBudget } from "@/lib/budget/people";
import {
  findReversalCandidates,
  getBankAccounts,
  getBankTransactionById,
  getBudgetGrid,
  getFiscalYear,
  getFundingSources,
  getSimilarTxnStats,
} from "@/lib/budget/queries";
import { listUnpaidApprovedReports } from "@/lib/budget/er-queries";
import { CLASSIFICATION_LABELS } from "@/lib/budget/classify";
import { getBankSplits } from "@/lib/budget/bank-actions";
import type { BankTxnClassification } from "@/lib/db/schema";
import { parseYearParam } from "../../../BudgetNav";
import { ClassifyForm } from "./ClassifyForm";
import { ManualEntryForm } from "./ManualEntryForm";

export const metadata = { title: "Classify Transaction — Heritage Lab" };

export default async function ClassifyPage({
  params,
}: {
  params: Promise<{ year: string; txnId: string }>;
}) {
  const session = await auth();
  if (!canViewBudget(session?.user?.email)) notFound();

  const { year: yearParam, txnId } = await params;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const txn = await getBankTransactionById(txnId);
  if (!txn) notFound();

  const editable = canEditBudget(session?.user?.email);

  const fiscalYear = await getFiscalYear(year);
  const [
    grid,
    accounts,
    fundingList,
    reversalCandidates,
    unpaidErs,
    splits,
    similar,
  ] = await Promise.all([
    fiscalYear ? getBudgetGrid(year) : Promise.resolve(null),
    getBankAccounts(),
    fiscalYear ? getFundingSources(fiscalYear.id) : Promise.resolve([]),
    txn.credit
      ? findReversalCandidates({
          accountId: txn.accountId,
          credit: txn.credit,
          txnDate: txn.txnDate,
        })
      : Promise.resolve([]),
    listUnpaidApprovedReports(),
    getBankSplits(txn.id),
    getSimilarTxnStats(txn),
  ]);

  const accountName = accounts.find((a) => a.id === txn.accountId)?.name ?? "—";
  const isManual = accountName === "Manual entries (pre-import)";

  const budgetLineOptions =
    grid?.categories.flatMap((c) =>
      c.lines.map((l) => ({
        id: l.id,
        label: `${l.fullCode} · ${l.name} (${c.name})`,
      })),
    ) ?? [];

  const fundingOptions = fundingList.map((f) => ({
    id: f.id,
    label: f.name,
    kind: f.kind,
  }));

  const reversalOptions = reversalCandidates
    .filter((c) => c.id !== txn.id)
    .map((c) => ({
      id: c.id,
      label: `${c.txnDate} · ${c.description} · ${c.debit}`,
    }));

  const debitAmount = txn.debit ? Number(txn.debit) : null;
  const erOptions = unpaidErs
    .filter(
      (er) =>
        // Show reports whose total matches this debit, plus anything already
        // linked to this txn even if the amount was edited later.
        er.id === txn.expenseReportId ||
        (debitAmount !== null &&
          Number(er.totalAmount).toFixed(2) === debitAmount.toFixed(2)),
    )
    .map((er) => ({
      id: er.id,
      label: `${er.reportNumber} · ${er.submitterName} · $${Number(er.totalAmount).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`,
    }));
  const otherUnpaidErs = unpaidErs.length - erOptions.length;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/budget/${year}/bank`} className="hl-btn-ghost -ml-3 mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to bank ledger
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-hl-ink">
          Classify transaction
        </h1>
      </div>

      <section className="hl-card p-5">
        <dl className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Info label="Date">{txn.txnDate}</Info>
          <Info label="Account">{accountName}</Info>
          <Info label="Debit" mono>
            {txn.debit ? `$${Number(txn.debit).toLocaleString("en-CA", { minimumFractionDigits: 2 })}` : "—"}
          </Info>
          <Info label="Credit" mono>
            {txn.credit ? `$${Number(txn.credit).toLocaleString("en-CA", { minimumFractionDigits: 2 })}` : "—"}
          </Info>
          <Info label="Description" span={2}>
            {txn.description}
          </Info>
          <Info label="Balance after" mono>
            {txn.runningBalance
              ? `$${Number(txn.runningBalance).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`
              : "—"}
          </Info>
          <Info label="Current classification">
            {CLASSIFICATION_LABELS[txn.classification as BankTxnClassification] ?? txn.classification}
            {txn.classifiedBy ? (
              <span className="ml-1 text-xs text-hl-muted">
                by {txn.classifiedBy === "auto" ? "auto-rule" : txn.classifiedBy}
              </span>
            ) : null}
          </Info>
        </dl>
      </section>

      {editable ? (
        <>
          {isManual ? (
            <ManualEntryForm
              txnId={txn.id}
              initial={{
                txnDate: txn.txnDate,
                description: txn.description,
                amount: Number(txn.debit ?? 0),
                budgetLineId: txn.budgetLineId,
                fundingSourceId: txn.fundingSourceId,
                note: txn.note ?? "",
              }}
              budgetLineOptions={budgetLineOptions}
              fundingOptions={fundingOptions}
            />
          ) : (
            <ClassifyForm
              year={year}
              txn={{
                id: txn.id,
                classification: txn.classification as BankTxnClassification,
                budgetLineId: txn.budgetLineId,
                fundingSourceId: txn.fundingSourceId,
                reversalOfTxnId: txn.reversalOfTxnId,
                expenseReportId: txn.expenseReportId,
                note: txn.note ?? "",
                hasDebit: !!txn.debit,
                hasCredit: !!txn.credit,
              }}
              budgetLineOptions={budgetLineOptions}
              fundingOptions={fundingOptions}
              reversalOptions={reversalOptions}
              erOptions={erOptions}
              erNotShownCount={otherUnpaidErs}
              similar={similar}
              txnDebit={txn.debit ? Number(txn.debit) : null}
              parentDescription={txn.description}
              existingSplits={splits.map((s) => ({
                id: s.id,
                budgetLineId: s.budgetLineId,
                fundingSourceId: s.fundingSourceId,
                amount: s.amount,
                description: s.description,
              }))}
            />
          )}
        </>
      ) : (
        <div className="hl-card p-5 text-sm text-hl-muted">
          Read-only view — ask a budget admin to (re)classify this row.
        </div>
      )}
    </div>
  );
}

function Info({
  label,
  children,
  mono = false,
  span = 1,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  span?: 1 | 2;
}) {
  return (
    <div className={span === 2 ? "sm:col-span-2 md:col-span-2" : ""}>
      <dt className="text-xs uppercase tracking-wider text-hl-muted">{label}</dt>
      <dd className={`mt-1 text-sm ${mono ? "tabular-nums" : ""} text-hl-ink`}>
        {children}
      </dd>
    </div>
  );
}
