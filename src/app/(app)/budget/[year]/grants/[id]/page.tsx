import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ArrowLeft, Pencil, Landmark } from "lucide-react";
import { canEditBudget, canViewBudget } from "@/lib/budget/people";
import {
  getFiscalYear,
  getFundingSourceById,
  getFundingSourceReceivedById,
  getFundingSourceSpentById,
} from "@/lib/budget/queries";
import { parseYearParam } from "../../../BudgetNav";

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

  const [received, spent] = await Promise.all([
    getFundingSourceReceivedById(source.id),
    getFundingSourceSpentById(source.id),
  ]);

  const contract = Number(source.contractValue);
  const monthly = (source.monthlyExpected ?? []).map(Number);
  const scheduleTotal = monthly.reduce((s, v) => s + v, 0);
  const restrictions = source.allowedCategoryCodes ?? [];
  const editable = canEditBudget(session?.user?.email);

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
              <span>{KIND_LABEL[source.kind] ?? source.kind}</span>
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
            label="Received YTD"
            value={formatCad(received)}
            emphasis="primary"
          />
          <Stat
            label="Expected remaining"
            value={formatCad(Math.max(0, contract - received))}
          />
          <Stat
            label="Spent YTD"
            value={formatCad(spent)}
            emphasis={spent > received ? "danger" : "default"}
          />
        </dl>
        <p className="mt-3 text-xs text-hl-muted">
          Received &amp; spent come from bank transactions tagged with this
          funding source. If the numbers look low, check{" "}
          <Link
            href={`/budget/${year}/bank?classification=unclassified`}
            className="font-medium text-hl-green-700 hover:underline"
          >
            unclassified bank txns
          </Link>
          .
        </p>
      </section>

      <section className="hl-card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hl-border px-5 py-3">
          <h2 className="text-base font-semibold tracking-tight text-hl-ink">
            Projected schedule
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

      <section className="hl-card p-5">
        <h2 className="text-base font-semibold tracking-tight text-hl-ink">
          Category restrictions
        </h2>
        {restrictions.length === 0 ? (
          <p className="mt-2 text-sm text-hl-muted">
            Unrestricted — this funding source can be tagged against any budget
            line.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">
            {restrictions.map((code) => (
              <li
                key={code}
                className="hl-badge bg-amber-50 text-amber-800 ring-1 ring-amber-200"
              >
                {code}
              </li>
            ))}
          </ul>
        )}
      </section>

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
