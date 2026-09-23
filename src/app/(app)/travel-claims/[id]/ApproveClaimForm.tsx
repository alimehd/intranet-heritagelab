"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { approveTravelClaim } from "../actions";

export function ApproveClaimForm({ claimId }: { claimId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleApprove() {
    setError(null);
    const fd = new FormData();
    fd.append("claimId", claimId);
    startTransition(async () => {
      const res = await approveTravelClaim(undefined, fd);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error ?? "Could not approve this claim.");
      }
    });
  }

  return (
    <section className="hl-card border-hl-green-200 bg-hl-green-50/50 p-6">
      <h2 className="text-lg font-semibold tracking-tight text-hl-ink">
        Your approval is needed
      </h2>
      <p className="mt-1 text-sm text-hl-muted">
        Approving signs off on this claim so payments can proceed.
      </p>
      <button
        type="button"
        onClick={handleApprove}
        disabled={pending}
        className="hl-btn-primary mt-4"
      >
        <Check className="h-4 w-4" />
        {pending ? "Approving…" : "Approve claim"}
      </button>
      {error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
    </section>
  );
}
