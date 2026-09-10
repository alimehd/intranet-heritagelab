"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import {
  setOpeningBalance,
  type ActionState,
} from "@/lib/budget/actions";

/**
 * Small inline form for setting or clearing the fiscal year opening balance.
 * Deliberately unobtrusive — Ali may not know the number for a while, so an
 * empty input is a valid state ("clear it").
 */
export function OpeningBalanceForm({
  year,
  openingBalance,
}: {
  year: number;
  openingBalance: number | null;
}) {
  const [value, setValue] = useState(
    openingBalance === null ? "" : String(openingBalance.toFixed(2)),
  );
  const [state, setState] = useState<ActionState | undefined>();
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState(undefined);
    const fd = new FormData();
    fd.append("year", String(year));
    fd.append("openingBalance", value);
    startTransition(async () => {
      const res = await setOpeningBalance(undefined, fd);
      setState(res);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[180px]">
        <label htmlFor="opening-balance" className="hl-label text-xs">
          Opening cash balance on Jan 1 {year}
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-hl-muted">
            $
          </span>
          <input
            id="opening-balance"
            name="openingBalance"
            inputMode="decimal"
            placeholder="e.g. 5295.00 — leave blank to clear"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="hl-input pl-6"
            disabled={pending}
          />
        </div>
        {state?.fieldErrors?.openingBalance ? (
          <p className="mt-1 text-xs text-red-700">
            {state.fieldErrors.openingBalance}
          </p>
        ) : null}
      </div>
      <button type="submit" className="hl-btn-secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.ok ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-hl-green-700">
          <Check className="h-3.5 w-3.5" /> Saved
        </span>
      ) : null}
      {state?.error ? (
        <span className="text-xs text-red-700">{state.error}</span>
      ) : null}
    </form>
  );
}
