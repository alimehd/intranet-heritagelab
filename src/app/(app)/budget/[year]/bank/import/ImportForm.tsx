"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, FileUp } from "lucide-react";
import { importBankCsv, type ImportState } from "@/lib/budget/bank-actions";

type Account = { id: string; name: string };

export function ImportForm({
  year,
  accounts,
}: {
  year: number;
  accounts: Account[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [accountMode, setAccountMode] = useState<"existing" | "new">(
    accounts.length > 0 ? "existing" : "new",
  );
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [newAccountName, setNewAccountName] = useState("");
  const [state, setState] = useState<ImportState | undefined>();
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState(undefined);
    if (!file) {
      setState({ ok: false, error: "Pick a CSV file to import." });
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    if (accountMode === "existing") {
      fd.append("accountId", accountId);
    } else {
      fd.append("newAccountName", newAccountName);
    }
    startTransition(async () => {
      const res = await importBankCsv(undefined, fd);
      setState(res);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className="hl-card p-5">
        <div className="space-y-4">
          <div>
            <label className="hl-label">Bank account</label>
            {accounts.length > 0 ? (
              <div className="mb-2 flex gap-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    checked={accountMode === "existing"}
                    onChange={() => setAccountMode("existing")}
                    disabled={pending}
                  />
                  Existing
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    checked={accountMode === "new"}
                    onChange={() => setAccountMode("new")}
                    disabled={pending}
                  />
                  New
                </label>
              </div>
            ) : (
              <p className="mb-2 text-xs text-hl-muted">
                First import — this creates the account record.
              </p>
            )}

            {accountMode === "existing" && accounts.length > 0 ? (
              <select
                className="hl-input"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                disabled={pending}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="hl-input"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                placeholder="e.g. TD Business Chequing 1234"
                disabled={pending}
              />
            )}
          </div>

          <div>
            <label htmlFor="csv-file" className="hl-label">
              CSV file
            </label>
            <label
              htmlFor="csv-file"
              className="flex cursor-pointer items-center gap-3 rounded-md border-2 border-dashed border-hl-border bg-hl-cream/40 px-4 py-6 text-sm text-hl-muted transition hover:border-hl-green-600 hover:text-hl-ink"
            >
              <FileUp className="h-5 w-5" />
              <span className="flex-1">
                {file ? (
                  <>
                    <span className="font-medium text-hl-ink">{file.name}</span>{" "}
                    <span className="text-xs text-hl-muted">
                      ({Math.round(file.size / 1024)} KB)
                    </span>
                  </>
                ) : (
                  <>Click to pick a TD account activity CSV (max 5 MB)</>
                )}
              </span>
              <input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={pending}
              />
            </label>
          </div>
        </div>
      </section>

      {state?.error ? (
        <div className="hl-card border-red-200 bg-red-50/60 p-4 text-sm text-red-800">
          {state.error}
        </div>
      ) : null}

      {state?.ok && state.imported ? (
        <div className="hl-card border-hl-green-200 bg-hl-green-50/50 p-5">
          <div className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 text-hl-green-700" />
            <div>
              <h3 className="text-base font-semibold text-hl-ink">
                Imported {state.imported.inserted} new transaction
                {state.imported.inserted === 1 ? "" : "s"}
              </h3>
              <p className="mt-1 text-sm text-hl-muted">
                {state.imported.duplicates} duplicate row
                {state.imported.duplicates === 1 ? "" : "s"} skipped ·{" "}
                {state.imported.autoTagged} auto-tagged as fees / reversals ·
                account <strong>{state.imported.account}</strong>
                {state.imported.periodFrom && state.imported.periodTo ? (
                  <>
                    {" "}
                    · period {state.imported.periodFrom} → {state.imported.periodTo}
                  </>
                ) : null}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/budget/${state.imported.year}/bank?classification=unclassified`}
                  className="hl-btn-primary"
                >
                  Classify {state.imported.inserted - state.imported.autoTagged} unclassified →
                </Link>
                <Link
                  href={`/budget/${state.imported.year}/bank`}
                  className="hl-btn-secondary"
                >
                  View ledger
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="hl-btn-primary" disabled={pending}>
          {pending ? "Importing…" : "Import CSV"}
        </button>
        <Link href={`/budget/${year}/bank`} className="hl-btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
