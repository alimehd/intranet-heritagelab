/**
 * Fill in the existing "PME MTL" funding source from the signed FES
 * application (FORMULAIRE_FES_FINAL). Same row id so the Excel-tagged
 * expenses stay attached. Status is completed — Ali confirmed the pot
 * was fully used.
 *
 * Usage: npm run update:pme
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { and, eq } from "drizzle-orm";

const NOTES =
  "PME MTL Ouest-de-l'Île — Fonds d'économie sociale (FES). " +
  "Project: Outils numériques pour la préservation linguistique " +
  "autochtone dans l'Ouest-de-l'Île. 12 months starting January 2025. " +
  "Grant $50,000 of a $62,500 start-up (Heritage Lab covered $12,500). " +
  "Eligible: equipment $15k, consulting $32.5k, technical implementation " +
  "$10k, documentation $5k. No Heritage Lab salaries. " +
  "Grant is fully spent / closed.";

const MONTHLY = Array.from({ length: 12 }, () => "0.00");

const CATEGORY_CAPS: Array<{ code: string; cap: number | null }> = [
  { code: "001", cap: 38_500 },
  { code: "002", cap: 15_000 },
  { code: "003", cap: 5_000 },
  { code: "004", cap: 4_000 },
  { code: "006", cap: 5_000 },
];

async function main() {
  const { db } = await import("../src/lib/db");
  const { budgetFiscalYears, fundingSources } = await import(
    "../src/lib/db/schema"
  );

  const [fy] = await db
    .select()
    .from(budgetFiscalYears)
    .where(eq(budgetFiscalYears.year, 2026));
  if (!fy) {
    throw new Error("Fiscal year 2026 is not seeded.");
  }

  const [existing] = await db
    .select()
    .from(fundingSources)
    .where(
      and(eq(fundingSources.fiscalYearId, fy.id), eq(fundingSources.name, "PME MTL")),
    );
  if (!existing) {
    throw new Error("PME MTL funding source not found for 2026.");
  }

  await db
    .update(fundingSources)
    .set({
      name: "PME MTL",
      kind: "grant",
      status: "completed",
      // Nothing left to receive in 2026 — the FES year was 2025.
      contractValue: "0.00",
      monthlyExpected: MONTHLY,
      contractStartDate: "2025-01-01",
      contractEndDate: "2025-12-31",
      contractTotalValue: "50000.00",
      yearlyAllocations: [{ year: 2025, amount: 50_000 }],
      notes: NOTES,
      categoryCaps: CATEGORY_CAPS,
      allowedCategoryCodes: CATEGORY_CAPS.map((c) => c.code),
    })
    .where(eq(fundingSources.id, existing.id));

  const [updated] = await db
    .select()
    .from(fundingSources)
    .where(eq(fundingSources.id, existing.id));

  console.log("Updated PME MTL FES grant:");
  console.log(`  id:                 ${updated.id}`);
  console.log(`  kind/status:        ${updated.kind} / ${updated.status}`);
  console.log(`  contract value 2026:${updated.contractValue}`);
  console.log(`  contract total:     ${updated.contractTotalValue}`);
  console.log(
    `  period:             ${updated.contractStartDate} → ${updated.contractEndDate}`,
  );
  console.log(`  yearly allocations: ${JSON.stringify(updated.yearlyAllocations)}`);
  console.log(`  category caps:      ${JSON.stringify(updated.categoryCaps)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
