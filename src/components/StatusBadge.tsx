const STYLES: Record<string, string> = {
  emailed: "bg-hl-green-50 text-hl-green-700 ring-1 ring-hl-green-200",
  submitted: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  failed: "bg-red-50 text-red-800 ring-1 ring-red-200",
  cancelled: "bg-hl-cream text-hl-muted ring-1 ring-hl-border line-through",
};

const LABELS: Record<string, string> = {
  emailed: "Sent to payments",
  submitted: "Submitted",
  failed: "Email failed",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: string }) {
  const styles =
    STYLES[status] ?? "bg-hl-cream text-hl-muted ring-1 ring-hl-border";
  return (
    <span className={`hl-badge ${styles}`}>{LABELS[status] ?? status}</span>
  );
}
