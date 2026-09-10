/**
 * Import Ali's hand-kept Excel "Expenses" ledger (`for-test.xlsx` sheet 2)
 * into the DB, matching each row against the imported TD bank data so the
 * one-dollar-one-row invariant holds.
 *
 * Strategy (three passes per Excel row):
 *   1. Ensure the budget line exists. If missing, auto-create it under a
 *      new "007 — Project-specific" category (fiscal year 2026).
 *   2. Resolve the funding source from the Excel `project` column. If the
 *      project name isn't in the DB, create it as a manual-tracked source
 *      (contract value 0 — Ali fills it in later).
 *   3. Try to match a bank_transaction:
 *        a. exact  date + amount + unclassified
 *        b. fuzzy  ±5d + amount + unclassified (prefer same month)
 *      If matched: classify the bank txn as `direct_expense` with the
 *      Excel's budget line + funding source + note preserving Excel's row
 *      number and description.
 *      If unmatched: insert a NEW bank_transaction into a synthetic
 *      "Manual entries (pre-import)" account with the same classification,
 *      so the row shows up in the unified expenses ledger.
 *
 * Idempotency: every row we touch gets a `note` beginning with
 * `excel:row=NN` (or `excel-manual:row=NN`). If we detect that prefix on
 * re-run, we skip. Safe to run repeatedly.
 *
 * Usage:  npm run import:excel -- /tmp/hl-expenses.json
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql, like } from "drizzle-orm";
import type * as Schema from "../src/lib/db/schema";

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

const EXCEL_NOTE_PREFIX = "excel:row=";
const EXCEL_MANUAL_NOTE_PREFIX = "excel-manual:row=";
const MANUAL_ACCOUNT_NAME = "Manual entries (pre-import)";
const PROJECT_CATEGORY_CODE = "007";
const PROJECT_CATEGORY_NAME = "Project-specific lines";

// Normalisation helpers so "McGill-001" == "mcgill 001" == "McGill 001".
function normProject(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return t.toLowerCase().replace(/[\s_-]+/g, "");
}

function daysBetween(a: string, b: string) {
  const A = new Date(a).getTime();
  const B = new Date(b).getTime();
  return Math.abs(Math.round((A - B) / 86_400_000));
}

async function main() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const jsonPath = arg ?? "/tmp/hl-expenses.json";
  console.log(`Reading ${jsonPath}`);
  const records = JSON.parse(readFileSync(jsonPath, "utf8")) as ExcelRow[];
  console.log(`Loaded ${records.length} Excel rows.\n`);

  const { db } = await import("../src/lib/db");
  const {
    bankAccounts,
    bankTransactions,
    budgetCategories,
    budgetFiscalYears,
    budgetLines,
    fundingSources,
  } = (await import("../src/lib/db/schema")) as typeof Schema;

  // ---- Fiscal year ----
  const [fy] = await db
    .select()
    .from(budgetFiscalYears)
    .where(eq(budgetFiscalYears.year, 2026));
  if (!fy) throw new Error("Fiscal year 2026 not found — run seed:budget first.");
  console.log(`FY ${fy.year} → ${fy.id}`);

  // ---- Ensure "007 — Project-specific" category exists ----
  let [projCat] = await db
    .select()
    .from(budgetCategories)
    .where(
      and(
        eq(budgetCategories.fiscalYearId, fy.id),
        eq(budgetCategories.code, PROJECT_CATEGORY_CODE),
      ),
    );
  if (!projCat) {
    console.log(`Creating category ${PROJECT_CATEGORY_CODE} · ${PROJECT_CATEGORY_NAME}`);
    [projCat] = await db
      .insert(budgetCategories)
      .values({
        fiscalYearId: fy.id,
        code: PROJECT_CATEGORY_CODE,
        name: PROJECT_CATEGORY_NAME,
        sortOrder: 700,
      })
      .returning();
  }

  // ---- Ensure the 5 missing budget lines exist ----
  const existingLines = await db
    .select({
      id: budgetLines.id,
      fullCode: budgetLines.fullCode,
    })
    .from(budgetLines);
  const lineIdByCode = new Map(existingLines.map((l) => [l.fullCode, l.id]));

  const usedCodes = new Set(
    records.map((r) => r.budget_line).filter(Boolean) as string[],
  );
  const missingCodes = Array.from(usedCodes).filter((c) => !lineIdByCode.has(c));

  if (missingCodes.length > 0) {
    console.log(`Creating ${missingCodes.length} missing budget lines under ${PROJECT_CATEGORY_CODE}…`);
    let sortStart = 1;
    for (const code of missingCodes.sort()) {
      const [inserted] = await db
        .insert(budgetLines)
        .values({
          categoryId: projCat.id,
          code, // full code doubles as local code for these
          fullCode: code,
          name: code, // Ali can rename later
          monthlyProjected: new Array(12).fill("0"),
          sortOrder: sortStart++,
        })
        .returning({ id: budgetLines.id, fullCode: budgetLines.fullCode });
      lineIdByCode.set(inserted.fullCode, inserted.id);
      console.log(`   + ${code}`);
    }
  }

  // ---- Funding source resolution ----
  const dbFunds = await db.select().from(fundingSources);
  const fundByNorm = new Map<string, string>(); // norm -> id
  for (const f of dbFunds) {
    const n = normProject(f.name);
    if (n) fundByNorm.set(n, f.id);
  }

  async function resolveFundingSource(project: string | null): Promise<string | null> {
    const n = normProject(project);
    if (!n) return null;
    if (fundByNorm.has(n)) return fundByNorm.get(n)!;
    // Auto-create with kind=other so it doesn't count as a booked grant.
    const [inserted] = await db
      .insert(fundingSources)
      .values({
        fiscalYearId: fy.id,
        name: project!.trim(),
        kind: "other",
        contractValue: "0",
        monthlyExpected: new Array(12).fill("0"),
      })
      .returning({ id: fundingSources.id });
    fundByNorm.set(n, inserted.id);
    console.log(`   + funding source: ${project}`);
    return inserted.id;
  }

  // ---- Ensure "Manual entries" account exists ----
  let [manualAccount] = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.name, MANUAL_ACCOUNT_NAME));
  if (!manualAccount) {
    console.log(`Creating account "${MANUAL_ACCOUNT_NAME}"`);
    [manualAccount] = await db
      .insert(bankAccounts)
      .values({ name: MANUAL_ACCOUNT_NAME })
      .returning();
  }

  // ---- Pre-load all unclassified bank txns for matching ----
  const unclassifiedBank = await db
    .select({
      id: bankTransactions.id,
      date: bankTransactions.txnDate,
      description: bankTransactions.description,
      debit: bankTransactions.debit,
    })
    .from(bankTransactions)
    .where(eq(bankTransactions.classification, "unclassified"));
  console.log(`\n${unclassifiedBank.length} unclassified bank txns available for matching.\n`);

  // Index: amount -> list of {id, date}
  const bankByAmount = new Map<string, Array<{ id: string; date: string }>>();
  for (const r of unclassifiedBank) {
    if (!r.debit) continue;
    const key = Number(r.debit).toFixed(2);
    (bankByAmount.get(key) ?? bankByAmount.set(key, []).get(key)!).push({
      id: r.id,
      date: r.date,
    });
  }
  // Track which bank ids we've already consumed this run so a duplicate
  // Excel row doesn't claim the same TD txn twice.
  const consumedBankIds = new Set<string>();

  // Pre-check existing excel imports to skip
  const alreadyImported = await db
    .select({
      id: bankTransactions.id,
      note: bankTransactions.note,
    })
    .from(bankTransactions)
    .where(
      sql`${bankTransactions.note} LIKE ${EXCEL_NOTE_PREFIX + "%"} OR ${bankTransactions.note} LIKE ${EXCEL_MANUAL_NOTE_PREFIX + "%"}`,
    );
  const importedRows = new Set<number>();
  for (const r of alreadyImported) {
    const m = r.note?.match(/^excel(?:-manual)?:row=(\d+)/);
    if (m) importedRows.add(Number(m[1]));
  }
  if (importedRows.size > 0) {
    console.log(`Skipping ${importedRows.size} Excel rows already imported previously.`);
  }

  // ---- Match / import loop ----
  let matched = 0;
  let fuzzyMatched = 0;
  let manualInserted = 0;
  let skippedNoBudget = 0;
  let skippedNoData = 0;
  let skippedAlreadyImported = 0;

  for (const r of records) {
    if (importedRows.has(r.row)) {
      skippedAlreadyImported++;
      continue;
    }
    if (!r.date || !r.cost || !r.description || !r.budget_line) {
      skippedNoData++;
      continue;
    }
    const budgetLineId = lineIdByCode.get(r.budget_line);
    if (!budgetLineId) {
      skippedNoBudget++;
      continue;
    }
    const fundingSourceId = await resolveFundingSource(r.project);
    const amount = Number(r.cost).toFixed(2);
    const noteBase = `${EXCEL_NOTE_PREFIX}${r.row} :: ${r.description}${r.type_of_spend ? ` [${r.type_of_spend}]` : ""}`;

    const candidates = (bankByAmount.get(amount) ?? []).filter(
      (c) => !consumedBankIds.has(c.id),
    );

    // Prefer exact date; else nearest within ±5d.
    let chosen: { id: string; date: string } | null = null;
    const exact = candidates.find((c) => c.date === r.date);
    if (exact) chosen = exact;
    else {
      const withDelta = candidates
        .map((c) => ({ ...c, delta: daysBetween(c.date, r.date!) }))
        .filter((c) => c.delta <= 5)
        .sort((a, b) => a.delta - b.delta);
      if (withDelta.length > 0) chosen = withDelta[0];
    }

    if (chosen) {
      await db
        .update(bankTransactions)
        .set({
          classification: "direct_expense",
          budgetLineId,
          fundingSourceId,
          note: noteBase,
          classifiedBy: "excel-import",
          classifiedAt: new Date(),
        })
        .where(eq(bankTransactions.id, chosen.id));
      consumedBankIds.add(chosen.id);
      if (chosen.date === r.date) matched++;
      else fuzzyMatched++;
    } else {
      // No bank counterpart — create a manual entry so the ledger is complete.
      const dedupeHash = createHash("sha256")
        .update(
          `manual|${r.row}|${r.date}|${r.description}|${amount}`,
        )
        .digest("hex");
      await db.insert(bankTransactions).values({
        accountId: manualAccount.id,
        txnDate: r.date,
        description: r.description,
        debit: amount,
        credit: null,
        runningBalance: null,
        dedupeHash,
        classification: "direct_expense",
        budgetLineId,
        fundingSourceId,
        note: `${EXCEL_MANUAL_NOTE_PREFIX}${r.row} :: ${r.description}${r.type_of_spend ? ` [${r.type_of_spend}]` : ""}`,
        classifiedBy: "excel-import",
        classifiedAt: new Date(),
      });
      manualInserted++;
    }
  }

  console.log(`\n──── SUMMARY ────`);
  console.log(`Excel rows total:              ${records.length}`);
  console.log(`  Matched (exact date+amount): ${matched}`);
  console.log(`  Matched (fuzzy ±5d):         ${fuzzyMatched}`);
  console.log(`  Manual entries created:      ${manualInserted}`);
  console.log(`  Skipped (already imported):  ${skippedAlreadyImported}`);
  console.log(`  Skipped (incomplete row):    ${skippedNoData}`);
  console.log(`  Skipped (unknown budget):    ${skippedNoBudget}`);
  console.log(`\nBudget lines now in DB: ${lineIdByCode.size}`);
  console.log(`Funding sources now in DB: ${fundByNorm.size}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
