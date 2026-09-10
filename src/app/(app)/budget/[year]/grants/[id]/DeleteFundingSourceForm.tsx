"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteFundingSource, type ActionState } from "@/lib/budget/actions";

/**
 * Delete a funding source. Two-step: first click asks the server if it's
 * safe (i.e. no references) — if references exist, the server returns an
 * explanatory error which becomes an inline confirmation prompt. The
 * second click sends confirm=1 and actually deletes.
 */
export function DeleteFundingSourceForm({
  id,
  year,
  name,
}: {
  id: string;
  year: number;
  name: string;
}) {
  const [state, setState] = useState<ActionState | undefined>();
  const [pending, startTransition] = useTransition();
  const [confirmNeeded, setConfirmNeeded] = useState(false);

  function submit(confirmed: boolean) {
    setState(undefined);
    const fd = new FormData();
    fd.append("id", id);
    fd.append("year", String(year));
    if (confirmed) fd.append("confirm", "1");
    startTransition(async () => {
      const res = await deleteFundingSource(undefined, fd);
      setState(res);
      // If the server said "in use", flip into confirmation mode; keep the
      // error text visible so the user knows what confirming actually does.
      if (!res.ok && res.error?.startsWith("In use")) {
        setConfirmNeeded(true);
      }
    });
  }

  return (
    <div className="space-y-2">
      {state?.error && !confirmNeeded ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {state.error}
        </div>
      ) : null}
      {confirmNeeded ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-medium">This funding source is in use:</div>
          <div className="mt-1">{state?.error}</div>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => submit(confirmNeeded)}
          disabled={pending}
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition ${
            confirmNeeded
              ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
              : "border-red-200 bg-white text-red-700 hover:bg-red-50"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <Trash2 className="h-4 w-4" />
          {pending
            ? "Deleting…"
            : confirmNeeded
              ? `Yes, delete "${name}" anyway`
              : "Delete funding source"}
        </button>
        {confirmNeeded ? (
          <button
            type="button"
            onClick={() => {
              setConfirmNeeded(false);
              setState(undefined);
            }}
            disabled={pending}
            className="text-xs text-hl-muted hover:text-hl-ink"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
