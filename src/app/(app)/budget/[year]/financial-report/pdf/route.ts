import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canViewBudget } from "@/lib/budget/people";
import { buildFinancialReportProps } from "@/lib/budget/financial-report-data";
import { renderFinancialReportPdf } from "@/lib/budget/financial-report-pdf";
import { parseYearParam } from "../../../BudgetNav";

/**
 * On-demand "dernier rapport financier" PDF for a fiscal year — a
 * funder-facing summary (cash position, revenue by source, expenses by
 * category/funding type) suitable for grant applications. Access-controlled
 * to the budget module, same as the expense-report PDF.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ year: string }> },
) {
  const session = await auth();
  if (!canViewBudget(session?.user?.email)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { year: yearParam } = await params;
  const year = parseYearParam(yearParam);
  if (year === null) return new NextResponse("Not found", { status: 404 });

  const reportProps = await buildFinancialReportProps(
    year,
    session?.user?.name ?? session?.user?.email ?? "Heritage Lab",
  );
  if (!reportProps) return new NextResponse("Not found", { status: 404 });

  const pdf = await renderFinancialReportPdf(reportProps);

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Heritage-Lab-Financial-Report-${year}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
