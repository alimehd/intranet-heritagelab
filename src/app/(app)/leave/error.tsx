"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

/**
 * Keeps a render failure inside this section instead of blanking the page, so
 * a bad date or a failed query still leaves a way back.
 */
export default function LeaveError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Vacation & sick days error:", error);
  }, [error]);

  return (
    <div className="hl-card p-6">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-hl-ink">
            Something went wrong
          </h1>
          <p className="mt-1 text-sm text-hl-muted">
            This page could not be displayed. Your booked time off is
            unaffected — nothing was saved or changed.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={reset} className="hl-btn-primary">
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
            <Link href="/leave" className="hl-btn-secondary">
              Back to overview
            </Link>
          </div>

          {error.digest ? (
            <p className="mt-4 text-xs text-hl-muted">
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
