import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Banknote, Download, FileText, ListChecks } from "lucide-react";
import { canViewBudget } from "@/lib/budget/people";
import {
  getBudgetGrid,
  getFiscalYear,
  getFiscalYears,
  getFundingSources,
} from "@/lib/budget/queries";
import {
  getExpenseLedger,
  groupByMonth,
  sumLedger,
  type ExpenseLedgerRow,
} from "@/lib/budget/ledger";
import { BudgetTabs, BudgetYearSwitcher, parseYearParam } from "../../BudgetNav";

export const metadata = { title: "Expenses ledger — Heritage Lab" };

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default async function ExpensesLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<{
    month?: string;
    category?: string;
    line?: string;
    funding?: string;
    source?: string;
    q?: string;
  }>;
}) {
  const session = await auth();
  if (!canViewBudget(session?.user?.email)) notFound();

  const { year: yearParam } = await params;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const sp = await searchParams;
  const monthRaw = sp.month ? Number(sp.month) : undefined;
  const month =
    monthRaw !== undefined && Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : undefined;
  const categoryCode = sp.category?.match(/^\d{3}$/) ? sp.category : undefined;
  const budgetLineId = sp.line || undefined;
  const fundingSourceId = sp.funding || undefined;
  const sourceType =
    sp.source === "bank" || sp.source === "er" ? sp.source : undefined;
  const search = sp.q?.trim() || undefined;

  const [fy, allYears] = await Promise.all([getFiscalYear(year), getFiscalYears()]);
  const availableYears = allYears.map((y) => y.year);

  const [rows, grid, fundingList] = await Promise.all([
    fy
      ? getExpenseLedger({
          year,
          month,
          categoryCode,
          budgetLineId,
          fundingSourceId,
          sourceType,
          search,
        })
      : Promise.resolve<ExpenseLedgerRow[]>([]),
    fy ? getBudgetGrid(year) : Promise.resolve(null),
    fy ? getFundingSources(fy.id) : Promise.resolve([]),
  ]);

  const total = sumLedger(rows);
  const monthly = groupByMonth(rows);

  // Build the CSV export URL preserving all current filters.
  const exportQuery = new URLSearchParams();
  if (month !== undefined) exportQuery.set("month", String(month));
  if (categoryCode) exportQuery.set("category", categoryCode);
  if (budgetLineId) exportQuery.set("line", budgetLineId);
  if (fundingSourceId) exportQuery.set("funding", fundingSourceId);
  if (sourceType) exportQuery.set("source", sourceType);
  if (search) exportQuery.set("q", search);
  const exportHref = `/budget/${year}/expenses/export${exportQuery.toString() ? `?${exportQuery.toString()}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-hl-ink">
            <ListChecks className="h-7 w-7 text-hl-green-600" />
            Expenses ledger {year}
          </h1>
          <p className="mt-1 text-sm text-hl-muted">
            Every actual outflow, whether paid directly from the bank or
            reimbursed via an expense report. One dollar, one row — the
            reconciliation invariant that keeps this a real ledger.
          </p>
        </div>
        <BudgetYearSwitcher
          year={year}
          availableYears={availableYears}
          subPath="/expenses"
        />
      </div>

      <BudgetTabs year={year} active="expenses" />

      {!fy ? (
        <div className="hl-card p-6 text-sm text-hl-muted">
          Fiscal year {year} isn&rsquo;t seeded yet.
        </div>
      ) : (
        <>
          <section className="hl-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-hl-muted">
                  {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"}
                </div>
                <div className="mt-1 text-3xl font-semibold tabular-nums text-hl-ink">
                  {formatCad(total)}
                </div>
              </div>
              <Link href={exportHref} className="hl-btn-secondary">
                <Download className="h-4 w-4" />
                Export CSV
              </Link>
            </div>

            {monthly.length > 0 ? (
              <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-12">
                {Array.from({ length: 12 }, (_, i) => {
                  const key = `${year}-${String(i + 1).padStart(2, "0")}`;
                  const bucket = monthly.find((m) => m.month === key);
                  const active = month === i + 1;
                  return (
                    <Link
                      key={key}
                      href={mergeQuery(sp, { month: active ? null : String(i + 1) })}
                      className={`rounded border p-2 text-center text-xs transition ${
                        active
                          ? "border-hl-green-600 bg-hl-green-50 text-hl-green-800"
                          : bucket
                            ? "border-hl-border bg-white text-hl-ink hover:border-hl-green-400"
                            : "border-hl-border bg-hl-cream/40 text-hl-muted"
                      }`}
                    >
                      <div className="font-medium">{MONTH_NAMES[i]}</div>
                      <div className="mt-0.5 tabular-nums">
                        {bucket ? formatCadShort(bucket.total) : "—"}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </section>

          <FiltersBar
            year={year}
            grid={grid}
            fundingList={fundingList}
            categoryCode={categoryCode}
            budgetLineId={budgetLineId}
            fundingSourceId={fundingSourceId}
            sourceType={sourceType}
            search={search}
          />

          {rows.length === 0 ? (
            <div className="hl-card p-6 text-sm text-hl-muted">
              No expenses match those filters. Try clearing them.
            </div>
          ) : (
            <div className="hl-card overflow-hidden">
              <table className="hl-table">
                <thead>
                  <tr>
                    <th className="text-left">Date</th>
                    <th className="text-left">Description</th>
                    <th className="text-left">Budget code</th>
                    <th className="text-left">Category</th>
                    <th className="text-left">Funding source</th>
                    <th className="text-right">Cost</th>
                    <th className="text-left">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="tabular-nums">{r.date}</td>
                      <td>{r.description}</td>
                      <td className="text-hl-muted">
                        <span className="font-medium text-hl-ink">
                          {r.budgetLineCode ?? "—"}
                        </span>
                        {r.budgetLineName ? (
                          <span className="block text-xs">
                            {r.budgetLineName}
                          </span>
                        ) : null}
                      </td>
                      <td className="text-hl-muted">{r.categoryName ?? "—"}</td>
                      <td className="text-hl-muted">{r.fundingSourceName ?? "—"}</td>
                      <td className="text-right font-medium tabular-nums">
                        {formatCad(r.cost)}
                      </td>
                      <td className="text-xs">
                        {r.source.kind === "er" ? (
                          <Link
                            href={`/budget/${year}/reports/${r.source.reportId}`}
                            className="inline-flex items-center gap-1 text-hl-green-700 hover:underline"
                          >
                            <FileText className="h-3 w-3" />
                            {r.source.reportNumber}
                          </Link>
                        ) : (
                          <Link
                            href={`/budget/${year}/bank/${r.source.txnId}`}
                            className="inline-flex items-center gap-1 text-hl-green-700 hover:underline"
                          >
                            <Banknote className="h-3 w-3" />
                            {r.source.accountName ?? "Bank"}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td
                      colSpan={5}
                      className="text-right text-sm font-medium text-hl-muted"
                    >
                      Total for current filter
                    </td>
                    <td className="text-right text-lg font-semibold tabular-nums text-hl-ink">
                      {formatCad(total)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FiltersBar({
  year,
  grid,
  fundingList,
  categoryCode,
  budgetLineId,
  fundingSourceId,
  sourceType,
  search,
}: {
  year: number;
  grid: Awaited<ReturnType<typeof getBudgetGrid>>;
  fundingList: Awaited<ReturnType<typeof getFundingSources>>;
  categoryCode: string | undefined;
  budgetLineId: string | undefined;
  fundingSourceId: string | undefined;
  sourceType: "bank" | "er" | undefined;
  search: string | undefined;
}) {
  const anyActive =
    categoryCode || budgetLineId || fundingSourceId || sourceType || search;
  return (
    <section className="hl-card p-4">
      <form
        method="get"
        action={`/budget/${year}/expenses`}
        className="grid gap-3 md:grid-cols-6"
      >
        <div className="md:col-span-2">
          <label className="hl-label" htmlFor="q">
            Search description
          </label>
          <input
            id="q"
            name="q"
            defaultValue={search ?? ""}
            className="hl-input"
            placeholder="e.g. Zoom, Kativik, contractor…"
          />
        </div>
        <div>
          <label className="hl-label" htmlFor="category">
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={categoryCode ?? ""}
            className="hl-input"
          >
            <option value="">All categories</option>
            {grid?.categories.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="hl-label" htmlFor="line">
            Budget line
          </label>
          <select
            id="line"
            name="line"
            defaultValue={budgetLineId ?? ""}
            className="hl-input"
          >
            <option value="">All lines</option>
            {grid?.categories.flatMap((c) =>
              c.lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.fullCode} · {l.name}
                </option>
              )),
            )}
          </select>
        </div>
        <div>
          <label className="hl-label" htmlFor="funding">
            Funding source
          </label>
          <select
            id="funding"
            name="funding"
            defaultValue={fundingSourceId ?? ""}
            className="hl-input"
          >
            <option value="">All sources</option>
            {fundingList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="hl-label" htmlFor="source">
            Source type
          </label>
          <select
            id="source"
            name="source"
            defaultValue={sourceType ?? ""}
            className="hl-input"
          >
            <option value="">Bank + ER</option>
            <option value="bank">Bank only</option>
            <option value="er">Expense reports only</option>
          </select>
        </div>
        <div className="flex items-end gap-2 md:col-span-6">
          <button type="submit" className="hl-btn-primary">
            Apply filters
          </button>
          {anyActive ? (
            <Link href={`/budget/${year}/expenses`} className="hl-btn-ghost">
              Clear
            </Link>
          ) : null}
        </div>
      </form>
    </section>
  );
}

/**
 * Preserve the existing filter set when toggling one param — used by the
 * month strip so clicking "Aug" keeps whatever category / funding source
 * / search is already active.
 */
function mergeQuery(
  current: Record<string, string | undefined>,
  patch: Record<string, string | null>,
): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v != null && v !== "") out.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) out.delete(k);
    else out.set(k, v);
  }
  const qs = out.toString();
  return qs ? `?${qs}` : "";
}

function formatCad(v: number): string {
  return v.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  });
}

function formatCadShort(v: number): string {
  if (Math.abs(v) >= 1000) {
    return `$${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  }
  return `$${v.toFixed(0)}`;
}
