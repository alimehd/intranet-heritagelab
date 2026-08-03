"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { pluralDays } from "@/lib/leave/dates";
import { decideLeaveRequest } from "../actions";

export function LeaveDecisionForm({
  requestId,
  employeeName,
  dayCount,
}: {
  requestId: string;
  employeeName: string;
  dayCount: number;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function decide(decision: "approved" | "declined") {
    setError(null);
    const fd = new FormData();
    fd.append("requestId", requestId);
    fd.append("decision", decision);
    fd.append("note", note);

    startTransition(async () => {
      const res = await decideLeaveRequest(undefined, fd);
      if (res.ok) router.refresh();
      else setError(res.error ?? "Could not record that decision.");
    });
  }

  const firstName = employeeName.split(" ")[0];

  return (
    <section className="hl-card border-amber-200 p-6">
      <h2 className="text-lg font-semibold tracking-tight text-hl-ink">
        Review this request
      </h2>
      <p className="mt-1 text-sm text-hl-muted">
        Approving charges {pluralDays(dayCount)} to {firstName}&apos;s
        entitlement. Either way, {firstName} is emailed the outcome.
      </p>

      <div className="mt-4">
        <label className="hl-label" htmlFor="decision-note">
          Note for {firstName} (optional)
        </label>
        <textarea
          id="decision-note"
          className="hl-input min-h-[70px]"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. approved — please hand over the Kuujjuaq file before you go"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => decide("approved")}
          disabled={pending}
          className="hl-btn-primary"
        >
          <Check className="h-4 w-4" />
          {pending ? "Saving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => decide("declined")}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X className="h-4 w-4" /> Decline
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
    </section>
  );
}
