"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { saveExpenseReport, type ErActionState } from "@/lib/budget/er-actions";

type CategoryOption = {
  id: string;
  code: string;
  name: string;
  lines: { id: string; code: string; fullCode: string; name: string }[];
};

type FundingOption = { id: string; name: string; kind: string };

type LineDraft = {
  clientId: string;
  expenseDate: string;
  description: string;
  categoryId: string;
  budgetLineId: string;
  fundingSourceId: string;
  cost: string;
  // Receipt state
  existingReceiptName: string | null;
  existingReceiptUrl: string | null;
  newReceiptName: string | null;
};

export type InitialReport = {
  id: string | null;
  title: string;
  periodFrom: string;
  periodTo: string;
  businessPurpose: string;
  approverEmail: string;
  status: string;
  lines: LineDraft[];
};

export function ExpenseReportForm({
  year,
  initial,
  categories,
  fundingSources,
  defaultApproverEmail,
  blobConfigured,
  editable = true,
}: {
  year: number;
  initial: InitialReport;
  categories: CategoryOption[];
  fundingSources: FundingOption[];
  defaultApproverEmail: string;
  blobConfigured: boolean;
  editable?: boolean;
}) {
  const [title, setTitle] = useState(initial.title);
  const [periodFrom, setPeriodFrom] = useState(initial.periodFrom);
  const [periodTo, setPeriodTo] = useState(initial.periodTo);
  const [businessPurpose, setBusinessPurpose] = useState(initial.businessPurpose);
  const [approverEmail, setApproverEmail] = useState(
    initial.approverEmail || defaultApproverEmail,
  );
  const [lines, setLines] = useState<LineDraft[]>(
    initial.lines.length > 0 ? initial.lines : [makeBlankLine()],
  );
  // Track selected files by clientId across renders, since File objects
  // don't survive re-renders when kept in state via the input element alone.
  const filesRef = useRef<Map<string, File>>(new Map());

  const [state, setState] = useState<ErActionState | undefined>();
  const [pending, startTransition] = useTransition();

  const linesById = useMemo(() => {
    const map = new Map<string, CategoryOption["lines"][number]>();
    for (const c of categories) {
      for (const l of c.lines) map.set(l.id, l);
    }
    return map;
  }, [categories]);

  const linesByCategoryId = useMemo(() => {
    const m = new Map<string, CategoryOption["lines"]>();
    for (const c of categories) m.set(c.id, c.lines);
    return m;
  }, [categories]);

  const total = lines.reduce((s, l) => s + (Number(l.cost) || 0), 0);
  const fieldError = (path: string) => state?.fieldErrors?.[path];

  function updateLine<K extends keyof LineDraft>(
    clientId: string,
    key: K,
    value: LineDraft[K],
  ) {
    setLines((prev) =>
      prev.map((l) => (l.clientId === clientId ? { ...l, [key]: value } : l)),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, makeBlankLine()]);
  }

  function removeLine(clientId: string) {
    filesRef.current.delete(clientId);
    setLines((prev) =>
      prev.length === 1 ? prev : prev.filter((l) => l.clientId !== clientId),
    );
  }

  function handleFileChange(clientId: string, file: File | null) {
    if (file) {
      filesRef.current.set(clientId, file);
      updateLine(clientId, "newReceiptName", file.name);
    } else {
      filesRef.current.delete(clientId);
      updateLine(clientId, "newReceiptName", null);
    }
  }

  function buildFormData(mode: "draft" | "submit"): FormData | null {
    const payload = {
      title: title.trim(),
      periodFrom,
      periodTo,
      businessPurpose: businessPurpose.trim() || undefined,
      approverEmail: approverEmail.trim(),
      lines: lines.map((l) => ({
        clientId: l.clientId,
        expenseDate: l.expenseDate,
        description: l.description.trim(),
        budgetLineId: l.budgetLineId,
        fundingSourceId: l.fundingSourceId || null,
        cost: Number(l.cost) || 0,
      })),
    };
    const fd = new FormData();
    fd.append("mode", mode);
    if (initial.id) fd.append("reportId", initial.id);
    fd.append("payload", JSON.stringify(payload));
    for (const [cid, file] of filesRef.current.entries()) {
      fd.append(`receipt_${cid}`, file);
    }
    return fd;
  }

  function submit(mode: "draft" | "submit") {
    if (!editable) return;
    setState(undefined);
    const fd = buildFormData(mode);
    if (!fd) return;
    startTransition(async () => {
      const res = await saveExpenseReport(undefined, fd);
      // On success the action redirects, so we only see a return here on failure.
      setState(res);
    });
  }

  const canRemove = lines.length > 1;
  const submitLabel = initial.id
    ? "Save & submit for approval"
    : "Create & submit for approval";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit("submit");
      }}
      className="space-y-5"
    >
      {!blobConfigured ? (
        <div className="hl-card border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900">
          Receipt storage is <strong>not configured</strong> (BLOB_READ_WRITE_TOKEN missing).
          You can still submit reports — attached files will be embedded in the
          approval email PDF but won&rsquo;t be saved for later download.
        </div>
      ) : null}

      <section className="hl-card p-5">
        <h2 className="text-base font-semibold tracking-tight text-hl-ink">
          Report details
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="hl-label" htmlFor="title">
              Report title
            </label>
            <input
              id="title"
              className="hl-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. August 2026 Expenses"
              disabled={!editable || pending}
              maxLength={120}
              required
            />
            {fieldError("title") ? (
              <p className="mt-1 text-xs text-red-700">{fieldError("title")}</p>
            ) : null}
          </div>
          <div>
            <label className="hl-label" htmlFor="periodFrom">
              Period from
            </label>
            <input
              id="periodFrom"
              type="date"
              className="hl-input"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              disabled={!editable || pending}
              required
            />
            {fieldError("periodFrom") ? (
              <p className="mt-1 text-xs text-red-700">{fieldError("periodFrom")}</p>
            ) : null}
          </div>
          <div>
            <label className="hl-label" htmlFor="periodTo">
              Period to
            </label>
            <input
              id="periodTo"
              type="date"
              className="hl-input"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              disabled={!editable || pending}
              required
            />
            {fieldError("periodTo") ? (
              <p className="mt-1 text-xs text-red-700">{fieldError("periodTo")}</p>
            ) : null}
          </div>
          <div>
            <label className="hl-label" htmlFor="approver">
              Approver email
            </label>
            <input
              id="approver"
              type="email"
              className="hl-input"
              value={approverEmail}
              onChange={(e) => setApproverEmail(e.target.value)}
              disabled={!editable || pending}
              required
            />
            {fieldError("approverEmail") ? (
              <p className="mt-1 text-xs text-red-700">{fieldError("approverEmail")}</p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <label className="hl-label" htmlFor="purpose">
              Business purpose (optional)
            </label>
            <textarea
              id="purpose"
              className="hl-input min-h-[70px]"
              value={businessPurpose}
              onChange={(e) => setBusinessPurpose(e.target.value)}
              maxLength={1000}
              placeholder="One or two sentences the approver can skim."
              disabled={!editable || pending}
            />
          </div>
        </div>
      </section>

      <section className="hl-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-hl-ink">
            Line items
          </h2>
          <p className="text-xs text-hl-muted">
            {lines.length} line{lines.length === 1 ? "" : "s"} · Total {formatCad(total)}
          </p>
        </div>

        <div className="mt-3 space-y-3">
          {lines.map((line, idx) => {
            const availableLines = line.categoryId
              ? linesByCategoryId.get(line.categoryId) ?? []
              : [];
            const linePathPrefix = `lines.${idx}`;
            return (
              <div
                key={line.clientId}
                className="rounded-md border border-hl-border bg-white p-4"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-hl-muted">
                    Line {idx + 1}
                  </span>
                  {canRemove && editable ? (
                    <button
                      type="button"
                      onClick={() => removeLine(line.clientId)}
                      className="text-xs text-red-700 hover:underline disabled:opacity-50"
                      disabled={pending}
                    >
                      <Trash2 className="mr-1 inline h-3 w-3" />
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-6">
                  <div className="sm:col-span-2">
                    <label className="hl-label" htmlFor={`date-${line.clientId}`}>
                      Date
                    </label>
                    <input
                      id={`date-${line.clientId}`}
                      type="date"
                      className="hl-input"
                      value={line.expenseDate}
                      onChange={(e) =>
                        updateLine(line.clientId, "expenseDate", e.target.value)
                      }
                      disabled={!editable || pending}
                      required
                    />
                    {fieldError(`${linePathPrefix}.expenseDate`) ? (
                      <p className="mt-1 text-xs text-red-700">
                        {fieldError(`${linePathPrefix}.expenseDate`)}
                      </p>
                    ) : null}
                  </div>
                  <div className="sm:col-span-3">
                    <label className="hl-label" htmlFor={`desc-${line.clientId}`}>
                      Description
                    </label>
                    <input
                      id={`desc-${line.clientId}`}
                      className="hl-input"
                      value={line.description}
                      onChange={(e) =>
                        updateLine(line.clientId, "description", e.target.value)
                      }
                      placeholder="e.g. Zoom subscription — August"
                      maxLength={240}
                      disabled={!editable || pending}
                      required
                    />
                    {fieldError(`${linePathPrefix}.description`) ? (
                      <p className="mt-1 text-xs text-red-700">
                        {fieldError(`${linePathPrefix}.description`)}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="hl-label" htmlFor={`cost-${line.clientId}`}>
                      Cost (CAD)
                    </label>
                    <input
                      id={`cost-${line.clientId}`}
                      type="number"
                      min="0"
                      step="0.01"
                      className="hl-input"
                      value={line.cost}
                      onChange={(e) =>
                        updateLine(line.clientId, "cost", e.target.value)
                      }
                      disabled={!editable || pending}
                      required
                    />
                    {fieldError(`${linePathPrefix}.cost`) ? (
                      <p className="mt-1 text-xs text-red-700">
                        {fieldError(`${linePathPrefix}.cost`)}
                      </p>
                    ) : null}
                  </div>

                  <div className="sm:col-span-3">
                    <label className="hl-label" htmlFor={`cat-${line.clientId}`}>
                      Budget category
                    </label>
                    <select
                      id={`cat-${line.clientId}`}
                      className="hl-input"
                      value={line.categoryId}
                      onChange={(e) => {
                        const newCat = e.target.value;
                        setLines((prev) =>
                          prev.map((l) =>
                            l.clientId === line.clientId
                              ? { ...l, categoryId: newCat, budgetLineId: "" }
                              : l,
                          ),
                        );
                      }}
                      disabled={!editable || pending}
                      required
                    >
                      <option value="">— pick a category —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} · {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="hl-label" htmlFor={`line-${line.clientId}`}>
                      Budget line
                    </label>
                    <select
                      id={`line-${line.clientId}`}
                      className="hl-input"
                      value={line.budgetLineId}
                      onChange={(e) =>
                        updateLine(line.clientId, "budgetLineId", e.target.value)
                      }
                      disabled={!editable || pending || !line.categoryId}
                      required
                    >
                      <option value="">
                        {line.categoryId ? "— pick a line —" : "pick a category first"}
                      </option>
                      {availableLines.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.fullCode} · {l.name}
                        </option>
                      ))}
                    </select>
                    {fieldError(`${linePathPrefix}.budgetLineId`) ? (
                      <p className="mt-1 text-xs text-red-700">
                        {fieldError(`${linePathPrefix}.budgetLineId`)}
                      </p>
                    ) : null}
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      className="hl-label"
                      htmlFor={`funding-${line.clientId}`}
                    >
                      Funding source (optional)
                    </label>
                    <select
                      id={`funding-${line.clientId}`}
                      className="hl-input"
                      value={line.fundingSourceId}
                      onChange={(e) =>
                        updateLine(line.clientId, "fundingSourceId", e.target.value)
                      }
                      disabled={!editable || pending}
                    >
                      <option value="">— none / general funds —</option>
                      {fundingSources.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.kind.replace("_", " ")})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      className="hl-label"
                      htmlFor={`receipt-${line.clientId}`}
                    >
                      Receipt (PDF or image)
                    </label>
                    <div className="flex flex-col gap-1.5">
                      {line.existingReceiptUrl ? (
                        <div className="flex items-center gap-2 text-xs text-hl-muted">
                          <span>Current:</span>
                          <a
                            href={line.existingReceiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-hl-green-700 hover:underline"
                          >
                            {line.existingReceiptName ?? "receipt"}
                          </a>
                        </div>
                      ) : line.existingReceiptName ? (
                        <div className="text-xs text-hl-muted">
                          Attached last save: {line.existingReceiptName} (not persisted)
                        </div>
                      ) : null}
                      <input
                        id={`receipt-${line.clientId}`}
                        type="file"
                        accept="application/pdf,image/*"
                        className="text-xs"
                        onChange={(e) =>
                          handleFileChange(
                            line.clientId,
                            e.target.files?.[0] ?? null,
                          )
                        }
                        disabled={!editable || pending}
                      />
                      {line.newReceiptName ? (
                        <div className="text-xs text-hl-green-700">
                          <Upload className="mr-1 inline h-3 w-3" />
                          Will attach: {line.newReceiptName}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {linesById.get(line.budgetLineId) ? (
                    <div className="sm:col-span-6 rounded bg-hl-cream/60 px-3 py-2 text-xs text-hl-muted">
                      Tagged to {linesById.get(line.budgetLineId)!.fullCode} ·{" "}
                      {linesById.get(line.budgetLineId)!.name}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {editable ? (
          <button
            type="button"
            onClick={addLine}
            className="hl-btn-ghost mt-3"
            disabled={pending}
          >
            <Plus className="h-4 w-4" />
            Add line
          </button>
        ) : null}

        {fieldError("lines") ? (
          <p className="mt-2 text-xs text-red-700">{fieldError("lines")}</p>
        ) : null}
      </section>

      <section className="hl-card p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold uppercase tracking-wider text-hl-muted">
            Total reimbursement
          </span>
          <span className="text-2xl font-semibold tabular-nums text-hl-ink">
            {formatCad(total)}
          </span>
        </div>
      </section>

      {state?.warnings && state.warnings.length > 0 ? (
        <div className="hl-card border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
          {state.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      ) : null}
      {state?.error ? (
        <div className="hl-card border-red-200 bg-red-50/60 p-4 text-sm text-red-800">
          {state.error}
        </div>
      ) : null}

      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="hl-btn-primary" disabled={pending}>
            {pending ? "Working…" : submitLabel}
          </button>
          <button
            type="button"
            onClick={() => submit("draft")}
            className="hl-btn-secondary"
            disabled={pending}
          >
            Save draft
          </button>
          <Link
            href={
              initial.id
                ? `/budget/${year}/reports/${initial.id}`
                : `/budget/${year}/reports`
            }
            className="hl-btn-ghost"
          >
            Cancel
          </Link>
        </div>
      ) : null}
    </form>
  );
}

function makeBlankLine(): LineDraft {
  return {
    clientId: cryptoRandomId(),
    expenseDate: todayIso(),
    description: "",
    categoryId: "",
    budgetLineId: "",
    fundingSourceId: "",
    cost: "",
    existingReceiptName: null,
    existingReceiptUrl: null,
    newReceiptName: null,
  };
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cid-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatCad(v: number): string {
  return v.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  });
}
