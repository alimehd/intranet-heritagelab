import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { travelClaims } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { formatMoney } from "@/lib/claims/schema";
import { Plane, FileText, BookOpen, BookUser, Users } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { isBoardMember } from "@/lib/roles";
import { BOARD_GENERAL_FOLDER } from "@/lib/resources";

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

  const totalSubmitted = recent
    .filter((c) => c.status !== "cancelled")
    .reduce((s, c) => s + Number(c.totalAmount), 0);

  const boardMember = isBoardMember(session?.user?.email);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="tracking-tight text-3xl font-semibold text-hl-ink">
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
          description="Review or cancel claims you've submitted."
        />
        <ActionCard
          href="/policies"
          icon={<BookOpen className="h-5 w-5" />}
          title="Resources"
          description="Business Travel Policy and shared documents."
        />
        <ActionCard
          href="/directory"
          icon={<BookUser className="h-5 w-5" />}
          title="Directory"
          description="Staff and board contact list (coming soon)."
        />
        {boardMember ? (
          <ActionCard
            href={BOARD_GENERAL_FOLDER.href}
            external
            icon={<Users className="h-5 w-5" />}
            title="Board folder"
            description="Meeting packages, minutes, and governance documents."
          />
        ) : null}
      </div>

      <section className="hl-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="tracking-tight text-xl font-semibold text-hl-ink">
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
  external = false,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  external?: boolean;
}) {
  const className =
    "hl-card group block p-5 transition hover:border-hl-green-600 hover:shadow-md";
  const body = (
    <>
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-md bg-hl-green-50 text-hl-green-700">
        {icon}
      </div>
      <div className="text-lg font-semibold tracking-tight text-hl-ink group-hover:text-hl-green-700">
        {title}
      </div>
      <p className="mt-1 text-sm text-hl-muted">{description}</p>
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {body}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}
