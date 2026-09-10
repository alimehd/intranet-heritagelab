import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canViewBudget } from "@/lib/budget/people";
import { getExpenseLedger, toCsv } from "@/lib/budget/ledger";

/**
 * CSV export of the current expense ledger view. Honours the same query
 * parameters as /budget/[year]/expenses so users get exactly what they see.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ year: string }> },
) {
  const session = await auth();
  if (!canViewBudget(session?.user?.email)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { year: yearParam } = await params;
  const year = Number(yearParam);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return new NextResponse("Bad year", { status: 400 });
  }

  const url = new URL(req.url);
  const monthRaw = url.searchParams.get("month");
  const monthNum = monthRaw ? Number(monthRaw) : NaN;
  const month =
    Number.isInteger(monthNum) && monthNum >= 1 && monthNum <= 12
      ? monthNum
      : undefined;
  const categoryCode = url.searchParams.get("category") ?? undefined;
  const budgetLineId = url.searchParams.get("line") ?? undefined;
  const fundingSourceId = url.searchParams.get("funding") ?? undefined;
  const sourceRaw = url.searchParams.get("source");
  const sourceType =
    sourceRaw === "bank" || sourceRaw === "er" || sourceRaw === "manual"
      ? sourceRaw
      : undefined;
  const search = url.searchParams.get("q") ?? undefined;

  const rows = await getExpenseLedger(
    {
      year,
      month,
      categoryCode: categoryCode && /^\d{3}$/.test(categoryCode) ? categoryCode : undefined,
      budgetLineId,
      fundingSourceId,
      sourceType,
      search: search?.trim() || undefined,
    },
    // Higher cap for exports — Ali may want the whole year in one file.
    10_000,
  );

  const csv = toCsv(rows);
  const filename = `heritage-lab-expenses-${year}${month ? `-${String(month).padStart(2, "0")}` : ""}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
