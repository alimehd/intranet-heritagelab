import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// During `next build`, DATABASE_URL may be unavailable. Use a dummy URL so
// module evaluation doesn't throw; the real env is required at request time
// and neon() will fail loudly if it's still missing then.
const sql = neon(
  process.env.DATABASE_URL ??
    "postgres://build:build@build.invalid/build?sslmode=require",
);
export const db = drizzle(sql, { schema });
export { schema };
