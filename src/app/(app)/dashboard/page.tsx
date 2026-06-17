import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { travelClaims } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { formatMoney } from "@/lib/claims/schema";
import { Plane, FileText, BookOpen } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

export const metadata = { title: "Dashboard — Heritage Lab" };

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const recent = await db
    .select()
    .from(travelClaims)
    .where(eq(travelClaims.userId, userId))
    .orderBy(desc(travelClaims.createdAt))
    .limit(5);

  const totalSubmitted = recent.reduce(
    (s, c) => s + Number(c.totalAmount),
    0,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-hl-ink">
          Welcome{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-hl-muted">
          Submit travel claims and access internal resources.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ActionCard
          href="/travel-claims/new"
          icon={<FileText className="h-5 w-5" />}
          title="New travel claim"
          description="Create and submit an expense claim, delivered straight to payments."
        />
        <ActionCard
          href="/travel-claims"
          icon={<Plane className="h-5 w-5" />}
          title="My claims"
          description="Review claims you've submitted and their status."
        />
        <ActionCard
          href="/policies"
          icon={<BookOpen className="h-5 w-5" />}
          title="Policies"
          description="Travel, expense, and HR policies (coming soon)."
        />
      </div>

      <section className="hl-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-hl-ink">
            Recent claims
          </h2>
          <Link href="/travel-claims" className="hl-btn-ghost">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-md border border-dashed border-hl-border bg-hl-cream/60 px-4 py-10 text-center text-sm text-hl-muted">
            You haven&apos;t submitted any claims yet.{" "}
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
                  <th>Dates</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
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
            <div className="mt-4 text-right text-sm text-hl-muted">
              Recent total:{" "}
              <span className="font-semibold text-hl-ink">
                {formatMoney(totalSubmitted)}
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ActionCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="hl-card group block p-5 transition hover:border-hl-green-600 hover:shadow-md"
    >
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-md bg-hl-green-50 text-hl-green-700">
        {icon}
      </div>
      <div className="font-serif text-lg font-semibold text-hl-ink group-hover:text-hl-green-700">
        {title}
      </div>
      <p className="mt-1 text-sm text-hl-muted">{description}</p>
    </Link>
  );
}
