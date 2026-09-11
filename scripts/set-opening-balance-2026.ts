/**
 * Set the 2026 fiscal year opening cash balance.
 *
 * Usage: npm run set:opening-2026
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { eq } from "drizzle-orm";

const YEAR = 2026;
const OPENING_BALANCE = "39546.97";

async function main() {
  const { db } = await import("../src/lib/db");
  const { budgetFiscalYears } = await import("../src/lib/db/schema");

  const [fy] = await db
    .select()
    .from(budgetFiscalYears)
    .where(eq(budgetFiscalYears.year, YEAR));
  if (!fy) throw new Error(`Fiscal year ${YEAR} isn't seeded yet.`);

  await db
    .update(budgetFiscalYears)
    .set({ openingBalance: OPENING_BALANCE })
    .where(eq(budgetFiscalYears.id, fy.id));

  console.log(`Set ${YEAR} opening balance to $${OPENING_BALANCE}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
