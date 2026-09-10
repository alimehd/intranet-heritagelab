"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { TriangleAlert, X } from "lucide-react";
import { upsertFundingSource, type ActionState } from "@/lib/budget/actions";
import {
  FUNDING_SOURCE_KINDS,
  FUNDING_SOURCE_STATUSES,
  type FundingSource,
} from "@/lib/db/schema";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const KIND_LABEL: Record<string, string> = {
  grant: "Grant",
  service_contract: "Service contract",
  donation: "Donation",
  other: "Other",
};

type CapEntry = { code: string; cap: string /* dollar string, "" = no cap */ };

type Props = {
  year: number;
  fiscalYearId: string;
  existing?: FundingSource;
  categories: { code: string; name: string }[];
};

export function FundingSourceForm({
  year,
  fiscalYearId,
  existing,
  categories,
}: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<string>(existing?.kind ?? "grant");
  const [status, setStatus] = useState<string>(existing?.status ?? "active");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  /**
   * The form works with per-category caps as `{ code, cap: string }` so the
   * empty text field ("") cleanly means "no cap / unlimited". We serialise
   * to JSON on submit and Zod coerces empty -> null in the action.
   */
  const [caps, setCaps] = useState<CapEntry[]>(() => {
    const existingCaps = existing?.categoryCaps;
    if (existingCaps && existingCaps.length > 0) {
      return existingCaps.map((c) => ({
        code: c.code,
        cap: c.cap == null ? "" : String(c.cap),
      }));
    }
    // Legacy: read allowedCategoryCodes for older rows without caps yet.
    return (existing?.allowedCategoryCodes ?? []).map((code) => ({
      code,
      cap: "",
    }));
  });

  const [monthly, setMonthly] = useState<string[]>(
    existing
      ? Array.from({ length: 12 }, (_, i) => {
          const v = existing.monthlyExpected?.[i];
          return v ? String(Number(v)) : "";
        })
      : Array(12).fill(""),
  );
  const [contractValue, setContractValue] = useState<string>(
    existing ? Number(existing.contractValue).toString() : "",
  );

  const [state, setState] = useState<ActionState | undefined>();
  const [pending, startTransition] = useTransition();

  const scheduleTotal = useMemo(
    () => monthly.reduce((s, v) => s + (Number(v) || 0), 0),
    [monthly],
  );
  const contractNum = Number(contractValue || 0);
  const contractMismatch =
    Number.isFinite(contractNum) &&
    contractNum > 0 &&
    Math.abs(contractNum - scheduleTotal) > 0.01;

  const capsTotal = useMemo(
    () =>
      caps.reduce((s, c) => {
        const n = Number(c.cap);
        return Number.isFinite(n) && n > 0 ? s + n : s;
      }, 0),
    [caps],
  );
  const capsWithLimits = caps.filter((c) => c.cap !== "").length;
  const capsExceedContract =
    contractNum > 0 && capsWithLimits > 0 && capsTotal > contractNum + 0.5;

  const codesInUse = new Set(caps.map((c) => c.code));
  const availableCategoryCodes = categories.filter(
    (c) => !codesInUse.has(c.code),
  );

  function addCap(code: string) {
    if (!code || codesInUse.has(code)) return;
    setCaps((prev) => [...prev, { code, cap: "" }].sort((a, b) => a.code.localeCompare(b.code)));
  }
  function updateCap(code: string, cap: string) {
    setCaps((prev) => prev.map((c) => (c.code === code ? { ...c, cap } : c)));
  }
  function removeCap(code: string) {
    setCaps((prev) => prev.filter((c) => c.code !== code));
  }

  function setMonth(i: number, v: string) {
    setMonthly((prev) => {
      const copy = [...prev];
      copy[i] = v;
      return copy;
    });
  }

  function syncContractValue() {
    setContractValue(scheduleTotal.toString());
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState(undefined);

    const capsPayload = caps.map((c) => ({
      code: c.code,
      cap: c.cap === "" ? null : Number(c.cap),
    }));

    const fd = new FormData();
    if (existing) fd.append("id", existing.id);
    fd.append("fiscalYearId", fiscalYearId);
    fd.append("year", String(year));
    fd.append("name", name);
    fd.append("kind", kind);
    fd.append("status", status);
    fd.append("contractValue", contractValue || "0");
    fd.append("notes", notes ?? "");
    fd.append("categoryCaps", JSON.stringify(capsPayload));
    monthly.forEach((v, i) => fd.append(`monthly_${i}`, v));

    startTransition(async () => {
      const res = await upsertFundingSource(undefined, fd);
      setState(res);
    });
  }

  const fieldError = (name: string) => state?.fieldErrors?.[name];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="hl-card p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="fs-name" className="hl-label">
              Name
            </label>
            <input
              id="fs-name"
              className="hl-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kativik Ilisarniliriniq"
              required
              disabled={pending}
            />
            {fieldError("name") ? (
              <p className="mt-1 text-xs text-red-700">{fieldError("name")}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="fs-kind" className="hl-label">
              Kind
            </label>
            <select
              id="fs-kind"
              className="hl-input"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              disabled={pending}
            >
              {FUNDING_SOURCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k] ?? k}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fs-status" className="hl-label">
              Status
            </label>
            <select
              id="fs-status"
              className="hl-input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={pending}
            >
              {FUNDING_SOURCE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fs-contract" className="hl-label">
              Contract value (annual)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-hl-muted">
                $
              </span>
              <input
                id="fs-contract"
                inputMode="decimal"
                className="hl-input pl-6"
                value={contractValue}
                onChange={(e) => setContractValue(e.target.value)}
                placeholder="0.00"
                disabled={pending}
              />
            </div>
            {contractMismatch ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                <TriangleAlert className="h-3.5 w-3.5" />
                Doesn&rsquo;t match the schedule total (${scheduleTotal.toLocaleString("en-CA")}).{" "}
                <button
                  type="button"
                  onClick={syncContractValue}
                  className="ml-1 font-medium text-hl-green-700 underline-offset-2 hover:underline"
                >
                  Sync
                </button>
              </p>
            ) : null}
          </div>

          <div className="md:col-span-2">
            <label htmlFor="fs-notes" className="hl-label">
              Notes
            </label>
            <textarea
              id="fs-notes"
              className="hl-input min-h-[80px]"
              value={notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Program purpose, restrictions in the grantor's own words, reporting deadlines…"
              disabled={pending}
            />
          </div>
        </div>
      </section>

      <section className="hl-card p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold tracking-tight text-hl-ink">
            Projected monthly receipts
          </h2>
          <span className="text-xs text-hl-muted">
            Total{" "}
            <span className="ml-1 font-semibold tabular-nums text-hl-ink">
              ${scheduleTotal.toLocaleString("en-CA")}
            </span>
          </span>
        </div>
        <p className="mb-3 text-xs text-hl-muted">
          Blank = 0. Enter the tranches you expect this year, month by month.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {MONTHS.map((m, i) => (
            <div key={m}>
              <label htmlFor={`fs-m${i}`} className="hl-label text-xs">
                {m}
              </label>
              <input
                id={`fs-m${i}`}
                inputMode="decimal"
                className="hl-input"
                value={monthly[i]}
                onChange={(e) => setMonth(i, e.target.value)}
                disabled={pending}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="hl-card p-5">
        <h2 className="text-base font-semibold tracking-tight text-hl-ink">
          Category restrictions &amp; caps
        </h2>
        <p className="mt-1 text-xs text-hl-muted">
          Leave this list empty for an unrestricted funding source (any
          category, no dollar limit). Otherwise pick each category this
          funder covers and optionally set a per-category spending cap. A
          blank cap means &ldquo;allowed with no dollar limit&rdquo;.
        </p>

        {caps.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-md border border-hl-border">
            <table className="w-full text-sm">
              <thead className="bg-hl-cream/60 text-xs uppercase tracking-wider text-hl-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-right">Annual cap ($)</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {caps.map((c) => {
                  const cat = categories.find((x) => x.code === c.code);
                  return (
                    <tr key={c.code} className="border-t border-hl-border">
                      <td className="px-3 py-2">
                        <span className="font-medium text-hl-ink">{c.code}</span>{" "}
                        <span className="text-hl-muted">
                          {cat?.name ?? "(unknown)"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="relative inline-block">
                          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-hl-muted">
                            $
                          </span>
                          <input
                            inputMode="decimal"
                            className="hl-input w-32 pl-5 text-right"
                            value={c.cap}
                            onChange={(e) => updateCap(c.code, e.target.value)}
                            placeholder="No cap"
                            disabled={pending}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => removeCap(c.code)}
                          disabled={pending}
                          className="rounded p-1 text-hl-muted hover:bg-red-50 hover:text-red-700"
                          aria-label={`Remove ${c.code}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {capsWithLimits > 0 ? (
                <tfoot className="bg-hl-cream/40 text-xs text-hl-muted">
                  <tr>
                    <td className="px-3 py-2 text-right">
                      Sum of caps ({capsWithLimits} set)
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${
                        capsExceedContract ? "text-amber-700" : "text-hl-ink"
                      }`}
                    >
                      ${capsTotal.toLocaleString("en-CA")}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        ) : null}

        {capsExceedContract ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-amber-700">
            <TriangleAlert className="h-3.5 w-3.5" />
            Sum of caps exceeds the contract value — a real funder would
            never approve that. Sanity-check the numbers.
          </p>
        ) : null}

        {availableCategoryCodes.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-hl-muted">Add category:</span>
            {availableCategoryCodes.map((c) => (
              <button
                type="button"
                key={c.code}
                onClick={() => addCap(c.code)}
                disabled={pending}
                className="rounded-full border border-hl-border bg-white px-3 py-1 text-xs font-medium text-hl-muted hover:border-hl-green-400 hover:bg-hl-green-50 hover:text-hl-green-700"
              >
                + <span className="tabular-nums">{c.code}</span> {c.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-hl-muted">
            All categories are already listed.
          </p>
        )}
      </section>

      {state?.error ? (
        <div className="hl-card border-red-200 bg-red-50/60 p-4 text-sm text-red-800">
          {state.error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="hl-btn-primary" disabled={pending}>
          {pending ? "Saving…" : existing ? "Save changes" : "Create funding source"}
        </button>
        <Link
          href={
            existing
              ? `/budget/${year}/grants/${existing.id}`
              : `/budget/${year}/grants`
          }
          className="hl-btn-ghost"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
