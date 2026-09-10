/**
 * Diagnostic for the Excel import. Prints:
 *   1. Which fiscal years exist in the DB.
 *   2. Which budget-line codes referenced by the Excel are missing.
 *   3. How many Excel rows would match a real TD bank txn (within ± tolerance).
 * Read-only, safe to run any time.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import type * as Schema from "../src/lib/db/schema";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";

type ExcelRow = {
  row: number;
  date: string | null;
  description: string | null;
  budget_line: string | null;
  cost: string | null;
  month: string | null;
  project: string | null;
  type_of_spend: string | null;
};

async function main() {
  const { db } = await import("../src/lib/db");
  const {
    budgetLines,
    budgetCategories,
    budgetFiscalYears,
    bankTransactions,
    fundingSources,
  } = (await import("../src/lib/db/schema")) as typeof Schema;

  const records = JSON.parse(
    readFileSync("/tmp/hl-expenses.json", "utf8"),
  ) as ExcelRow[];

  // ---- Fiscal years ----
  const fys = await db.select().from(budgetFiscalYears);
  console.log("FISCAL YEARS in DB:");
  for (const fy of fys) {
    console.log(`  ${fy.year}  id=${fy.id.slice(0, 8)}  locked=${fy.isLocked}`);
  }

  // ---- Budget-line coverage ----
  const dbLines = await db
    .select({
      id: budgetLines.id,
      code: budgetLines.fullCode,
      name: budgetLines.name,
      categoryId: budgetLines.categoryId,
    })
    .from(budgetLines);
  const dbCats = await db.select().from(budgetCategories);
  const dbCodes = new Set(dbLines.map((l) => l.code));

  const wanted = Array.from(
    new Set(records.map((r) => r.budget_line).filter(Boolean)),
  ) as string[];
  const missing = wanted.filter((c) => !dbCodes.has(c));

  console.log(`\nDB budget lines: ${dbLines.length}. Excel references: ${wanted.length}.`);
  console.log(`✅ PRESENT: ${wanted.length - missing.length}`);
  console.log(`❌ MISSING: ${missing.length} → ${missing.join(", ")}`);

  // ---- Categories in DB ----
  console.log(`\nCATEGORIES in DB:`);
  for (const c of dbCats) {
    console.log(`  ${c.code}  ${c.name}  (fy=${c.fiscalYearId.slice(0, 8)})`);
  }

  // ---- Funding sources ----
  const funds = await db.select().from(fundingSources);
  console.log(`\nFUNDING SOURCES:`);
  for (const f of funds) console.log(`  ${f.id.slice(0, 8)}  ${f.name}`);

  // ---- Unclassified bank txns ----
  const bankRows = await db
    .select({
      id: bankTransactions.id,
      date: bankTransactions.txnDate,
      description: bankTransactions.description,
      debit: bankTransactions.debit,
      classification: bankTransactions.classification,
    })
    .from(bankTransactions);
  console.log(`\nBANK TXNS: ${bankRows.length} total`);
  const byClass = new Map<string, number>();
  for (const r of bankRows) {
    byClass.set(r.classification, (byClass.get(r.classification) ?? 0) + 1);
  }
  for (const [k, v] of byClass) console.log(`  ${k}: ${v}`);

  // ---- Match rate: Excel row -> bank row by date + amount ----
  // Try exact date first, then ± 5 days.
  const bankByDateAmount = new Map<string, string[]>(); // key: "yyyy-mm-dd|1234.56"
  for (const r of bankRows) {
    if (!r.debit) continue;
    const key = `${r.date}|${Number(r.debit).toFixed(2)}`;
    const arr = bankByDateAmount.get(key) ?? [];
    arr.push(r.id);
    bankByDateAmount.set(key, arr);
  }

  const bankByAmount = new Map<string, Array<{ id: string; date: string }>>();
  for (const r of bankRows) {
    if (!r.debit) continue;
    const key = Number(r.debit).toFixed(2);
    const arr = bankByAmount.get(key) ?? [];
    arr.push({ id: r.id, date: r.date });
    bankByAmount.set(key, arr);
  }

  function daysBetween(a: string, b: string) {
    const A = new Date(a).getTime();
    const B = new Date(b).getTime();
    return Math.abs(Math.round((A - B) / 86_400_000));
  }

  let exactMatches = 0;
  let fuzzyMatches = 0;
  let noMatch = 0;
  let preTd = 0; // Excel row is before the TD CSV starts
  const tdStart = "2025-03-05";

  for (const r of records) {
    if (!r.date || !r.cost) {
      noMatch++;
      continue;
    }
    const amount = Number(r.cost).toFixed(2);
    const exactKey = `${r.date}|${amount}`;
    if (bankByDateAmount.has(exactKey)) {
      exactMatches++;
      continue;
    }
    // Fuzzy by amount, ±5d
    const candidates = bankByAmount.get(amount) ?? [];
    const near = candidates.filter((c) => daysBetween(c.date, r.date!) <= 5);
    if (near.length > 0) {
      fuzzyMatches++;
      continue;
    }
    if (r.date < tdStart) preTd++;
    else noMatch++;
  }

  console.log(`\n--- MATCH SIMULATION (Excel ${records.length} rows vs bank) ---`);
  console.log(`  Exact date+amount:      ${exactMatches}`);
  console.log(`  Fuzzy (±5d, amount):    ${fuzzyMatches}`);
  console.log(`  Pre-TD-window (must be manual): ${preTd}`);
  console.log(`  No bank match (in TD window):    ${noMatch}`);
  console.log(`  ------`);
  console.log(`  TOTAL: ${exactMatches + fuzzyMatches + preTd + noMatch}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
