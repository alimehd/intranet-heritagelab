/**
 * Replace the 2026 "Secrétariat aux affaires Autochtones" placeholder with
 * the FIA IV TTS proposal (TTS-Proposition-IV4). Same row id so any
 * expenses already tagged to SAA stay attached.
 *
 * PME MTL, MILA, and Abundant Intelligences are intentionally excluded.
 *
 * Usage: npm run update:fia-iv
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { and, eq, or } from "drizzle-orm";

const NOTES =
  "Fonds d'initiatives autochtones IV (Secrétariat aux affaires " +
  "autochtones) — proposition TTS-IV4. " +
  "Project: Synthèse vocale inuktitut pour le développement social " +
  "communautaire. 14 months (Phase 1 months 1–10, Phase 2 months 11–14). " +
  "FIA IV ask $120,000 (80% of the $150k project). " +
  "PME MTL $30k, MILA in-kind, and Abundant Intelligences in-kind are " +
  "excluded from this pot. " +
  "Replaces the old $80k SAA placeholder.";

const MONTHLY = [
  "0.00",
  "0.00",
  "120000.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
];

const CATEGORY_CAPS: Array<{ code: string; cap: number | null }> = [
  { code: "001", cap: 105_000 },
  { code: "003", cap: 10_000 },
  { code: "004", cap: 30_000 },
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
      and(
        eq(fundingSources.fiscalYearId, fy.id),
        or(
          eq(fundingSources.name, "Secrétariat aux affaires Autochtones"),
          eq(fundingSources.name, "FIA IV"),
        ),
      ),
    );
  if (!existing) {
    throw new Error(
      "Neither 'Secrétariat aux affaires Autochtones' nor 'FIA IV' found for 2026.",
    );
  }

  await db
    .update(fundingSources)
    .set({
      name: "FIA IV",
      kind: "grant",
      contractValue: "120000.00",
      monthlyExpected: MONTHLY,
      contractStartDate: "2026-01-01",
      contractEndDate: "2027-02-28",
      contractTotalValue: "120000.00",
      yearlyAllocations: [
        { year: 2026, amount: 120_000 },
        { year: 2027, amount: 0 },
      ],
      notes: NOTES,
      categoryCaps: CATEGORY_CAPS,
      allowedCategoryCodes: CATEGORY_CAPS.map((c) => c.code),
    })
    .where(eq(fundingSources.id, existing.id));

  const [updated] = await db
    .select()
    .from(fundingSources)
    .where(eq(fundingSources.id, existing.id));

  console.log("Replaced SAA placeholder with FIA IV:");
  console.log(`  id:                 ${updated.id}`);
  console.log(`  name:               ${updated.name}`);
  console.log(`  contract value:     ${updated.contractValue}`);
  console.log(`  contract total:     ${updated.contractTotalValue}`);
  console.log(
    `  period:             ${updated.contractStartDate} → ${updated.contractEndDate}`,
  );
  console.log(`  yearly allocations: ${JSON.stringify(updated.yearlyAllocations)}`);
  console.log(`  monthly expected:   ${updated.monthlyExpected.join(", ")}`);
  console.log(`  category caps:      ${JSON.stringify(updated.categoryCaps)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
