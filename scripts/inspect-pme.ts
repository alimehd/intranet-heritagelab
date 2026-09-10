/**
 * Read-only: find PME funding sources and what was billed against them.
 * Usage: npx tsx scripts/inspect-pme.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { eq, sql } from "drizzle-orm";

async function main() {
  const { db } = await import("../src/lib/db");
  const {
    fundingSources,
    budgetFiscalYears,
    budgetLines,
    budgetCategories,
    bankTransactions,
    bankTransactionSplits,
    expenseReportLines,
    expenseReports,
  } = await import("../src/lib/db/schema");

  const sources = await db
    .select({
      id: fundingSources.id,
      name: fundingSources.name,
      kind: fundingSources.kind,
      status: fundingSources.status,
      contractValue: fundingSources.contractValue,
      contractTotalValue: fundingSources.contractTotalValue,
      year: budgetFiscalYears.year,
      fiscalYearId: fundingSources.fiscalYearId,
    })
    .from(fundingSources)
    .innerJoin(
      budgetFiscalYears,
      eq(budgetFiscalYears.id, fundingSources.fiscalYearId),
    );

  console.log("ALL FUNDING SOURCES:");
  for (const s of sources) {
    console.log(
      `  ${s.year}  ${s.name.padEnd(42)} kind=${s.kind} status=${s.status} cv=${s.contractValue}`,
    );
  }

  const pme = sources.filter((s) => /pme/i.test(s.name));
  if (pme.length === 0) {
    console.log("\nNo PME source found.");
    return;
  }

  for (const src of pme) {
    console.log(`\n=== ${src.name} (${src.id}) ===`);

    const bank = await db
      .select({
        n: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${bankTransactions.debit}), 0)::text`,
        line: budgetLines.fullCode,
        lineName: budgetLines.name,
        cat: budgetCategories.code,
      })
      .from(bankTransactions)
      .leftJoin(budgetLines, eq(budgetLines.id, bankTransactions.budgetLineId))
      .leftJoin(
        budgetCategories,
        eq(budgetCategories.id, budgetLines.categoryId),
      )
      .where(eq(bankTransactions.fundingSourceId, src.id))
      .groupBy(budgetLines.fullCode, budgetLines.name, budgetCategories.code);

    console.log("Bank txns by line:");
    for (const r of bank) {
      console.log(
        `  ${String(r.cat ?? "—").padEnd(4)} ${(r.line ?? "unclassified").padEnd(16)} ${(r.lineName ?? "").padEnd(36)} n=${r.n}  $${Number(r.total).toFixed(2)}`,
      );
    }

    const splits = await db
      .select({
        n: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${bankTransactionSplits.amount}), 0)::text`,
        line: budgetLines.fullCode,
        cat: budgetCategories.code,
      })
      .from(bankTransactionSplits)
      .leftJoin(budgetLines, eq(budgetLines.id, bankTransactionSplits.budgetLineId))
      .leftJoin(
        budgetCategories,
        eq(budgetCategories.id, budgetLines.categoryId),
      )
      .where(eq(bankTransactionSplits.fundingSourceId, src.id))
      .groupBy(budgetLines.fullCode, budgetCategories.code);
    console.log("Splits by line:");
    for (const r of splits) {
      console.log(
        `  ${String(r.cat ?? "—")} ${r.line ?? "—"}  n=${r.n}  $${Number(r.total).toFixed(2)}`,
      );
    }

    const er = await db
      .select({
        n: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${expenseReportLines.cost}), 0)::text`,
        line: budgetLines.fullCode,
        cat: budgetCategories.code,
      })
      .from(expenseReportLines)
      .innerJoin(expenseReports, eq(expenseReports.id, expenseReportLines.reportId))
      .leftJoin(budgetLines, eq(budgetLines.id, expenseReportLines.budgetLineId))
      .leftJoin(
        budgetCategories,
        eq(budgetCategories.id, budgetLines.categoryId),
      )
      .where(eq(expenseReportLines.fundingSourceId, src.id))
      .groupBy(budgetLines.fullCode, budgetCategories.code);
    console.log("ER lines by line:");
    for (const r of er) {
      console.log(
        `  ${String(r.cat ?? "—")} ${r.line ?? "—"}  n=${r.n}  $${Number(r.total).toFixed(2)}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
