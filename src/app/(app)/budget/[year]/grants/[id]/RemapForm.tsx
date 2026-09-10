"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import {
  remapFundingSourceForBudgetLine,
  type ActionState,
} from "@/lib/budget/actions";

type BudgetLineOption = { id: string; label: string };

type RemapState = ActionState & {
  counts?: {
    bankUpdated: number;
    splitUpdated: number;
    erLineUpdated: number;
  };
};

/**
 * Bulk-tag every expense on a given budget line with THIS funding source.
 * Fixes the historical VOICES/McGill/... rows where the project/funder was
 * baked into the budget-line code instead of being tagged separately.
 *
 * "Only rows currently missing a funding source" is the default (safe,
 * additive). Toggling overwrite also replaces existing tags.
 */
export function RemapForm({
  year,
  fundingSourceId,
  fundingSourceName,
  budgetLineOptions,
}: {
  year: number;
  fundingSourceId: string;
  fundingSourceName: string;
  budgetLineOptions: BudgetLineOption[];
}) {
  const [budgetLineId, setBudgetLineId] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [state, setState] = useState<RemapState | undefined>();
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!budgetLineId) return;
    setState(undefined);
    const fd = new FormData();
    fd.append("fundingSourceId", fundingSourceId);
    fd.append("budgetLineId", budgetLineId);
    fd.append("year", String(year));
    if (overwrite) fd.append("overwrite", "1");
    startTransition(async () => {
      const res = await remapFundingSourceForBudgetLine(undefined, fd);
      setState(res);
    });
  }

  const total = state?.counts
    ? state.counts.bankUpdated +
      state.counts.splitUpdated +
      state.counts.erLineUpdated
    : 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-6">
        <div className="md:col-span-4">
          <label className="hl-label" htmlFor="remap-line">
            Budget line whose expenses should be tagged &ldquo;{fundingSourceName}
            &rdquo;
          </label>
          <select
            id="remap-line"
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
        </div>
        <div className="md:col-span-2 flex items-end">
          <label className="inline-flex items-center gap-2 text-xs text-hl-muted">
            <input
              type="checkbox"
              className="h-4 w-4 accent-hl-green-600"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              disabled={pending}
            />
            Overwrite existing funding-source tags too
          </label>
        </div>
      </div>

      {state?.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {state.error}
        </div>
      ) : null}
      {state?.ok && state.counts ? (
        <div className="rounded-md border border-hl-green-200 bg-hl-green-50 p-3 text-xs text-hl-green-800">
          Updated {total} row{total === 1 ? "" : "s"} — bank txns:{" "}
          {state.counts.bankUpdated}, splits: {state.counts.splitUpdated}, ER
          lines: {state.counts.erLineUpdated}.
        </div>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !budgetLineId}
        className="hl-btn-secondary"
      >
        <Sparkles className="h-4 w-4" />
        {pending ? "Tagging…" : "Tag matching expenses"}
      </button>
    </div>
  );
}
