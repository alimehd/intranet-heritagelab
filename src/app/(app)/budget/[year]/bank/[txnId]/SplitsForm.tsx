"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Split, Trash2, TriangleAlert } from "lucide-react";
import { saveBankSplits, type SplitState } from "@/lib/budget/bank-actions";
import {
  percentFromAmount,
  type SimilarTxnStats,
} from "@/lib/budget/payee";
import { groupBudgetLineOptions, type BudgetLineOption } from "@/lib/budget/line-options";

type Option = BudgetLineOption;
type FundingOption = { id: string; label: string; kind: string; projectLineId: string | null };

type SplitRow = {
  key: string;
  amount: string;
  percent: string;
  budgetLineId: string;
  fundingSourceId: string;
  description: string;
  /** True while `budgetLineId` was auto-filled from the funding source's
   * project line rather than picked by hand — cleared on manual edit. */
  lineAutoFilled: boolean;
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
  similar,
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
  similar: SimilarTxnStats;
}) {
  const [rows, setRows] = useState<SplitRow[]>(() => {
    if (existing.length === 0) {
      // Start with 2 empty rows so it's obvious what the UX is for.
      return [freshRow(), freshRow()];
    }
    return existing.map((e) => ({
      key: e.id,
      amount: Number(e.amount).toString(),
      percent: percentFromAmount(Number(e.amount), txnDebit).toString(),
      budgetLineId: e.budgetLineId,
      fundingSourceId: e.fundingSourceId ?? "",
      description: e.description ?? "",
      lineAutoFilled: false,
    }));
  });
  const [state, setState] = useState<SplitState | undefined>();
  const [pending, startTransition] = useTransition();
  const [confirmClear, setConfirmClear] = useState(false);
  const [applySimilar, setApplySimilar] = useState(false);
  const [overwriteSimilar, setOverwriteSimilar] = useState(false);

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
  const percentTotal = useMemo(
    () =>
      rows.reduce((s, r) => {
        const n = Number(r.percent);
        return Number.isFinite(n) ? s + n : s;
      }, 0),
    [rows],
  );

  function freshRow(): SplitRow {
    return {
      key: makeKey(),
      amount: "",
      percent: "",
      budgetLineId: "",
      fundingSourceId: "",
      description: "",
      lineAutoFilled: false,
    };
  }

  const lineGroups = useMemo(
    () => groupBudgetLineOptions(budgetLineOptions),
    [budgetLineOptions],
  );

  /** Same auto-fill convenience as the main classify form, per split row. */
  function setSplitFundingSource(key: string, fundingSourceId: string) {
    const row = rows.find((r) => r.key === key);
    const source = fundingOptions.find((f) => f.id === fundingSourceId);
    const hasLine =
      !!source?.projectLineId &&
      budgetLineOptions.some((o) => o.id === source.projectLineId);
    if (row && hasLine && (row.budgetLineId === "" || row.lineAutoFilled)) {
      update(key, {
        fundingSourceId,
        budgetLineId: source!.projectLineId!,
        lineAutoFilled: true,
      });
    } else {
      update(key, { fundingSourceId });
    }
  }

  function addRow() {
    setRows((r) => [
      ...r,
      {
        ...freshRow(),
        amount: remaining > 0 ? remaining.toFixed(2) : "",
        percent:
          remaining > 0 ? percentFromAmount(remaining, txnDebit).toString() : "",
      },
    ]);
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
    const next = current + remaining;
    update(key, {
      amount: next.toFixed(2),
      percent: percentFromAmount(next, txnDebit).toString(),
    });
  }

  function setAmount(key: string, amount: string) {
    const n = Number(amount);
    update(key, {
      amount,
      percent: Number.isFinite(n) && n > 0
        ? percentFromAmount(n, txnDebit).toString()
        : "",
    });
  }

  function setPercent(key: string, percent: string) {
    const n = Number(percent);
    const amount =
      percent.trim() !== "" && Number.isFinite(n) && n >= 0 && txnDebit > 0
        ? ((txnDebit * n) / 100).toFixed(2)
        : "";
    update(key, { percent, amount });
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
    if (applySimilar && !clearMode) fd.append("applySimilar", "1");
    if (overwriteSimilar && !clearMode) fd.append("overwriteSimilar", "1");
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
        Use splits when one bank debit covers multiple things — a Nethris
        payroll across salary lines, or one invoice across two grants.
        Enter dollars or percentages; they stay in sync. Sum must equal
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
                      onChange={(e) => setAmount(row.key, e.target.value)}
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
              <div>
                <label className="hl-label text-xs">Percent</label>
                <div className="relative">
                  <input
                    inputMode="decimal"
                    className="hl-input pr-7"
                    value={row.percent}
                    onChange={(e) => setPercent(row.key, e.target.value)}
                    disabled={pending}
                    placeholder="0"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-hl-muted">
                    %
                  </span>
                </div>
              </div>
              <div className="md:col-span-3">
                <label className="hl-label text-xs">Funding source</label>
                <select
                  className="hl-input"
                  value={row.fundingSourceId}
                  onChange={(e) => setSplitFundingSource(row.key, e.target.value)}
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
                <label className="hl-label text-xs">Budget line</label>
                <select
                  className="hl-input"
                  value={row.budgetLineId}
                  onChange={(e) =>
                    update(row.key, {
                      budgetLineId: e.target.value,
                      lineAutoFilled: false,
                    })
                  }
                  disabled={pending}
                >
                  <option value="">— pick —</option>
                  {lineGroups.map((g) => (
                    <optgroup key={g.categoryCode} label={`${g.categoryCode} · ${g.categoryName}`}>
                      {g.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {row.lineAutoFilled ? (
                  <p className="mt-1 text-[10px] text-hl-green-700">
                    Auto-filled from the project line.
                  </p>
                ) : null}
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
            <span className="ml-2 tabular-nums">
              ({percentTotal.toFixed(1)}%)
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
          Splits saved
          {state.appliedCount
            ? ` — also applied by % to ${state.appliedCount} similar transaction${state.appliedCount === 1 ? "" : "s"}.`
            : "."}
        </div>
      ) : null}

      {similar.siblingCount > 0 ? (
        <div className="mt-4 rounded-md border border-hl-border bg-hl-cream/40 p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-hl-green-600"
              checked={applySimilar}
              onChange={(e) => setApplySimilar(e.target.checked)}
              disabled={pending}
            />
            <span>
              <span className="text-sm font-medium text-hl-ink">
                Apply these percentages to all {similar.siblingCount} other
                &ldquo;{similar.label}&rdquo; transaction
                {similar.siblingCount === 1 ? "" : "s"}
              </span>
              <span className="mt-0.5 block text-xs text-hl-muted">
                Each sibling is split by the same % (dollar amounts scale to
                that row&rsquo;s debit). Unclassified and already-tagged
                direct expenses are included; rows that already have splits
                are skipped unless you overwrite.
              </span>
            </span>
          </label>
          {applySimilar ? (
            <label className="mt-3 ml-7 flex cursor-pointer items-center gap-2 text-xs text-hl-muted">
              <input
                type="checkbox"
                className="h-4 w-4 accent-hl-green-600"
                checked={overwriteSimilar}
                onChange={(e) => setOverwriteSimilar(e.target.checked)}
                disabled={pending}
              />
              Overwrite existing splits on those rows too
            </label>
          ) : null}
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
