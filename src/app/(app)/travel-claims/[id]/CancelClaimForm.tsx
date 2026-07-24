"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { cancelTravelClaim } from "../actions";

export function CancelClaimForm({ claimId }: { claimId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.append("claimId", claimId);
    fd.append("reason", reason);
    startTransition(async () => {
      const res = await cancelTravelClaim(undefined, fd);
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      } else {
        setError(res.error ?? "Could not cancel this claim.");
      }
    });
  }

  return (
    <section className="hl-card p-6">
      <h2 className="text-lg font-semibold tracking-tight text-hl-ink">
        Cancel this claim
      </h2>
      <p className="mt-1 text-sm text-hl-muted">
        Cancelling withdraws the claim and emails payments@heritagelab.ca so it
        is not reimbursed. This cannot be undone.
      </p>

      {confirming ? (
        <form onSubmit={handleCancel} className="mt-4 space-y-3">
          <div>
            <label className="hl-label" htmlFor="cancel-reason">
              Reason (optional)
            </label>
            <textarea
              id="cancel-reason"
              className="hl-input min-h-[70px]"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. trip postponed, submitted in error, duplicate claim…"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Ban className="h-4 w-4" />
              {pending ? "Cancelling…" : "Confirm cancellation"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="hl-btn-secondary"
            >
              Keep claim
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-50"
        >
          <Ban className="h-4 w-4" /> Cancel claim
        </button>
      )}

      {error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
    </section>
  );
}
