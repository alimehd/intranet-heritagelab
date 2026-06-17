export function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "emailed"
      ? "bg-hl-green-50 text-hl-green-700 ring-1 ring-hl-green-200"
      : status === "submitted"
        ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
        : status === "failed"
          ? "bg-red-50 text-red-800 ring-1 ring-red-200"
          : "bg-hl-cream text-hl-muted ring-1 ring-hl-border";
  const label =
    status === "emailed"
      ? "Sent to payments"
      : status === "submitted"
        ? "Submitted"
        : status === "failed"
          ? "Email failed"
          : status;
  return <span className={`hl-badge ${styles}`}>{label}</span>;
}
