import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canViewBudget } from "@/lib/budget/people";
import { getExpenseReportById } from "@/lib/budget/er-queries";
import { renderExpenseReportPdf } from "@/lib/budget/er-pdf";
import {
  enrichLinesForPdf,
  fetchLineReceipts,
} from "@/lib/budget/er-pdf-helpers";
import { appendReceiptsToClaimPdf } from "@/lib/claims/receipts";

/**
 * On-demand PDF download for an expense report. Renders the base PDF and
 * appends any persisted receipts. Access-controlled to the budget module
 * (viewers can also download since they're already trusted with the data).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ year: string; id: string }> },
) {
  const session = await auth();
  if (!canViewBudget(session?.user?.email)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const { id } = await params;
  const detail = await getExpenseReportById(id);
  if (!detail) return new NextResponse("Not found", { status: 404 });

  const pdfLines = await enrichLinesForPdf(detail.lines);
  const receipts = await fetchLineReceipts(detail.lines);
  const receiptNames = receipts.map((r) => r.filename);
  const basePdf = await renderExpenseReportPdf({
    report: detail.report,
    lines: pdfLines,
    receiptNames,
  });
  const merged =
    receipts.length > 0
      ? await appendReceiptsToClaimPdf(basePdf, receipts)
      : { pdf: basePdf };

  const filename = `${detail.report.reportNumber}-${detail.report.submitterName.replace(/\s+/g, "_")}.pdf`;
  return new NextResponse(new Uint8Array(merged.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
