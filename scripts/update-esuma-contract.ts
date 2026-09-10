/**
 * Patch the live 2026 ESUMA funding source from the signed KRG contract
 * ET0826001 (Interactive Inuktitut Language Learning Platform).
 *
 * Usage: npm run update:esuma
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { and, eq } from "drizzle-orm";

const NOTES =
  "KRG Sustainable Employment — file ET0826001 (signed 24 Mar 2026). " +
  "Project: Interactive Inuktitut Language Learning Platform. " +
  "Program 08-Delivery Assistance / ESUMA. " +
  "Contract $150,000, 1 Apr 2026 – 31 Mar 2027 (KRG fiscal). " +
  "Schedule B: training/dev $45k, trainer fees $37k, trainer travel $10k, " +
  "participant lodging $5k, other special costs $53k (QA/cultural " +
  "validation, language committee, youth artist, software, server). " +
  "No admin fee. Reimbursement on 30–90 day claims. " +
  "The 2025 ESUMA-AYAGUTA grant ($150k) is a separate historical entry.";

const MONTHLY = [
  "0.00",
  "0.00",
  "50000.00",
  "0.00",
  "50000.00",
  "0.00",
  "0.00",
  "0.00",
  "50000.00",
  "0.00",
  "0.00",
  "0.00",
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
      and(eq(fundingSources.fiscalYearId, fy.id), eq(fundingSources.name, "ESUMA")),
    );
  if (!existing) {
    throw new Error("ESUMA funding source not found for 2026.");
  }

  await db
    .update(fundingSources)
    .set({
      kind: "grant",
      contractValue: "150000.00",
      monthlyExpected: MONTHLY,
      contractStartDate: "2026-04-01",
      contractEndDate: "2027-03-31",
      contractTotalValue: "150000.00",
      yearlyAllocations: [
        { year: 2026, amount: 150_000 },
        { year: 2027, amount: 0 },
      ],
      notes: NOTES,
    })
    .where(eq(fundingSources.id, existing.id));

  const [updated] = await db
    .select()
    .from(fundingSources)
    .where(eq(fundingSources.id, existing.id));

  console.log("Updated ESUMA funding source:");
  console.log(`  id:                 ${updated.id}`);
  console.log(`  contract value:     ${updated.contractValue}`);
  console.log(`  contract total:     ${updated.contractTotalValue}`);
  console.log(
    `  period:             ${updated.contractStartDate} → ${updated.contractEndDate}`,
  );
  console.log(`  yearly allocations: ${JSON.stringify(updated.yearlyAllocations)}`);
  console.log(`  monthly expected:   ${updated.monthlyExpected.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
