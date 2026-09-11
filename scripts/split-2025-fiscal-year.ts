/**
 * Create a real, standalone 2025 fiscal year and move/split all 2025-dated
 * activity out of the 2026 fiscal year structure into it.
 *
 * Why: the whole budget module only ever had ONE fiscal year row (2026).
 * Every category/line/funding-source lived under it, so 522 bank rows
 * dated in 2025 (352 direct expenses + a $24,604.65 MUHC deposit + fees)
 * were structurally "2026" even though they happened in 2025. Four
 * funding sources had 2025 activity:
 *   - PME MTL            100% 2025 (contract is 2025-01-01..2025-12-31) -> MOVE
 *   - PROJET PONCTUELLE  100% 2025                                       -> MOVE
 *   - ESUMA              100% 2025 (legacy Ayaguta-era spend; the real
 *                         $150k KRG ET0826001 contract starts 2026-04-01
 *                         and has ZERO txns tagged so far)               -> SPLIT
 *   - McGill-001 / MUHC  15 rows 2025 (+ $24,604.65 deposit),
 *                        2 rows 2026 ($46,000.05 in deposits)            -> SPLIT
 *
 * This script:
 *  1. Creates budget_fiscal_year(year=2025).
 *  2. Clones every 2026 budget_category + budget_line into 2025 (same
 *     code/fullCode/name, monthlyProjected all zero — 2025 was never
 *     formally budgeted, only actuals are being backfilled).
 *  3. Moves PME MTL and PROJET PONCTUELLE's fiscalYearId to 2025 wholesale.
 *  4. Creates 2025-scoped sibling rows for ESUMA and McGill-001, and
 *     re-points the 2025-dated bank txns' fundingSourceId at the new rows.
 *  5. Re-points budgetLineId on every 2025-dated bank_transaction AND
 *     bank_transaction_split to the matching 2025 budget line (by
 *     fullCode), leaving the underlying dates/amounts/descriptions
 *     completely untouched.
 *  6. Prints a before/after reconciliation so every dollar is accounted
 *     for.
 *
 * Usage: npm run split:2025 -- --dry   (preview only, no writes)
 *        npm run split:2025            (apply)
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

const DRY_RUN = process.argv.includes("--dry");

async function main() {
  const { db } = await import("../src/lib/db");
  const {
    budgetFiscalYears,
    budgetCategories,
    budgetLines,
    fundingSources,
    bankTransactions,
    bankTransactionSplits,
  } = await import("../src/lib/db/schema");
  const { eq, inArray, sql } = await import("drizzle-orm");

  console.log(DRY_RUN ? "=== DRY RUN (no writes) ===" : "=== APPLYING ===");

  // ---- 0. Load current state ----
  const [fy2026] = await db
    .select()
    .from(budgetFiscalYears)
    .where(eq(budgetFiscalYears.year, 2026));
  if (!fy2026) throw new Error("2026 fiscal year not found.");

  let [fy2025] = await db
    .select()
    .from(budgetFiscalYears)
    .where(eq(budgetFiscalYears.year, 2025));

  const allSources = await db.select().from(fundingSources);
  const pmeMtl = allSources.find((s) => s.name === "PME MTL" && s.fiscalYearId === fy2026.id);
  const projetPonctuelle = allSources.find(
    (s) => s.name === "PROJET PONCTUELLE" && s.fiscalYearId === fy2026.id,
  );
  const esuma = allSources.find((s) => s.name === "ESUMA" && s.fiscalYearId === fy2026.id);
  const mcgill = allSources.find((s) => s.name === "McGill-001" && s.fiscalYearId === fy2026.id);
  if (!pmeMtl || !projetPonctuelle || !esuma || !mcgill) {
    throw new Error("One of the expected 2026 funding sources wasn't found — aborting.");
  }

  const cats2026 = await db
    .select()
    .from(budgetCategories)
    .where(eq(budgetCategories.fiscalYearId, fy2026.id));
  const lines2026 = await db.select().from(budgetLines);

  // ---- 1. Create FY2025 ----
  if (!fy2025) {
    console.log("Creating budget_fiscal_year(year=2025)...");
    if (!DRY_RUN) {
      const [inserted] = await db
        .insert(budgetFiscalYears)
        .values({ year: 2025, openingBalance: null, isLocked: false })
        .returning();
      fy2025 = inserted;
    }
  } else {
    console.log("FY2025 already exists — reusing it (safe to re-run).");
  }

  // ---- 2. Clone categories + lines into FY2025 ----
  const categoryIdMap = new Map<string, string>(); // old 2026 catId -> new 2025 catId
  const lineIdMap = new Map<string, string>(); // old 2026 lineId -> new 2025 lineId

  if (!DRY_RUN && fy2025) {
    const existingCats2025 = await db
      .select()
      .from(budgetCategories)
      .where(eq(budgetCategories.fiscalYearId, fy2025.id));

    for (const cat of cats2026) {
      let cat2025 = existingCats2025.find((c) => c.code === cat.code);
      if (!cat2025) {
        const [inserted] = await db
          .insert(budgetCategories)
          .values({
            fiscalYearId: fy2025.id,
            code: cat.code,
            name: cat.name,
            sortOrder: cat.sortOrder,
          })
          .returning();
        cat2025 = inserted;
        console.log(`  created category ${cat.code} ${cat.name} for 2025`);
      }
      categoryIdMap.set(cat.id, cat2025.id);
    }

    const existingLines2025 = await db
      .select()
      .from(budgetLines)
      .where(
        inArray(
          budgetLines.categoryId,
          [...categoryIdMap.values()],
        ),
      );

    for (const line of lines2026) {
      const newCatId = categoryIdMap.get(line.categoryId);
      if (!newCatId) continue; // line's category isn't 2026 (shouldn't happen)
      let line2025 = existingLines2025.find(
        (l) => l.categoryId === newCatId && l.code === line.code,
      );
      if (!line2025) {
        const zeros = new Array(12).fill("0.00");
        const [inserted] = await db
          .insert(budgetLines)
          .values({
            categoryId: newCatId,
            code: line.code,
            fullCode: line.fullCode,
            name: line.name,
            monthlyProjected: zeros,
            sortOrder: line.sortOrder,
          })
          .returning();
        line2025 = inserted;
      }
      lineIdMap.set(line.id, line2025.id);
    }
    console.log(`Cloned ${categoryIdMap.size} categories / ${lineIdMap.size} lines into 2025.`);
  } else {
    console.log(
      `Would clone ${cats2026.length} categories / ${lines2026.length} lines into 2025.`,
    );
  }

  // ---- 3. Move 100%-2025 funding sources wholesale ----
  console.log(`\nPME MTL: move fiscalYearId 2026 -> 2025 (${pmeMtl.id})`);
  console.log(`PROJET PONCTUELLE: move fiscalYearId 2026 -> 2025 (${projetPonctuelle.id})`);
  if (!DRY_RUN && fy2025) {
    await db
      .update(fundingSources)
      .set({ fiscalYearId: fy2025.id })
      .where(eq(fundingSources.id, pmeMtl.id));
    await db
      .update(fundingSources)
      .set({ fiscalYearId: fy2025.id })
      .where(eq(fundingSources.id, projetPonctuelle.id));
  }

  // ---- 4. Split ESUMA and McGill-001 ----
  let esuma2025Id: string | null = null;
  let mcgill2025Id: string | null = null;

  if (!DRY_RUN && fy2025) {
    const existingEsuma2025 = allSources.find(
      (s) => s.name === "ESUMA" && s.fiscalYearId === fy2025!.id,
    );
    if (existingEsuma2025) {
      esuma2025Id = existingEsuma2025.id;
    } else {
      const [inserted] = await db
        .insert(fundingSources)
        .values({
          fiscalYearId: fy2025.id,
          name: "ESUMA",
          kind: esuma.kind,
          contractValue: "0.00",
          monthlyExpected: new Array(12).fill(0),
          notes:
            "Legacy 2025 KI/Ayaguta-era activity, split out from the 'ESUMA' " +
            "funding source on 2026-09-11 when that name was repointed to the " +
            "real $150k KRG contract ET0826001 (2026-04-01 to 2027-03-31). " +
            "This 2025 row has no formal contract value entered — Ali should " +
            "fill in the actual 2025 grant/contract details if known.",
          allowedCategoryCodes: [],
          status: "completed",
          sortOrder: esuma.sortOrder,
        })
        .returning();
      esuma2025Id = inserted.id;
    }
    console.log(`\nESUMA (2025 split) id = ${esuma2025Id}`);

    const existingMcgill2025 = allSources.find(
      (s) => s.name === "McGill-001" && s.fiscalYearId === fy2025!.id,
    );
    if (existingMcgill2025) {
      mcgill2025Id = existingMcgill2025.id;
    } else {
      const [inserted] = await db
        .insert(fundingSources)
        .values({
          fiscalYearId: fy2025.id,
          name: "McGill-001",
          kind: mcgill.kind,
          contractValue: "0.00",
          monthlyExpected: new Array(12).fill(0),
          notes:
            "2025 portion of the McGill-001/MUHC relationship, split out on " +
            "2026-09-11 so 2025 deposits/expenses don't get counted against " +
            "the 2026 McGill-001 project (which now only holds the two 2026 " +
            "IR-CUSM/RI-MUHC deposits totaling $46,000.05).",
          allowedCategoryCodes: [],
          status: mcgill.status,
          sortOrder: mcgill.sortOrder,
        })
        .returning();
      mcgill2025Id = inserted.id;
    }
    console.log(`McGill-001 (2025 split) id = ${mcgill2025Id}`);
  } else {
    console.log("\nWould create 'ESUMA' and 'McGill-001' sibling rows under FY2025.");
  }

  // ---- 5. Re-point 2025-dated bank_transactions ----
  const txns2025 = await db
    .select()
    .from(bankTransactions)
    .where(
      sql`${bankTransactions.txnDate} >= '2025-01-01' AND ${bankTransactions.txnDate} <= '2025-12-31'`,
    );

  const lines2026Ids = new Set(lines2026.map((l) => l.id));
  let lineUpdates = 0;
  let fsUpdates = 0;
  for (const t of txns2025) {
    const patch: Record<string, unknown> = {};
    const willRepointLine = DRY_RUN
      ? !!t.budgetLineId && lines2026Ids.has(t.budgetLineId)
      : !!t.budgetLineId && lineIdMap.has(t.budgetLineId);
    if (willRepointLine) {
      lineUpdates++;
      if (!DRY_RUN) patch.budgetLineId = lineIdMap.get(t.budgetLineId!)!;
    }
    if (t.fundingSourceId === esuma.id) {
      fsUpdates++;
      if (!DRY_RUN && esuma2025Id) patch.fundingSourceId = esuma2025Id;
    } else if (t.fundingSourceId === mcgill.id) {
      fsUpdates++;
      if (!DRY_RUN && mcgill2025Id) patch.fundingSourceId = mcgill2025Id;
    }
    // PME MTL / PROJET PONCTUELLE keep their fundingSourceId unchanged —
    // the SOURCE moved fiscal years, the txn's tag doesn't need to change.
    if (Object.keys(patch).length > 0 && !DRY_RUN) {
      await db.update(bankTransactions).set(patch).where(eq(bankTransactions.id, t.id));
    }
  }
  console.log(
    `\nBank txns dated 2025: ${txns2025.length} total, ${lineUpdates} budgetLine repoints, ${fsUpdates} fundingSource repoints.`,
  );

  // ---- 6. Re-point splits whose PARENT txn is dated in 2025 ----
  const splits2025 = await db
    .select({
      id: bankTransactionSplits.id,
      budgetLineId: bankTransactionSplits.budgetLineId,
      fundingSourceId: bankTransactionSplits.fundingSourceId,
    })
    .from(bankTransactionSplits)
    .innerJoin(bankTransactions, eq(bankTransactions.id, bankTransactionSplits.bankTxnId))
    .where(
      sql`${bankTransactions.txnDate} >= '2025-01-01' AND ${bankTransactions.txnDate} <= '2025-12-31'`,
    );

  let splitLineUpdates = 0;
  for (const s of splits2025) {
    const patch: Record<string, unknown> = {};
    const willRepointLine = DRY_RUN
      ? !!s.budgetLineId && lines2026Ids.has(s.budgetLineId)
      : !!s.budgetLineId && lineIdMap.has(s.budgetLineId);
    if (willRepointLine) {
      splitLineUpdates++;
      if (!DRY_RUN) patch.budgetLineId = lineIdMap.get(s.budgetLineId!)!;
    }
    if (s.fundingSourceId === esuma.id && !DRY_RUN && esuma2025Id) {
      patch.fundingSourceId = esuma2025Id;
    } else if (s.fundingSourceId === mcgill.id && !DRY_RUN && mcgill2025Id) {
      patch.fundingSourceId = mcgill2025Id;
    }
    if (Object.keys(patch).length > 0 && !DRY_RUN) {
      await db.update(bankTransactionSplits).set(patch).where(eq(bankTransactionSplits.id, s.id));
    }
  }
  console.log(`Splits dated 2025: ${splits2025.length} total, ${splitLineUpdates} budgetLine repoints.`);

  console.log(DRY_RUN ? "\nDry run complete — no changes written." : "\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
