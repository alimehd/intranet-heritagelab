import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { travelClaims } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  computeTotals,
  formatMoney,
  travelClaimSchema,
} from "@/lib/claims/schema";
import { StatusBadge } from "@/components/StatusBadge";

type SearchParams = Promise<{ submitted?: string }>;
type Params = Promise<{ id: string }>;

export default async function ClaimDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { submitted } = await searchParams;
  const session = await auth();

  const [row] = await db
    .select()
    .from(travelClaims)
    .where(
      and(eq(travelClaims.id, id), eq(travelClaims.userId, session!.user.id)),
    )
    .limit(1);

  if (!row) notFound();

  const parsed = travelClaimSchema.safeParse(row.payload);
  const claim = parsed.success ? parsed.data : null;
  const totals = claim ? computeTotals(claim) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/travel-claims"
          className="text-sm text-hl-muted hover:text-hl-ink"
        >
          ← All claims
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold text-hl-ink">
              {row.purpose}
            </h1>
            <p className="mt-1 text-sm text-hl-muted">
              {row.travelType} • {row.startDate} → {row.endDate} • Submitted{" "}
              {row.createdAt.toLocaleString("en-CA")}
            </p>
          </div>
          <StatusBadge status={row.status} />
        </div>
      </div>

      {submitted ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            row.status === "emailed"
              ? "border-hl-green-200 bg-hl-green-50 text-hl-green-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {row.status === "emailed"
            ? "Claim submitted and emailed to payments@heritagelab.ca."
            : "Claim was saved, but the email did not send. An administrator can retry."}
        </div>
      ) : null}

      {row.emailError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Email error:</strong> {row.emailError}
        </div>
      ) : null}

      <section className="hl-card p-6">
        <h2 className="mb-4 font-serif text-xl font-semibold text-hl-green-700">
          Summary
        </h2>
        {totals ? (
          <dl className="grid grid-cols-2 gap-y-1 text-sm md:grid-cols-3">
            <SummaryRow label="Airfare" value={totals.airfare} />
            <SummaryRow label="Hotel" value={totals.hotel} />
            <SummaryRow label="Ground transport" value={totals.transport} />
            <SummaryRow label="Personal vehicle" value={totals.km} />
            <SummaryRow label="Meals" value={totals.meals} />
            <SummaryRow label="Other" value={totals.other} />
          </dl>
        ) : null}
        <div className="mt-4 flex items-center justify-between border-t border-hl-border pt-4">
          <span className="text-sm uppercase tracking-wider text-hl-muted">
            Grand Total
          </span>
          <span className="font-serif text-2xl font-semibold text-hl-green-700">
            {formatMoney(Number(row.totalAmount))}
          </span>
        </div>
      </section>

      {claim ? (
        <>
          {claim.transport.length > 0 ? (
            <ClaimTable
              title="Ground transportation"
              head={["Date", "Origin", "Destination", "Amount"]}
              rows={claim.transport.map((t) => [
                t.date,
                t.origin,
                t.destination,
                formatMoney(t.amount),
              ])}
            />
          ) : null}
          {claim.km.length > 0 ? (
            <ClaimTable
              title="Personal vehicle"
              head={["Date", "Origin", "Destination", "KM", "Amount"]}
              rows={claim.km.map((t) => [
                t.date,
                t.origin,
                t.destination,
                t.km.toFixed(1),
                formatMoney(t.km * 0.605),
              ])}
            />
          ) : null}
          {claim.other.length > 0 ? (
            <ClaimTable
              title="Other expenses"
              head={["Date", "Description", "Amount"]}
              rows={claim.other.map((t) => [
                t.date,
                t.description,
                formatMoney(t.amount),
              ])}
            />
          ) : null}
          {claim.notes ? (
            <section className="hl-card p-6">
              <h2 className="mb-2 font-serif text-xl font-semibold text-hl-green-700">
                Notes
              </h2>
              <p className="whitespace-pre-wrap text-sm">{claim.notes}</p>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="text-hl-muted">{label}</dt>
      <dd className="text-right tabular-nums md:col-span-2 md:text-left">
        {formatMoney(value)}
      </dd>
    </>
  );
}

function ClaimTable({
  title,
  head,
  rows,
}: {
  title: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <section className="hl-card p-6">
      <h2 className="mb-4 font-serif text-xl font-semibold text-hl-green-700">
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="hl-table">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th
                  key={h}
                  className={i === head.length - 1 ? "text-right" : ""}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((cell, ci) => (
                  <td
                    key={ci}
                    className={
                      ci === r.length - 1
                        ? "text-right tabular-nums"
                        : undefined
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
