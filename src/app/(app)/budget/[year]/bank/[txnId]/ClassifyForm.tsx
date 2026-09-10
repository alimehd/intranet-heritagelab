"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";
import {
  classifyBankTransaction,
  type ClassifyState,
} from "@/lib/budget/bank-actions";
import {
  BANK_TXN_CLASSIFICATIONS,
  type BankTxnClassification,
} from "@/lib/db/schema";
import {
  CLASSIFICATION_HELP,
  CLASSIFICATION_LABELS,
} from "@/lib/budget/classify";

type TxnState = {
  id: string;
  classification: BankTxnClassification;
  budgetLineId: string | null;
  fundingSourceId: string | null;
  reversalOfTxnId: string | null;
  expenseReportId: string | null;
  note: string;
  hasDebit: boolean;
  hasCredit: boolean;
};

type Option = { id: string; label: string };
type FundingOption = Option & { kind: string };

export function ClassifyForm({
  year,
  txn,
  budgetLineOptions,
  fundingOptions,
  reversalOptions,
  erOptions,
  erNotShownCount,
}: {
  year: number;
  txn: TxnState;
  budgetLineOptions: Option[];
  fundingOptions: FundingOption[];
  reversalOptions: Option[];
  erOptions: Option[];
  erNotShownCount: number;
}) {
  const [classification, setClassification] = useState<BankTxnClassification>(
    txn.classification,
  );
  const [budgetLineId, setBudgetLineId] = useState(txn.budgetLineId ?? "");
  const [fundingSourceId, setFundingSourceId] = useState(txn.fundingSourceId ?? "");
  const [reversalOfTxnId, setReversalOfTxnId] = useState(txn.reversalOfTxnId ?? "");
  const [expenseReportId, setExpenseReportId] = useState(
    txn.expenseReportId ?? "",
  );
  const [note, setNote] = useState(txn.note);

  const [state, setState] = useState<ClassifyState | undefined>();
  const [pending, startTransition] = useTransition();

  const allowed = useMemo(
    () => allowedClassifications(txn.hasDebit, txn.hasCredit),
    [txn.hasDebit, txn.hasCredit],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState(undefined);
    const fd = new FormData();
    fd.append("txnId", txn.id);
    fd.append("classification", classification);
    if (budgetLineId) fd.append("budgetLineId", budgetLineId);
    if (fundingSourceId) fd.append("fundingSourceId", fundingSourceId);
    if (reversalOfTxnId) fd.append("reversalOfTxnId", reversalOfTxnId);
    if (expenseReportId) fd.append("expenseReportId", expenseReportId);
    if (note) fd.append("note", note);
    startTransition(async () => {
      const res = await classifyBankTransaction(undefined, fd);
      setState(res);
    });
  }

  const fieldError = (name: string) => state?.fieldErrors?.[name];

  const needsLine = classification === "direct_expense";
  const needsFunding =
    classification === "grant_receipt" || classification === "direct_expense";
  const needsReversal = classification === "reversal";
  const needsEr = classification === "er_reimbursement";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className="hl-card p-5">
        <h2 className="text-base font-semibold tracking-tight text-hl-ink">
          Classification
        </h2>
        <p className="mt-1 text-xs text-hl-muted">
          Pick the bucket that best describes this transaction. Debit-only
          buckets are hidden on credit rows and vice versa.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {BANK_TXN_CLASSIFICATIONS.map((c) => {
            const disabled = !allowed.has(c);
            const selected = classification === c;
            return (
              <label
                key={c}
                className={`flex items-start gap-3 rounded-md border p-3 transition ${
                  selected
                    ? "border-hl-green-600 bg-hl-green-50/50"
                    : disabled
                      ? "cursor-not-allowed border-hl-border bg-hl-cream/40 opacity-50"
                      : "cursor-pointer border-hl-border bg-white hover:bg-hl-cream/50"
                }`}
              >
                <input
                  type="radio"
                  name="classification"
                  value={c}
                  checked={selected}
                  onChange={() => setClassification(c)}
                  disabled={disabled || pending}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-hl-ink">
                    {CLASSIFICATION_LABELS[c]}
                  </div>
                  <div className="mt-0.5 text-xs text-hl-muted">
                    {CLASSIFICATION_HELP[c]}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {(needsLine || needsFunding || needsReversal || needsEr) && (
        <section className="hl-card p-5">
          <h2 className="text-base font-semibold tracking-tight text-hl-ink">
            Tag details
          </h2>
          <div className="mt-3 space-y-4">
            {needsLine ? (
              <div>
                <label htmlFor="line" className="hl-label">
                  Budget line
                </label>
                <select
                  id="line"
                  className="hl-input"
                  value={budgetLineId}
                  onChange={(e) => setBudgetLineId(e.target.value)}
                  disabled={pending}
                >
                  <option value="">— pick a budget line —</option>
                  {budgetLineOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {fieldError("budgetLineId") ? (
                  <p className="mt-1 text-xs text-red-700">{fieldError("budgetLineId")}</p>
                ) : null}
              </div>
            ) : null}

            {needsFunding ? (
              <div>
                <label htmlFor="funding" className="hl-label">
                  Funding source {classification === "direct_expense" ? "(optional)" : ""}
                </label>
                <select
                  id="funding"
                  className="hl-input"
                  value={fundingSourceId}
                  onChange={(e) => setFundingSourceId(e.target.value)}
                  disabled={pending}
                >
                  <option value="">
                    {classification === "direct_expense"
                      ? "— none / general funds —"
                      : "— pick a funding source —"}
                  </option>
                  {fundingOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label} ({o.kind.replace("_", " ")})
                    </option>
                  ))}
                </select>
                {fieldError("fundingSourceId") ? (
                  <p className="mt-1 text-xs text-red-700">{fieldError("fundingSourceId")}</p>
                ) : null}
                {fundingOptions.length === 0 ? (
                  <p className="mt-1 text-xs text-hl-muted">
                    No funding sources yet for this year —{" "}
                    <Link
                      href={`/budget/${year}/grants/new`}
                      className="font-medium text-hl-green-700 hover:underline"
                    >
                      add one
                    </Link>
                    .
                  </p>
                ) : null}
              </div>
            ) : null}

            {needsEr ? (
              <div>
                <label htmlFor="er" className="hl-label">
                  Expense report this reimburses
                </label>
                {erOptions.length === 0 ? (
                  <p className="text-xs text-hl-muted">
                    No approved-but-unpaid reports match this amount.
                    {erNotShownCount > 0 ? (
                      <>
                        {" "}
                        {erNotShownCount} other approved report
                        {erNotShownCount === 1 ? "" : "s"} exist — the total on
                        those doesn&rsquo;t match this debit.
                      </>
                    ) : (
                      " Ask the submitter to create + submit + get approval first."
                    )}
                  </p>
                ) : (
                  <select
                    id="er"
                    className="hl-input"
                    value={expenseReportId}
                    onChange={(e) => setExpenseReportId(e.target.value)}
                    disabled={pending}
                  >
                    <option value="">— pick a report —</option>
                    {erOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                {fieldError("expenseReportId") ? (
                  <p className="mt-1 text-xs text-red-700">
                    {fieldError("expenseReportId")}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-hl-muted">
                  Linking flips the report from Approved → Paid; its lines will
                  count toward budget spend-to-date.
                </p>
              </div>
            ) : null}

            {needsReversal ? (
              <div>
                <label htmlFor="reversal" className="hl-label">
                  Original transfer this reverses
                </label>
                {reversalOptions.length === 0 ? (
                  <p className="text-xs text-hl-muted">
                    No matching debit found on this account within 30 days.
                    Adjust the search or double-check the amount.
                  </p>
                ) : (
                  <select
                    id="reversal"
                    className="hl-input"
                    value={reversalOfTxnId}
                    onChange={(e) => setReversalOfTxnId(e.target.value)}
                    disabled={pending}
                  >
                    <option value="">— pick the original —</option>
                    {reversalOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                {fieldError("reversalOfTxnId") ? (
                  <p className="mt-1 text-xs text-red-700">{fieldError("reversalOfTxnId")}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      )}

      <section className="hl-card p-5">
        <label htmlFor="note" className="hl-label">
          Note (optional)
        </label>
        <textarea
          id="note"
          className="hl-input min-h-[70px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Context that isn't in the description — invoice #, ER # once Phase 4 lands, why this is classified this way…"
          maxLength={500}
          disabled={pending}
        />
      </section>

      {state?.error ? (
        <div className="hl-card border-red-200 bg-red-50/60 p-4 text-sm text-red-800">
          {state.error}
        </div>
      ) : null}
      {state?.ok ? (
        <div className="hl-card border-hl-green-200 bg-hl-green-50/50 p-4 text-sm text-hl-green-800">
          <Check className="mr-1 inline h-4 w-4" /> Saved.
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="hl-btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save classification"}
        </button>
        <Link href={`/budget/${year}/bank`} className="hl-btn-ghost">
          Back to ledger
        </Link>
      </div>
    </form>
  );
}

/**
 * Which classifications make sense for a debit vs credit row. Prevents
 * tagging a credit as "direct_expense" (that would double the spend total)
 * or a debit as "grant_receipt".
 */
function allowedClassifications(
  hasDebit: boolean,
  hasCredit: boolean,
): Set<BankTxnClassification> {
  const set = new Set<BankTxnClassification>([
    "unclassified",
    "internal_transfer",
    "ignore",
  ]);
  if (hasDebit) {
    set.add("direct_expense");
    set.add("er_reimbursement");
    set.add("fee");
    set.add("transfer_fee");
  }
  if (hasCredit) {
    set.add("grant_receipt");
    set.add("reversal");
    set.add("fee"); // bank rebates
    set.add("transfer_fee"); // reversed transfer fees
  }
  return set;
}
