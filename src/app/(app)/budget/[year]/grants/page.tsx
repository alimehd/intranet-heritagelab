import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Landmark, Plus } from "lucide-react";
import { canEditBudget, canViewBudget } from "@/lib/budget/people";
import {
  getBudgetGrid,
  getFiscalYear,
  getFiscalYears,
  getFundingSourceReceivedById,
  getFundingSourceReceivedInPeriod,
  getFundingSourceSpentById,
  getFundingSourceSpentInPeriod,
  getFundingSources,
} from "@/lib/budget/queries";
import { FUNDING_SOURCE_STATUSES, type FundingSource } from "@/lib/db/schema";
import {
  BudgetTabs,
  BudgetYearSwitcher,
  parseYearParam,
} from "../../BudgetNav";

export const metadata = { title: "Grants & Contracts — Heritage Lab" };

const KIND_LABEL: Record<string, string> = {
  grant: "Grant",
  service_contract: "Service contract",
  donation: "Donation",
  other: "Other",
};

// Light colour-coding so the funding kind reads at a glance across a grid
// of cards — deliberately soft (bg-*-50 / text-*-700) to stay secondary to
// the name and status badge.
const KIND_STYLE: Record<string, string> = {
  grant: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  service_contract: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  donation: "bg-pink-50 text-pink-700 ring-1 ring-pink-200",
  other: "bg-hl-cream text-hl-muted ring-1 ring-hl-border",
};

const STATUS_STYLE: Record<string, string> = {
  active: "bg-hl-green-50 text-hl-green-700 ring-1 ring-hl-green-600/20",
  completed: "bg-hl-cream text-hl-muted ring-1 ring-hl-border",
  cancelled: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export default async function GrantsPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const session = await auth();
  if (!canViewBudget(session?.user?.email)) notFound();

  const { year: yearParam } = await params;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const fiscalYear = await getFiscalYear(year);
  const [allYears, sources, grid] = await Promise.all([
    getFiscalYears(),
    fiscalYear ? getFundingSources(fiscalYear.id) : Promise.resolve([]),
    getBudgetGrid(year),
  ]);
  const availableYears = allYears.map((y) => y.year);
  const editable = canEditBudget(session?.user?.email);
  const lineById = new Map(
    grid?.categories.flatMap((c) => c.lines.map((l) => [l.id, l])) ?? [],
  );

  // Received / spent per source, scoped to THIS fiscal year — matching the
  // detail page. Using the all-time totals here double-counts sources that
  // have bank activity spanning multiple years but were never split into
  // separate per-year funding sources (e.g. a deposit from a prior year's
  // instalment still tagged to this same source id).
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const stats = await Promise.all(
    sources.map(async (s) => {
      const [received, spent, receivedAllTime, spentAllTime] =
        await Promise.all([
          getFundingSourceReceivedInPeriod(s.id, yearStart, yearEnd),
          getFundingSourceSpentInPeriod(s.id, yearStart, yearEnd),
          getFundingSourceReceivedById(s.id),
          getFundingSourceSpentById(s.id),
        ]);
      return {
        id: s.id,
        received,
        spent,
        hasOutsideActivity: receivedAllTime !== received || spentAllTime !== spent,
      };
    }),
  );
  const statsById = new Map(stats.map((s) => [s.id, s]));

  // Contracts/grants still in progress ("active") should surface before
  // the ones that have wrapped up or fallen through, so status is the
  // primary sort key. FUNDING_SOURCE_STATUSES is already ordered
  // active → completed → cancelled, so we can reuse its index directly.
  const statusRank = new Map<string, number>(
    FUNDING_SOURCE_STATUSES.map((s, i) => [s, i]),
  );
  const sortedSources = [...sources].sort(
    (a, b) => (statusRank.get(a.status) ?? 99) - (statusRank.get(b.status) ?? 99),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-hl-ink">
            <Landmark className="h-7 w-7 text-hl-green-600" />
            Grants & Contracts — {year}
          </h1>
          <p className="mt-1 text-sm text-hl-muted">
            Every grant, service contract, and donation stream projected for{" "}
            {year}. Received &amp; spent totals populate once bank data is
            classified.
          </p>
        </div>
        <BudgetYearSwitcher
          year={year}
          availableYears={availableYears}
          subPath="/grants"
        />
      </div>

      <BudgetTabs year={year} active="grants" />

      {editable && fiscalYear ? (
        <div className="flex justify-end">
          <Link href={`/budget/${year}/grants/new`} className="hl-btn-primary">
            <Plus className="h-4 w-4" /> New funding source
          </Link>
        </div>
      ) : null}

      {!fiscalYear ? (
        <UnseededYear year={year} />
      ) : sources.length === 0 ? (
        <div className="hl-card p-6 text-sm text-hl-muted">
          No funding sources yet for {year}.{" "}
          {editable ? (
            <Link
              href={`/budget/${year}/grants/new`}
              className="font-medium text-hl-green-700 hover:underline"
            >
              Add the first one →
            </Link>
          ) : (
            "Ask an admin to add one."
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sortedSources.map((s) => (
            <FundingSourceCard
              key={s.id}
              year={year}
              source={s}
              received={statsById.get(s.id)?.received ?? 0}
              spent={statsById.get(s.id)?.spent ?? 0}
              hasOutsideActivity={statsById.get(s.id)?.hasOutsideActivity ?? false}
              projectLine={s.projectLineId ? lineById.get(s.projectLineId) ?? null : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FundingSourceCard({
  year,
  source,
  received,
  spent,
  hasOutsideActivity,
  projectLine,
}: {
  year: number;
  source: FundingSource;
  received: number;
  spent: number;
  hasOutsideActivity: boolean;
  projectLine: { fullCode: string; name: string } | null;
}) {
  const contract = Number(source.contractValue ?? 0);
  const receivedPct = contract > 0 ? Math.min(100, (received / contract) * 100) : 0;
  const spentPct = received > 0 ? Math.min(100, (spent / received) * 100) : 0;
  // Prefer categoryCaps; fall back to legacy allowedCategoryCodes.
  const restrictions =
    (source.categoryCaps?.length ?? 0) > 0
      ? source.categoryCaps.map((c) => c.code)
      : (source.allowedCategoryCodes ?? []).filter(Boolean);

  return (
    <Link
      href={`/budget/${year}/grants/${source.id}`}
      className={`hl-card block p-5 transition hover:border-hl-green-600 hover:shadow-md ${
        source.status === "active"
          ? "border-hl-green-300 bg-hl-green-100"
          : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-hl-ink">
            {source.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`hl-badge ${KIND_STYLE[source.kind] ?? KIND_STYLE.other}`}
            >
              {KIND_LABEL[source.kind] ?? source.kind}
            </span>
            <span
              className={`hl-badge ${STATUS_STYLE[source.status] ?? STATUS_STYLE.active}`}
            >
              {source.status}
            </span>
            {restrictions.length > 0 ? (
              <span
                className="hl-badge bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                title={`Only funds categories ${restrictions.join(", ")}`}
              >
                Restricted · {restrictions.join(", ")}
              </span>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-hl-muted">
            Contract value
          </div>
          <div className="text-lg font-semibold tabular-nums text-hl-ink">
            {formatCad(contract)}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <ProgressBar
          label="Received"
          amount={received}
          of={contract}
          pct={receivedPct}
          barClass="bg-hl-green-600"
        />
        <ProgressBar
          label="Spent (of received)"
          amount={spent}
          of={received}
          pct={spentPct}
          barClass={spent > received ? "bg-red-600" : "bg-amber-500"}
        />
      </div>
      {hasOutsideActivity ? (
        <p className="mt-3 text-[11px] text-amber-800">
          Also has bank activity outside {year} — figures above are scoped to
          this year only.
        </p>
      ) : null}
      {projectLine ? (
        <p className="mt-3 text-[11px] text-hl-muted">
          Project line:{" "}
          <span className="font-medium text-hl-ink">{projectLine.fullCode}</span>{" "}
          — for costs specific to this project that aren&rsquo;t part of the
          general budget.
        </p>
      ) : null}
    </Link>
  );
}

function ProgressBar({
  label,
  amount,
  of,
  pct,
  barClass,
}: {
  label: string;
  amount: number;
  of: number;
  pct: number;
  barClass: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-hl-muted">
        <span>{label}</span>
        <span className="tabular-nums text-hl-ink">
          {formatCad(amount)} <span className="text-hl-muted">/ {formatCad(of)}</span>
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-hl-cream">
        <div className={`h-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function UnseededYear({ year }: { year: number }) {
  return (
    <div className="hl-card p-6">
      <h2 className="text-lg font-semibold tracking-tight text-hl-ink">
        No fiscal year {year} yet
      </h2>
      <p className="mt-2 text-sm text-hl-muted">
        Seed the year first with{" "}
        <code className="rounded bg-hl-cream px-1 py-0.5 text-xs">
          npm run seed:budget
        </code>
        , then come back to add or edit funding sources.
      </p>
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
