"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  cancelExpenseReport,
  type CancelErState,
} from "@/lib/budget/er-actions";
import type { ExpenseReportStatus } from "@/lib/budget/er-schema";

export function CancelForm({
  reportId,
  status,
}: {
  reportId: string;
  year: number;
  status: ExpenseReportStatus;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<CancelErState | undefined>();
  const [pending, startTransition] = useTransition();

  function submit() {
    const fd = new FormData();
    fd.append("reportId", reportId);
    fd.append("reason", reason);
    startTransition(async () => {
      const res = await cancelExpenseReport(undefined, fd);
      setState(res);
      if (res.ok) {
        setConfirming(false);
        setReason("");
      }
    });
  }

  if (!confirming) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="hl-btn-ghost text-red-700"
        >
          <Trash2 className="h-4 w-4" />
          Cancel this report
        </button>
      </div>
    );
  }

  return (
    <section className="hl-card border-red-200 bg-red-50/40 p-5">
      <h2 className="text-base font-semibold tracking-tight text-red-900">
        Cancel this report?
      </h2>
      <p className="mt-1 text-xs text-hl-muted">
        {status === "paid"
          ? "This will unpin the linked bank transaction and reopen it as unclassified."
          : "The submitter and approver will both be notified."}
      </p>
      <div className="mt-3">
        <label htmlFor="cancel-reason" className="hl-label">
          Reason (optional)
        </label>
        <textarea
          id="cancel-reason"
          className="hl-input min-h-[60px]"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          disabled={pending}
        />
      </div>
      {state?.error ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50/70 p-3 text-sm text-red-800">
          {state.error}
        </div>
      ) : null}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={submit}
          className="hl-btn-primary bg-red-700 hover:bg-red-800"
          disabled={pending}
        >
          {pending ? "Cancelling…" : "Yes, cancel"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="hl-btn-ghost"
          disabled={pending}
        >
          Keep report
        </button>
      </div>
    </section>
  );
}
