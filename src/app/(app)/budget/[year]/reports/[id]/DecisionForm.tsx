"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import {
  decideExpenseReport,
  type DecisionState,
} from "@/lib/budget/er-actions";

export function DecisionForm({
  reportId,
}: {
  reportId: string;
  year: number;
}) {
  const [note, setNote] = useState("");
  const [state, setState] = useState<DecisionState | undefined>();
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    setState(undefined);
    if (decision === "rejected" && note.trim().length < 3) {
      setState({
        ok: false,
        error: "Add a short reason so the submitter knows what to fix.",
        fieldErrors: { note: "Give a short reason." },
      });
      return;
    }
    const fd = new FormData();
    fd.append("reportId", reportId);
    fd.append("decision", decision);
    fd.append("note", note);
    startTransition(async () => {
      const res = await decideExpenseReport(undefined, fd);
      setState(res);
    });
  }

  return (
    <section className="hl-card border-blue-200 bg-blue-50/40 p-5">
      <h2 className="text-base font-semibold tracking-tight text-hl-ink">
        Decide on this report
      </h2>
      <p className="mt-1 text-xs text-hl-muted">
        Approving flips this to <strong>Approved (unpaid)</strong>. It will be
        marked <strong>Paid</strong> once the reimbursement bank transfer is
        imported and linked. Rejecting reopens it as a draft for the submitter
        to edit — a reason is required.
      </p>
      <div className="mt-4">
        <label htmlFor="decision-note" className="hl-label">
          Note (required to reject; optional to approve)
        </label>
        <textarea
          id="decision-note"
          className="hl-input min-h-[70px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          disabled={pending}
          placeholder="e.g. Approved — reimburse via Sep 3 TD transfer."
        />
        {state?.fieldErrors?.note ? (
          <p className="mt-1 text-xs text-red-700">{state.fieldErrors.note}</p>
        ) : null}
      </div>
      {state?.error ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50/70 p-3 text-sm text-red-800">
          {state.error}
        </div>
      ) : null}
      {state?.ok ? (
        <div className="mt-3 rounded border border-hl-green-200 bg-hl-green-50/60 p-3 text-sm text-hl-green-800">
          Saved.
        </div>
      ) : null}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => decide("approved")}
          className="hl-btn-primary"
          disabled={pending}
        >
          <Check className="h-4 w-4" />
          Approve
        </button>
        <button
          type="button"
          onClick={() => decide("rejected")}
          className="hl-btn-ghost text-red-700"
          disabled={pending}
        >
          <X className="h-4 w-4" />
          Reject
        </button>
      </div>
    </section>
  );
}
