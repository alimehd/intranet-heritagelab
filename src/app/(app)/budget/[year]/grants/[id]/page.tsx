import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import {
  ArrowLeft,
  Banknote,
  CalendarRange,
  FileText,
  Landmark,
  ListChecks,
  Pencil,
  PenLine,
  Split,
} from "lucide-react";
import { canEditBudget, canViewBudget } from "@/lib/budget/people";
import {
  getBudgetGrid,
  getFiscalYear,
  getFundingSourceById,
  getFundingSourceReceivedById,
  getFundingSourceReceivedInPeriod,
  getFundingSourceSpentById,
  getFundingSourceSpentInPeriod,
} from "@/lib/budget/queries";
import { getExpenseLedger } from "@/lib/budget/ledger";
import { parseYearParam } from "../../../BudgetNav";
import { DeleteFundingSourceForm } from "./DeleteFundingSourceForm";
import { RemapForm } from "./RemapForm";

export const metadata = { title: "Funding Source — Heritage Lab" };

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

// Same light palette as the grants list page, kept in sync intentionally.
const KIND_STYLE: Record<string, string> = {
  grant: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  service_contract: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  donation: "bg-pink-50 text-pink-700 ring-1 ring-pink-200",
  other: "bg-hl-cream text-hl-muted ring-1 ring-hl-border",
};

export default async function FundingSourceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string; id: string }>;
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  const session = await auth();
  if (!canViewBudget(session?.user?.email)) notFound();

  const { year: yearParam, id } = await params;
  const { created, updated } = await searchParams;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const fiscalYear = await getFiscalYear(year);
  const source = await getFundingSourceById(id);
  if (!source || !fiscalYear || source.fiscalYearId !== fiscalYear.id) notFound();

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [received, spent, receivedAllTime, spentAllTime, grid, ledgerRows] =
    await Promise.all([
      // "YTD" means the fiscal year being viewed — scope to that period, not
      // all-time, so this matches the itemized list below and doesn't lump
      // in deposits/expenses from other years under one funding source.
      getFundingSourceReceivedInPeriod(source.id, yearStart, yearEnd),
      getFundingSourceSpentInPeriod(source.id, yearStart, yearEnd),
      getFundingSourceReceivedById(source.id),
      getFundingSourceSpentById(source.id),
      getBudgetGrid(year),
      // Top 50 recent expenses drawing from this source, current year.
      getExpenseLedger(
        { year, fundingSourceId: source.id, includeUnclassified: false },
        50,
      ),
    ]);

  const contract = Number(source.contractValue);
  const monthly = (source.monthlyExpected ?? []).map(Number);
  const scheduleTotal = monthly.reduce((s, v) => s + v, 0);
  // Prefer the new categoryCaps shape; fall back to the legacy allowed array
  // for any row that hasn't been backfilled yet.
  const caps =
    source.categoryCaps && source.categoryCaps.length > 0
      ? source.categoryCaps
      : (source.allowedCategoryCodes ?? []).map((code) => ({
          code,
          cap: null as number | null,
        }));
  const editable = canEditBudget(session?.user?.email);

  // ---- Multi-year contract data ----
  const isMultiYear =
    !!source.contractStartDate ||
    !!source.contractEndDate ||
    source.contractTotalValue != null ||
    (source.yearlyAllocations?.length ?? 0) > 0;

  const yearlyAllocations = (source.yearlyAllocations ?? [])
    .slice()
    .sort((a, b) => a.year - b.year);

  // Compute per-year spent/received for each declared allocation. Each
  // year runs Jan 1 -> Dec 31 for HL (fiscal = calendar).
  const perYearStats = isMultiYear
    ? await Promise.all(
        yearlyAllocations.map(async (a) => {
          const start = `${a.year}-01-01`;
          const end = `${a.year}-12-31`;
          const [rec, sp] = await Promise.all([
            getFundingSourceReceivedInPeriod(source.id, start, end),
            getFundingSourceSpentInPeriod(source.id, start, end),
          ]);
          return { year: a.year, allocation: a.amount, received: rec, spent: sp };
        }),
      )
    : [];

  // Contract-total spent (across the whole contract period).
  const contractTotal = source.contractTotalValue
    ? Number(source.contractTotalValue)
    : null;
  const contractSpent =
    isMultiYear && source.contractStartDate && source.contractEndDate
      ? await getFundingSourceSpentInPeriod(
          source.id,
          source.contractStartDate,
          source.contractEndDate,
        )
      : null;
  const contractReceived =
    isMultiYear && source.contractStartDate && source.contractEndDate
      ? await getFundingSourceReceivedInPeriod(
          source.id,
          source.contractStartDate,
          source.contractEndDate,
        )
      : null;

  // Budget lines for the remap widget.
  const budgetLineOptions =
    grid?.categories.flatMap((c) =>
      c.lines.map((l) => ({
        id: l.id,
        label: `${l.fullCode} · ${l.name} (${c.name})`,
      })),
    ) ?? [];
  const projectLine = source.projectLineId
    ? grid?.categories
        .flatMap((c) => c.lines)
        .find((l) => l.id === source.projectLineId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/budget/${year}/grants`} className="hl-btn-ghost -ml-3 mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to grants
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-hl-ink">
              <Landmark className="h-7 w-7 text-hl-green-600" />
              {source.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-hl-muted">
              <span
                className={`hl-badge text-xs ${KIND_STYLE[source.kind] ?? KIND_STYLE.other}`}
              >
                {KIND_LABEL[source.kind] ?? source.kind}
              </span>
              <span>·</span>
              <span>Fiscal year {year}</span>
              <span>·</span>
              <span>Status: {source.status}</span>
            </div>
          </div>
          {editable ? (
            <Link
              href={`/budget/${year}/grants/${source.id}/edit`}
              className="hl-btn-secondary"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          ) : null}
        </div>
      </div>

      {created ? (
        <div className="hl-card border-hl-green-200 bg-hl-green-50/50 p-4 text-sm text-hl-green-800">
          Funding source created.
        </div>
      ) : null}
      {updated ? (
        <div className="hl-card border-hl-green-200 bg-hl-green-50/50 p-4 text-sm text-hl-green-800">
          Changes saved.
        </div>
      ) : null}

      <section className="hl-card p-5">
        <h2 className="text-base font-semibold tracking-tight text-hl-ink">
          Coverage
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-4">
          <Stat label="Contract value" value={formatCad(contract)} />
          <Stat
            label={`Received in ${year}`}
            value={formatCad(received)}
            emphasis="primary"
          />
          <Stat
            label="Expected remaining"
            value={formatCad(Math.max(0, contract - received))}
          />
          <Stat
            label={`Spent in ${year}`}
            value={formatCad(spent)}
            emphasis={spent > received ? "danger" : "default"}
          />
        </dl>
        <p className="mt-3 text-xs text-hl-muted">
          Received &amp; spent come from bank transactions (and paid ER
          lines) tagged with this funding source, scoped to {year}. If the
          numbers look low, check{" "}
          <Link
            href={`/budget/${year}/bank?classification=unclassified`}
            className="font-medium text-hl-green-700 hover:underline"
          >
            unclassified bank txns
          </Link>
          .
        </p>
        {receivedAllTime !== received || spentAllTime !== spent ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
            This source also has activity outside {year}:{" "}
            <strong>{formatCad(receivedAllTime)}</strong> received and{" "}
            <strong>{formatCad(spentAllTime)}</strong> spent all-time. If
            that&rsquo;s a separate grant/contract phase, consider giving it
            its own funding source instead of sharing this one across years.
          </p>
        ) : null}
        {projectLine ? (
          <p className="mt-2 text-xs text-hl-muted">
            Project line for off-budget costs:{" "}
            <span className="font-medium text-hl-ink">{projectLine.fullCode}</span>{" "}
            ·{" "}
            <Link
              href={`/budget/${year}/expenses?line=${projectLine.id}`}
              className="font-medium text-hl-green-700 hover:underline"
            >
              view its expenses →
            </Link>{" "}
            — use this line for things that don&rsquo;t fit the general
            001-006 budget (e.g. activity supplies). Costs that DO belong
            on the general budget (a share of hosting, a partial salary)
            should stay on their usual 001-006 line with this source
            attached.
          </p>
        ) : null}
      </section>

      {isMultiYear ? (
        <section className="hl-card p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-hl-ink">
            <CalendarRange className="h-4 w-4 text-hl-green-600" />
            Multi-year contract
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Stat
              label="Contract period"
              value={
                source.contractStartDate && source.contractEndDate
                  ? `${source.contractStartDate} → ${source.contractEndDate}`
                  : source.contractStartDate ?? source.contractEndDate ?? "—"
              }
            />
            <Stat
              label="Contract total"
              value={contractTotal != null ? formatCad(contractTotal) : "—"}
            />
            <Stat
              label="Received (contract)"
              value={contractReceived != null ? formatCad(contractReceived) : "—"}
              emphasis="primary"
            />
            <Stat
              label="Spent (contract)"
              value={contractSpent != null ? formatCad(contractSpent) : "—"}
              emphasis={
                contractSpent != null &&
                contractReceived != null &&
                contractSpent > contractReceived
                  ? "danger"
                  : "default"
              }
            />
          </div>

          {yearlyAllocations.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-md border border-hl-border">
              <table className="w-full text-sm">
                <thead className="bg-hl-cream/60 text-xs uppercase tracking-wider text-hl-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Year</th>
                    <th className="px-3 py-2 text-right">Allocation</th>
                    <th className="px-3 py-2 text-right">Received</th>
                    <th className="px-3 py-2 text-right">Spent</th>
                    <th className="px-3 py-2 text-right">Remaining vs alloc</th>
                  </tr>
                </thead>
                <tbody>
                  {perYearStats.map((s) => {
                    const remaining = s.allocation - s.spent;
                    return (
                      <tr key={s.year} className="border-t border-hl-border">
                        <td className="px-3 py-2 font-medium text-hl-ink">
                          {s.year}
                          {s.year === year ? (
                            <span className="ml-2 hl-badge bg-hl-green-50 text-hl-green-800 ring-1 ring-hl-green-200">
                              current
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCad(s.allocation)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-hl-green-700">
                          {formatCad(s.received)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCad(s.spent)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            remaining < 0 ? "text-red-700" : "text-hl-ink"
                          }`}
                        >
                          {formatCad(remaining)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-xs text-hl-muted">
              No per-year allocations set yet — edit this source to add them.
            </p>
          )}
        </section>
      ) : null}

      <section className="hl-card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hl-border px-5 py-3">
          <h2 className="text-base font-semibold tracking-tight text-hl-ink">
            Projected schedule ({year})
          </h2>
          <div className="text-xs text-hl-muted">
            Schedule total{" "}
            <span className="ml-1 font-semibold tabular-nums text-hl-ink">
              {formatCad(scheduleTotal)}
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-hl-border bg-hl-cream text-xs font-semibold uppercase tracking-wide text-hl-muted">
                {MONTHS.map((m) => (
                  <th key={m} className="px-2 py-2 text-right tabular-nums">
                    {m}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {monthly.map((v, i) => (
                  <td key={i} className="px-2 py-2 text-right tabular-nums text-hl-ink">
                    {v ? formatCell(v) : "—"}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-hl-ink">
                  {formatCad(scheduleTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="hl-card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hl-border px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-hl-ink">
            <ListChecks className="h-4 w-4 text-hl-green-600" />
            Expenses drawing from this source ({year})
          </h2>
          <Link
            href={`/budget/${year}/expenses?funding=${source.id}`}
            className="text-xs font-medium text-hl-green-700 hover:underline"
          >
            View all in Expenses tab →
          </Link>
        </div>
        {ledgerRows.length === 0 ? (
          <div className="p-5 text-sm text-hl-muted">
            Nothing tagged to this source yet. Use the &ldquo;Tag existing
            expenses&rdquo; widget below (or the classify page on individual
            bank txns) to attach expenses.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="hl-table">
              <thead>
                <tr>
                  <th className="text-left">Date</th>
                  <th className="text-left">Description</th>
                  <th className="text-left">Budget code</th>
                  <th className="text-right">Cost</th>
                  <th className="text-left">Source</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((r) => (
                  <tr key={r.id}>
                    <td className="tabular-nums">{r.date}</td>
                    <td>{r.description}</td>
                    <td className="text-hl-muted">
                      <span className="font-medium text-hl-ink">
                        {r.budgetLineCode ?? "—"}
                      </span>
                    </td>
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
                      ) : r.source.kind === "split" ? (
                        <Link
                          href={`/budget/${year}/bank/${r.source.txnId}`}
                          className="inline-flex items-center gap-1 text-hl-green-700 hover:underline"
                        >
                          <Split className="h-3 w-3" />
                          Split
                        </Link>
                      ) : r.source.kind === "manual" ? (
                        <Link
                          href={`/budget/${year}/bank/${r.source.txnId}`}
                          className="inline-flex items-center gap-1 text-hl-muted hover:text-hl-ink hover:underline"
                        >
                          <PenLine className="h-3 w-3" />
                          Manual
                        </Link>
                      ) : (
                        <Link
                          href={`/budget/${year}/bank/${r.source.kind === "unclassified" ? r.source.txnId : r.source.txnId}`}
                          className="inline-flex items-center gap-1 text-hl-green-700 hover:underline"
                        >
                          <Banknote className="h-3 w-3" />
                          Bank
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ledgerRows.length >= 50 ? (
              <div className="border-t border-hl-border px-5 py-3 text-xs text-hl-muted">
                Showing the 50 most-recent — click &ldquo;View all&rdquo; above
                for the full list with filters + CSV export.
              </div>
            ) : null}
          </div>
        )}
      </section>

      {editable ? (
        <section className="hl-card p-5">
          <h2 className="text-base font-semibold tracking-tight text-hl-ink">
            Tag existing expenses to this source
          </h2>
          <p className="mt-1 text-xs text-hl-muted">
            Bulk-tag every direct expense, split allocation, and paid ER line
            on a given budget line with &ldquo;{source.name}&rdquo;. Handy
            when the project/funder was previously baked into the budget-line
            code (VOICES-001, McGill-001, …) instead of tracked separately.
          </p>
          <div className="mt-4">
            <RemapForm
              year={year}
              fundingSourceId={source.id}
              fundingSourceName={source.name}
              budgetLineOptions={budgetLineOptions}
            />
          </div>
        </section>
      ) : null}

      <section className="hl-card p-5">
        <h2 className="text-base font-semibold tracking-tight text-hl-ink">
          Category restrictions &amp; caps
        </h2>
        {caps.length === 0 ? (
          <p className="mt-2 text-sm text-hl-muted">
            Unrestricted — this funding source can be tagged against any budget
            line with no dollar limit.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-md border border-hl-border">
            <table className="w-full text-sm">
              <thead className="bg-hl-cream/60 text-xs uppercase tracking-wider text-hl-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-right">Annual cap</th>
                </tr>
              </thead>
              <tbody>
                {caps.map((c) => (
                  <tr key={c.code} className="border-t border-hl-border">
                    <td className="px-3 py-2 font-medium text-hl-ink">
                      {c.code}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.cap == null ? (
                        <span className="text-hl-muted">No cap</span>
                      ) : (
                        formatCad(c.cap)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editable ? (
        <section className="hl-card border-red-200 bg-red-50/30 p-5">
          <h2 className="text-base font-semibold tracking-tight text-red-900">
            Danger zone
          </h2>
          <p className="mt-1 text-xs text-red-800/80">
            Deleting unlinks this source from any tagged bank transactions and
            splits (they revert to &ldquo;no funding source&rdquo;). Expense
            report lines keep the funding source name in history.
          </p>
          <div className="mt-3">
            <DeleteFundingSourceForm
              id={source.id}
              year={year}
              name={source.name}
            />
          </div>
        </section>
      ) : null}

      {source.notes ? (
        <section className="hl-card p-5">
          <h2 className="text-base font-semibold tracking-tight text-hl-ink">
            Notes
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-hl-ink">
            {source.notes}
          </p>
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis = "default",
}: {
  label: string;
  value: string;
  emphasis?: "default" | "primary" | "danger";
}) {
  const cls =
    emphasis === "danger"
      ? "text-red-700"
      : emphasis === "primary"
        ? "text-hl-green-700"
        : "text-hl-ink";
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-hl-muted">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold tabular-nums ${cls}`}>{value}</dd>
    </div>
  );
}

function formatCad(v: number): string {
  return v.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });
}

function formatCell(v: number): string {
  return v.toLocaleString("en-CA", { maximumFractionDigits: 0 });
}
