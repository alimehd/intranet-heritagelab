import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import type * as Schema from "../src/lib/db/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  const { db } = await import("../src/lib/db");
  const { bankTransactions, bankAccounts } =
    (await import("../src/lib/db/schema")) as typeof Schema;

  const byClass = await db
    .select({
      classification: bankTransactions.classification,
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${bankTransactions.debit}), 0)::text`,
    })
    .from(bankTransactions)
    .groupBy(bankTransactions.classification);
  console.log("BANK TXNS by classification:");
  for (const r of byClass) {
    console.log(`  ${r.classification.padEnd(20)} count=${r.count.toString().padStart(4)}  sum=$${Number(r.total).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`);
  }

  const byYear = await db
    .select({
      year: sql<string>`substr(${bankTransactions.txnDate}, 1, 4)`,
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${bankTransactions.debit}), 0)::text`,
    })
    .from(bankTransactions)
    .where(eq(bankTransactions.classification, "direct_expense"))
    .groupBy(sql`substr(${bankTransactions.txnDate}, 1, 4)`)
    .orderBy(sql`substr(${bankTransactions.txnDate}, 1, 4)`);
  console.log("\nDirect expenses by year:");
  for (const r of byYear) {
    console.log(`  ${r.year}  count=${r.count.toString().padStart(4)}  sum=$${Number(r.total).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`);
  }

  const byAcc = await db
    .select({
      account: bankAccounts.name,
      count: sql<number>`count(*)::int`,
    })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.accountId))
    .where(eq(bankTransactions.classification, "direct_expense"))
    .groupBy(bankAccounts.name);
  console.log("\nDirect expenses by account:");
  for (const r of byAcc) console.log(`  ${r.account.padEnd(35)} ${r.count}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
