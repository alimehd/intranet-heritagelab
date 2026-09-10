/**
 * One-shot import of a TD account activity CSV.
 *
 * Mirrors the /budget/[year]/bank/import server action but callable from the
 * CLI so historical files (or the initial cutover file) can be loaded
 * outside the browser. Idempotent: rows are keyed by `dedupe_hash`, so
 * re-running with an overlapping period is safe.
 *
 * Usage:
 *   npm run import:td-csv -- <path-to-csv> [--account "Account Name"]
 *
 * Defaults:
 *   --account defaults to "TD Chequing" (created if missing).
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { eq, inArray } from "drizzle-orm";
import type * as Schema from "../src/lib/db/schema";
import { autoClassify } from "../src/lib/budget/classify";
import { parseTdCsv, parsedPeriod } from "../src/lib/budget/csv";

async function main() {
  const args = process.argv.slice(2);
  const csvArg = args.find((a) => !a.startsWith("--"));
  if (!csvArg) {
    console.error("Usage: npm run import:td-csv -- <path-to-csv> [--account \"Account Name\"]");
    process.exit(2);
  }
  const accountFlagIdx = args.findIndex((a) => a === "--account");
  const accountName =
    accountFlagIdx >= 0 && args[accountFlagIdx + 1]
      ? args[accountFlagIdx + 1]
      : "TD Chequing";

  const csvPath = resolve(csvArg);
  console.log(`Reading  ${csvPath}`);
  console.log(`Account  ${accountName}`);

  const text = readFileSync(csvPath, "utf8");

  // Dynamic imports so dotenv loads before drizzle initialises Neon.
  const { db } = await import("../src/lib/db");
  const { bankAccounts, bankImports, bankTransactions, budgetLines } =
    (await import("../src/lib/db/schema")) as typeof Schema;

  // ---- Resolve or create the account ----
  let [account] = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.name, accountName));
  if (!account) {
    console.log(`Creating account "${accountName}"…`);
    [account] = await db
      .insert(bankAccounts)
      .values({ name: accountName })
      .returning();
  } else {
    console.log(`Reusing existing account ${account.id}`);
  }

  // ---- Parse the CSV ----
  const parsed = parseTdCsv(text, account.id);
  if (!parsed.ok) {
    const where = parsed.lineNumber ? ` (line ${parsed.lineNumber})` : "";
    console.error(`Parse error: ${parsed.error}${where}`);
    process.exit(1);
  }
  if (parsed.rows.length === 0) {
    console.log("No rows to import.");
    return;
  }
  console.log(`Parsed   ${parsed.rows.length} rows`);
  const period = parsedPeriod(parsed.rows);
  console.log(`Period   ${period.from ?? "—"} → ${period.to ?? "—"}`);

  // ---- Dedupe against existing hashes ----
  const hashes = parsed.rows.map((r) => r.dedupeHash);
  const existing = hashes.length
    ? await db
        .select({ h: bankTransactions.dedupeHash })
        .from(bankTransactions)
        .where(inArray(bankTransactions.dedupeHash, hashes))
    : [];
  const seen = new Set(existing.map((r) => r.h));
  const fresh = parsed.rows.filter((r) => !seen.has(r.dedupeHash));
  console.log(`New      ${fresh.length}  (Dupes ${parsed.rows.length - fresh.length})`);

  // ---- Look up auto-classified budget lines by fullCode ----
  const wantedCodes = new Set<string>();
  const decisions = fresh.map((r) => {
    const auto = autoClassify(r.description);
    if (auto?.budgetLineFullCode) wantedCodes.add(auto.budgetLineFullCode);
    return { row: r, auto };
  });
  const codeMap = new Map<string, string>();
  if (wantedCodes.size > 0) {
    const found = await db
      .select({ id: budgetLines.id, code: budgetLines.fullCode })
      .from(budgetLines)
      .where(inArray(budgetLines.fullCode, Array.from(wantedCodes)));
    for (const f of found) codeMap.set(f.code, f.id);
  }

  // ---- Record the import batch ----
  const [imp] = await db
    .insert(bankImports)
    .values({
      accountId: account.id,
      importedBy: "cli",
      filename: basename(csvPath),
      rowCountTotal: parsed.rows.length,
      rowCountNew: fresh.length,
      rowCountDupe: parsed.rows.length - fresh.length,
      periodFrom: period.from,
      periodTo: period.to,
    })
    .returning();

  // ---- Insert fresh transactions ----
  let autoTagged = 0;
  if (fresh.length > 0) {
    const values = decisions.map(({ row, auto }) => {
      const budgetLineId = auto?.budgetLineFullCode
        ? codeMap.get(auto.budgetLineFullCode) ?? null
        : null;
      const classification = auto?.classification ?? "unclassified";
      if (auto && classification !== "unclassified") autoTagged++;
      return {
        accountId: account.id,
        importId: imp.id,
        txnDate: row.txnDate,
        description: row.description,
        debit: row.debit,
        credit: row.credit,
        runningBalance: row.runningBalance,
        dedupeHash: row.dedupeHash,
        classification,
        budgetLineId,
        classifiedBy: auto ? "auto" : null,
        classifiedAt: auto ? new Date() : null,
        note: auto ? `auto: ${auto.reason}` : null,
      };
    });
    await db.insert(bankTransactions).values(values);
  }

  console.log(
    `\nImport complete. ` +
      `Inserted ${fresh.length}, skipped ${parsed.rows.length - fresh.length} dupes, ` +
      `auto-tagged ${autoTagged}. Import batch ${imp.id}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
