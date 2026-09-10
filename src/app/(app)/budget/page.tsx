import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { canViewBudget } from "@/lib/budget/people";
import { getFiscalYears } from "@/lib/budget/queries";

export const metadata = { title: "Budget — Heritage Lab" };

/**
 * The Budget landing route. Redirects straight into the most sensible year
 * so the sidebar entry always lands on a real grid:
 *   1. Current calendar year if it's already seeded.
 *   2. Otherwise the most recent seeded year.
 *   3. Otherwise the current calendar year (which will render the "unseeded"
 *      empty state so Ali knows to run `npm run seed:budget`).
 */
export default async function BudgetIndexPage() {
  const session = await auth();
  if (!canViewBudget(session?.user?.email)) notFound();

  const years = await getFiscalYears();
  const currentYear = new Date().getUTCFullYear();
  const seededYears = years.map((y) => y.year);

  const target = seededYears.includes(currentYear)
    ? currentYear
    : seededYears.length > 0
      ? Math.max(...seededYears)
      : currentYear;

  redirect(`/budget/${target}`);
}
