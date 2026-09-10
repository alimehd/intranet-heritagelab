"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Split, Trash2, TriangleAlert } from "lucide-react";
import { saveBankSplits, type SplitState } from "@/lib/budget/bank-actions";

type Option = { id: string; label: string };
type FundingOption = Option & { kind: string };

type SplitRow = {
  key: string;
  amount: string;
  budgetLineId: string;
  fundingSourceId: string;
  description: string;
};

function makeKey() {
  return `sp_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Edit the split allocation of a single bank transaction. Sum of split
 * amounts must equal the parent's debit; the UI shows the running total
 * and only enables Save when the math is right.
 *
 * Passing zero splits (via "Clear all splits") reverts the row so the
 * parent's own budget line and funding source govern it again.
 */
export function SplitsForm({
  txnId,
  txnDebit,
  parentDescription,
  budgetLineOptions,
  fundingOptions,
  existing,
}: {
  txnId: string;
  txnDebit: number;
  parentDescription: string;
  budgetLineOptions: Option[];
  fundingOptions: FundingOption[];
  existing: Array<{
    id: string;
    budgetLineId: string;
    fundingSourceId: string | null;
    amount: string;
    description: string | null;
  }>;
}) {
  const [rows, setRows] = useState<SplitRow[]>(() => {
    if (existing.length === 0) {
      // Start with 2 empty rows so it's obvious what the UX is for.
      return [freshRow(), freshRow()];
    }
    return existing.map((e) => ({
      key: e.id,
      amount: Number(e.amount).toString(),
      budgetLineId: e.budgetLineId,
      fundingSourceId: e.fundingSourceId ?? "",
      description: e.description ?? "",
    }));
  });
  const [state, setState] = useState<SplitState | undefined>();
  const [pending, startTransition] = useTransition();
  const [confirmClear, setConfirmClear] = useState(false);

  const total = useMemo(
    () =>
      rows.reduce((s, r) => {
        const n = Number(r.amount);
        return Number.isFinite(n) ? s + n : s;
      }, 0),
    [rows],
  );
  const remaining = txnDebit - total;
  const matches = Math.abs(remaining) < 0.005;

  function freshRow(): SplitRow {
    return {
      key: makeKey(),
      amount: "",
      budgetLineId: "",
      fundingSourceId: "",
      description: "",
    };
  }

  function addRow() {
    setRows((r) => [...r, { ...freshRow(), amount: remaining > 0 ? remaining.toFixed(2) : "" }]);
  }
  function removeRow(key: string) {
    setRows((r) => (r.length <= 1 ? r : r.filter((x) => x.key !== key)));
  }
  function update(key: string, patch: Partial<SplitRow>) {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }
  /** Give one row the remainder needed to balance the total. */
  function absorbRemainder(key: string) {
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    const current = Number(row.amount) || 0;
    update(key, { amount: (current + remaining).toFixed(2) });
  }

  function submit(clearMode: boolean) {
    setState(undefined);
    const payload = clearMode
      ? []
      : rows
          .filter((r) => r.amount || r.budgetLineId)
          .map((r) => ({
            amount: Number(r.amount) || 0,
            budgetLineId: r.budgetLineId,
            fundingSourceId: r.fundingSourceId || null,
            description: r.description || null,
          }));

    const fd = new FormData();
    fd.append("txnId", txnId);
    fd.append("splits", JSON.stringify(payload));
    startTransition(async () => {
      const res = await saveBankSplits(undefined, fd);
      setState(res);
      if (res.ok && clearMode) setConfirmClear(false);
    });
  }

  const fieldError = (name: string) => state?.fieldErrors?.[name];

  const canSave = !pending && matches && rows.length > 0 &&
    rows.every((r) => Number(r.amount) > 0 && r.budgetLineId);

  return (
    <section className="hl-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-hl-ink">
          <Split className="h-4 w-4 text-hl-green-600" />
          Split across budget lines
        </h2>
        <div className="text-xs text-hl-muted">
          Parent debit{" "}
          <span className="font-semibold tabular-nums text-hl-ink">
            ${txnDebit.toLocaleString("en-CA", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
      <p className="mt-1 text-xs text-hl-muted">
        Use splits when one bank debit covers multiple things (a $2,000
        invoice split across two grant projects). Each split gets its own
        budget line and optional funding source. Sum of splits must equal
        the parent debit.
      </p>

      <div className="mt-4 space-y-3">
        {rows.map((row, i) => (
          <div
            key={row.key}
            className="rounded-md border border-hl-border bg-hl-cream/30 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-hl-muted">
                Split {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                disabled={pending || rows.length <= 1}
                className="rounded p-1 text-hl-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                aria-label={`Remove split ${i + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-6">
              <div className="md:col-span-2">
                <label className="hl-label text-xs">Amount</label>
                <div className="flex items-center gap-1">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-hl-muted">
                      $
                    </span>
                    <input
                      inputMode="decimal"
                      className="hl-input pl-5"
                      value={row.amount}
                      onChange={(e) => update(row.key, { amount: e.target.value })}
                      disabled={pending}
                      placeholder="0.00"
                    />
                  </div>
                  {!matches && rows.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => absorbRemainder(row.key)}
                      disabled={pending}
                      title="Give this line the remainder needed to balance"
                      className="whitespace-nowrap text-[10px] font-medium text-hl-green-700 hover:underline"
                    >
                      + {remaining.toFixed(2)}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="md:col-span-4">
                <label className="hl-label text-xs">Budget line</label>
                <select
                  className="hl-input"
                  value={row.budgetLineId}
                  onChange={(e) =>
                    update(row.key, { budgetLineId: e.target.value })
                  }
                  disabled={pending}
                >
                  <option value="">— pick —</option>
                  {budgetLineOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="hl-label text-xs">Funding source</label>
                <select
                  className="hl-input"
                  value={row.fundingSourceId}
                  onChange={(e) =>
                    update(row.key, { fundingSourceId: e.target.value })
                  }
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
              <div className="md:col-span-3">
                <label className="hl-label text-xs">
                  Description <span className="text-hl-muted">(optional)</span>
                </label>
                <input
                  className="hl-input"
                  value={row.description}
                  onChange={(e) =>
                    update(row.key, { description: e.target.value })
                  }
                  disabled={pending}
                  placeholder={parentDescription}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-hl-border pt-3">
        <button
          type="button"
          onClick={addRow}
          disabled={pending}
          className="hl-btn-ghost"
        >
          <Plus className="h-4 w-4" /> Add split
        </button>
        <div className="text-xs">
          <span className="text-hl-muted">Total split</span>{" "}
          <span
            className={`font-semibold tabular-nums ${
              matches ? "text-hl-green-700" : "text-amber-700"
            }`}
          >
            ${total.toLocaleString("en-CA", { minimumFractionDigits: 2 })}
          </span>{" "}
          <span className="text-hl-muted">
            /{" "}
            <span className="font-semibold tabular-nums text-hl-ink">
              ${txnDebit.toLocaleString("en-CA", { minimumFractionDigits: 2 })}
            </span>
          </span>
          {!matches ? (
            <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
              <TriangleAlert className="h-3 w-3" />
              {remaining > 0 ? "under" : "over"} by ${Math.abs(remaining).toFixed(2)}
            </span>
          ) : null}
        </div>
      </div>

      {fieldError("form") ? (
        <p className="mt-2 text-xs text-red-700">{fieldError("form")}</p>
      ) : null}
      {state?.error && !state.ok ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {state.error}
        </div>
      ) : null}
      {state?.ok ? (
        <div className="mt-3 rounded-md border border-hl-green-200 bg-hl-green-50 p-3 text-xs text-hl-green-800">
          Splits saved.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={!canSave}
          className="hl-btn-primary"
        >
          {pending ? "Saving…" : "Save splits"}
        </button>
        {existing.length > 0 ? (
          confirmClear ? (
            <>
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-md border border-red-600 bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Yes, clear all splits
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                disabled={pending}
                className="text-xs text-hl-muted hover:text-hl-ink"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={pending}
              className="hl-btn-ghost"
            >
              Clear all splits
            </button>
          )
        ) : null}
      </div>
    </section>
  );
}
