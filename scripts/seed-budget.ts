/**
 * Seed the budget tables with Heritage Lab's 2026 fiscal-year data.
 *
 * Idempotent: if fiscal year 2026 already exists it prints a summary and
 * exits without touching anything. To re-seed from scratch, pass `--reset`
 * (deletes the fiscal year and its cascading categories + lines first).
 *
 * Usage:
 *   npm run seed:budget
 *   npm run seed:budget -- --reset      (destructive; wipes 2026 and reinserts)
 *
 * DATABASE_URL is loaded from .env.local, then .env — same convention as
 * drizzle.config.ts.
 */

import { config as loadEnv } from "dotenv";
// Env has to be loaded BEFORE we import ../src/lib/db, because that module
// evaluates `neon(process.env.DATABASE_URL)` at import time. ES module
// imports are hoisted above statements, so a static `import { db } from …`
// would race the dotenv call above and see an undefined DATABASE_URL. We
// therefore load env in a small IIFE and pull `db` in via dynamic import.
loadEnv({ path: ".env.local" });
loadEnv();

import { eq } from "drizzle-orm";
import type * as Schema from "../src/lib/db/schema";
import { BUDGET_2026_CATEGORIES } from "../src/lib/budget/seed-data-2026";
import { FUNDING_SOURCES_2026 } from "../src/lib/budget/seed-data-funding-2026";

const YEAR = 2026;

async function main() {
  const reset = process.argv.includes("--reset");

  const { db } = await import("../src/lib/db");
  const { budgetCategories, budgetFiscalYears, budgetLines, fundingSources } =
    (await import("../src/lib/db/schema")) as typeof Schema;

  const existing = await db
    .select()
    .from(budgetFiscalYears)
    .where(eq(budgetFiscalYears.year, YEAR));

  if (existing.length > 0) {
    if (!reset) {
      const cats = await db
        .select()
        .from(budgetCategories)
        .where(eq(budgetCategories.fiscalYearId, existing[0].id));
      console.log(
        `Fiscal year ${YEAR} already seeded (${cats.length} categories). ` +
          `Pass --reset to wipe and reinsert.`,
      );
      return;
    }
    console.log(`--reset: dropping fiscal year ${YEAR} and cascading rows…`);
    await db.delete(budgetFiscalYears).where(eq(budgetFiscalYears.id, existing[0].id));
  }

  const [year] = await db
    .insert(budgetFiscalYears)
    .values({ year: YEAR, openingBalance: null })
    .returning();

  console.log(`Inserted fiscal year ${year.year} (${year.id}).`);

  let categoryCount = 0;
  let lineCount = 0;
  let annualTotal = 0;

  for (const [catIndex, catSeed] of BUDGET_2026_CATEGORIES.entries()) {
    const [category] = await db
      .insert(budgetCategories)
      .values({
        fiscalYearId: year.id,
        code: catSeed.code,
        name: catSeed.name,
        sortOrder: catIndex,
      })
      .returning();
    categoryCount++;

    const rows = catSeed.lines.map((lineSeed, lineIndex) => ({
      categoryId: category.id,
      code: lineSeed.code,
      fullCode: `${catSeed.code}-${lineSeed.code}`,
      name: lineSeed.name,
      // Drizzle numeric[] takes strings — convert dollar values.
      monthlyProjected: lineSeed.monthly.map((v) => v.toFixed(2)),
      sortOrder: lineIndex,
    }));

    await db.insert(budgetLines).values(rows);
    lineCount += rows.length;

    const categoryAnnual = catSeed.lines.reduce(
      (acc, l) => acc + l.monthly.reduce((s, v) => s + v, 0),
      0,
    );
    annualTotal += categoryAnnual;
    console.log(
      `  ${catSeed.code} ${catSeed.name.padEnd(30)} ` +
        `${catSeed.lines.length.toString().padStart(2)} lines ` +
        `${formatCad(categoryAnnual).padStart(14)}/yr`,
    );
  }

  console.log(
    `\nDisbursements: ${categoryCount} categories, ${lineCount} lines, ` +
      `total projected = ${formatCad(annualTotal)}.`,
  );

  // ---- Funding sources (Phase 2) ----
  let fundingCount = 0;
  let fundingTotal = 0;
  for (const [i, src] of FUNDING_SOURCES_2026.entries()) {
    const monthly = src.monthly.map((v) => v.toFixed(2));
    const yearTotal = src.monthly.reduce((s, v) => s + v, 0);
    await db.insert(fundingSources).values({
      fiscalYearId: year.id,
      name: src.name,
      kind: src.kind,
      contractValue: yearTotal.toFixed(2),
      monthlyExpected: monthly,
      allowedCategoryCodes: [],
      categoryCaps: [],
      status: "active",
      notes: src.notes ?? null,
      sortOrder: i,
      contractStartDate: src.contractStartDate ?? null,
      contractEndDate: src.contractEndDate ?? null,
      contractTotalValue:
        src.contractTotalValue == null
          ? null
          : src.contractTotalValue.toFixed(2),
      yearlyAllocations: src.yearlyAllocations ?? [],
    });
    fundingCount++;
    fundingTotal += yearTotal;
    console.log(
      `  ${src.kind.padEnd(17)} ${src.name.padEnd(38)} ` +
        `${formatCad(yearTotal).padStart(14)}/yr`,
    );
  }
  console.log(
    `Revenue: ${fundingCount} funding sources, ` +
      `total projected receipts = ${formatCad(fundingTotal)}.`,
  );

  const projectedClosing =
    (year.openingBalance ? Number(year.openingBalance) : 0) +
    fundingTotal -
    annualTotal;
  console.log(
    `\nProjected ${YEAR} closing balance ` +
      `(opening ${year.openingBalance ?? "unset"} + receipts − disbursements) = ${formatCad(projectedClosing)}.`,
  );
}

function formatCad(v: number): string {
  return v.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
