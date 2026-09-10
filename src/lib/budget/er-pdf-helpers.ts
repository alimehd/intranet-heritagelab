import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  budgetLines,
  fundingSources,
  type ExpenseReportLine,
} from "@/lib/db/schema";
import { fetchBlob } from "./blob";
import type { ErPdfLine } from "./er-pdf";

/**
 * Reload a report's lines with joined category + funding source names so the
 * PDF can display them. Used by both the submit flow and the on-demand PDF
 * download route.
 */
export async function enrichLinesForPdf(
  lines: ExpenseReportLine[],
): Promise<ErPdfLine[]> {
  if (lines.length === 0) return [];
  const budgetIds = Array.from(new Set(lines.map((l) => l.budgetLineId)));
  const fundingIds = Array.from(
    new Set(lines.map((l) => l.fundingSourceId).filter((v): v is string => Boolean(v))),
  );

  const [budgetRows, fundingRows] = await Promise.all([
    db
      .select({
        id: budgetLines.id,
        name: budgetLines.name,
      })
      .from(budgetLines)
      .where(inArray(budgetLines.id, budgetIds)),
    fundingIds.length > 0
      ? db
          .select({ id: fundingSources.id, name: fundingSources.name })
          .from(fundingSources)
          .where(inArray(fundingSources.id, fundingIds))
      : Promise.resolve([]),
  ]);

  const lineNameById = new Map(budgetRows.map((r) => [r.id, r.name]));
  const fundingNameById = new Map(fundingRows.map((r) => [r.id, r.name]));

  return lines.map((l) => ({
    ...l,
    categoryName: lineNameById.get(l.budgetLineId) ?? null,
    fundingSourceName: l.fundingSourceId
      ? fundingNameById.get(l.fundingSourceId) ?? null
      : null,
  }));
}

/**
 * Fetch receipt bytes for every line that has a persisted receipt URL,
 * concurrently. Missing / unreachable receipts are silently skipped —
 * emails should still send.
 */
type ReceiptAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export async function fetchLineReceipts(
  lines: ExpenseReportLine[],
): Promise<ReceiptAttachment[]> {
  const withUrls = lines.filter((l) => l.receiptUrl);
  const results = await Promise.all(
    withUrls.map(async (l): Promise<ReceiptAttachment | null> => {
      const res = await fetchBlob(l.receiptUrl!);
      if (!res) return null;
      const contentType = res.contentType ?? l.receiptContentType ?? undefined;
      return {
        filename: l.receiptFilename ?? "receipt",
        content: res.content,
        ...(contentType ? { contentType } : {}),
      };
    }),
  );
  return results.filter((r): r is ReceiptAttachment => r !== null);
}
