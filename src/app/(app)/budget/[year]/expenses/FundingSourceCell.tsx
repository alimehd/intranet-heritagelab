"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateExpenseFundingSource } from "@/lib/budget/ledger-actions";

type FundingOption = { id: string; label: string };

/**
 * Inline funding-source picker for one row of the Expenses ledger. Saves
 * on change via a server action — no separate "save" button, matching the
 * quick-edit feel of a spreadsheet cell.
 */
export function FundingSourceCell({
  year,
  kind,
  id,
  value,
  options,
}: {
  year: number;
  kind: "bank" | "manual" | "split" | "er";
  id: string;
  value: string | null;
  options: FundingOption[];
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: string) {
    setCurrent(next);
    setError(null);
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("id", id);
    fd.append("year", String(year));
    fd.append("fundingSourceId", next);
    startTransition(async () => {
      const res = await updateExpenseFundingSource(undefined, fd);
      if (!res.ok) {
        setError(res.error ?? "Failed to save.");
        setCurrent(value ?? "");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div>
      <select
        className="hl-input h-7 w-full min-w-[9rem] px-2 py-0 text-xs"
        value={current}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
      >
        <option value="">— none / general —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-0.5 text-[10px] text-red-700">{error}</p> : null}
    </div>
  );
}
