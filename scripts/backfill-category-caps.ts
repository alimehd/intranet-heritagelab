/**
 * One-time backfill: convert `allowed_category_codes: text[]` into the new
 * `category_caps: jsonb` shape on every funding_source. Sets cap=null
 * (unlimited) for each existing allowed code so behaviour is unchanged.
 *
 * Safe to re-run: any source that already has non-empty categoryCaps is
 * left alone.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { eq, sql } from "drizzle-orm";
import type * as Schema from "../src/lib/db/schema";

async function main() {
  const { db } = await import("../src/lib/db");
  const { fundingSources } =
    (await import("../src/lib/db/schema")) as typeof Schema;

  const rows = await db.select().from(fundingSources);
  console.log(`Found ${rows.length} funding sources.`);

  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    if ((r.categoryCaps?.length ?? 0) > 0) {
      skipped++;
      continue;
    }
    const caps = (r.allowedCategoryCodes ?? []).map((code) => ({
      code,
      cap: null,
    }));
    await db
      .update(fundingSources)
      .set({ categoryCaps: caps })
      .where(eq(fundingSources.id, r.id));
    console.log(`  ✓ ${r.name}: ${caps.length} category codes migrated`);
    updated++;
  }
  console.log(`\nUpdated ${updated}. Skipped ${skipped} (already migrated).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
