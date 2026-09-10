"use client";

import { useState, useTransition } from "react";
import { PenLine, Trash2 } from "lucide-react";
import {
  deleteManualEntry,
  updateManualEntry,
  type ManualEntryState,
} from "@/lib/budget/bank-actions";

type Option = { id: string; label: string };
type FundingOption = Option & { kind: string };

/**
 * Edit-in-place form for manual-account bank transactions. Real TD rows
 * use the read-only info block plus the classify form; only manual rows
 * expose date / description / amount editing, because rewriting a TD row
 * would silently break the audit trail.
 */
export function ManualEntryForm({
  txnId,
  initial,
  budgetLineOptions,
  fundingOptions,
}: {
  txnId: string;
  initial: {
    txnDate: string;
    description: string;
    amount: number;
    budgetLineId: string | null;
    fundingSourceId: string | null;
    note: string;
  };
  budgetLineOptions: Option[];
  fundingOptions: FundingOption[];
}) {
  const [txnDate, setTxnDate] = useState(initial.txnDate);
  const [description, setDescription] = useState(initial.description);
  const [amount, setAmount] = useState(String(initial.amount));
  const [budgetLineId, setBudgetLineId] = useState(initial.budgetLineId ?? "");
  const [fundingSourceId, setFundingSourceId] = useState(
    initial.fundingSourceId ?? "",
  );
  const [note, setNote] = useState(initial.note);
  const [state, setState] = useState<ManualEntryState | undefined>();
  const [pending, startTransition] = useTransition();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteState, setDeleteState] = useState<ManualEntryState | undefined>();
  const [deletePending, startDeleteTransition] = useTransition();

  function submitEdit() {
    setState(undefined);
    const fd = new FormData();
    fd.append("id", txnId);
    fd.append("txnDate", txnDate);
    fd.append("description", description);
    fd.append("amount", amount);
    if (budgetLineId) fd.append("budgetLineId", budgetLineId);
    if (fundingSourceId) fd.append("fundingSourceId", fundingSourceId);
    if (note) fd.append("note", note);
    startTransition(async () => {
      const res = await updateManualEntry(undefined, fd);
      setState(res);
    });
  }

  function submitDelete() {
    setDeleteState(undefined);
    const fd = new FormData();
    fd.append("id", txnId);
    startDeleteTransition(async () => {
      const res = await deleteManualEntry(undefined, fd);
      setDeleteState(res);
      // On success the page will revalidate; if the server returned no
      // redirect, at least clear the confirm state so the UI isn't stuck.
      if (res.ok) window.location.assign(`/budget/${txnDate.slice(0, 4)}/expenses`);
    });
  }

  const fieldError = (name: string) => state?.fieldErrors?.[name];

  return (
    <section className="hl-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <PenLine className="h-4 w-4 text-hl-green-600" />
        <h2 className="text-base font-semibold tracking-tight text-hl-ink">
          Edit manual entry
        </h2>
      </div>
      <p className="text-xs text-hl-muted">
        This row was created from Ali&rsquo;s Excel import — it has no TD
        bank counterpart, so every field is editable. Real bank rows keep
        their date / description / amount frozen for the audit trail.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-6">
        <div className="md:col-span-2">
          <label className="hl-label" htmlFor="me-date">
            Date
          </label>
          <input
            id="me-date"
            type="date"
            className="hl-input"
            value={txnDate}
            onChange={(e) => setTxnDate(e.target.value)}
            disabled={pending}
          />
          {fieldError("txnDate") ? (
            <p className="mt-1 text-xs text-red-700">{fieldError("txnDate")}</p>
          ) : null}
        </div>
        <div className="md:col-span-2">
          <label className="hl-label" htmlFor="me-amount">
            Amount
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-hl-muted">
              $
            </span>
            <input
              id="me-amount"
              inputMode="decimal"
              className="hl-input pl-6"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={pending}
            />
          </div>
          {fieldError("amount") ? (
            <p className="mt-1 text-xs text-red-700">{fieldError("amount")}</p>
          ) : null}
        </div>
        <div className="md:col-span-6">
          <label className="hl-label" htmlFor="me-desc">
            Description
          </label>
          <input
            id="me-desc"
            className="hl-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
          />
          {fieldError("description") ? (
            <p className="mt-1 text-xs text-red-700">{fieldError("description")}</p>
          ) : null}
        </div>
        <div className="md:col-span-3">
          <label className="hl-label" htmlFor="me-line">
            Budget line
          </label>
          <select
            id="me-line"
            className="hl-input"
            value={budgetLineId}
            onChange={(e) => setBudgetLineId(e.target.value)}
            disabled={pending}
          >
            <option value="">— none —</option>
            {budgetLineOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="hl-label" htmlFor="me-funding">
            Funding source
          </label>
          <select
            id="me-funding"
            className="hl-input"
            value={fundingSourceId}
            onChange={(e) => setFundingSourceId(e.target.value)}
            disabled={pending}
          >
            <option value="">— none / general —</option>
            {fundingOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-6">
          <label className="hl-label" htmlFor="me-note">
            Note
          </label>
          <textarea
            id="me-note"
            className="hl-input min-h-[60px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
            maxLength={500}
          />
        </div>
      </div>

      {state?.error && !state.ok ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {state.error}
        </div>
      ) : null}
      {state?.ok ? (
        <div className="mt-3 rounded-md border border-hl-green-200 bg-hl-green-50 p-3 text-xs text-hl-green-800">
          Saved.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hl-border pt-3">
        <button
          type="button"
          onClick={submitEdit}
          disabled={pending}
          className="hl-btn-primary"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>

        <div className="flex items-center gap-2">
          {deleteState?.error ? (
            <span className="text-xs text-red-700">{deleteState.error}</span>
          ) : null}
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={submitDelete}
                disabled={deletePending}
                className="inline-flex items-center gap-2 rounded-md border border-red-600 bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {deletePending ? "Deleting…" : "Yes, delete this entry"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deletePending}
                className="text-xs text-hl-muted hover:text-hl-ink"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={pending || deletePending}
              className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete entry
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
