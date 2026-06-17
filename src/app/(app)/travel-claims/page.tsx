import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { travelClaims } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { formatMoney } from "@/lib/claims/schema";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus } from "lucide-react";

export const metadata = { title: "My Travel Claims — Heritage Lab" };

export default async function ClaimsListPage() {
  const session = await auth();
  const claims = await db
    .select()
    .from(travelClaims)
    .where(eq(travelClaims.userId, session!.user.id))
    .orderBy(desc(travelClaims.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-hl-ink">
            My Travel Claims
          </h1>
          <p className="mt-1 text-sm text-hl-muted">
            History of every claim you&apos;ve submitted.
          </p>
        </div>
        <Link href="/travel-claims/new" className="hl-btn-primary">
          <Plus className="h-4 w-4" /> New claim
        </Link>
      </div>

      <div className="hl-card p-0">
        {claims.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-hl-muted">
            No claims yet.{" "}
            <Link
              href="/travel-claims/new"
              className="font-medium text-hl-green-700 underline-offset-2 hover:underline"
            >
              Create your first claim →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Purpose</th>
                  <th>Type</th>
                  <th>Dates</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap">
                      <Link
                        href={`/travel-claims/${c.id}`}
                        className="text-hl-green-700 hover:underline"
                      >
                        {c.createdAt.toLocaleDateString("en-CA")}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate">{c.purpose}</td>
                    <td className="whitespace-nowrap text-hl-muted">
                      {c.travelType}
                    </td>
                    <td className="whitespace-nowrap text-hl-muted">
                      {c.startDate} → {c.endDate}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatMoney(Number(c.totalAmount))}
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
