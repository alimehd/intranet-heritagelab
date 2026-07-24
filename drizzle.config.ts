import { config as loadEnv } from "dotenv";
import type { Config } from "drizzle-kit";

// Next.js reads .env.local; dotenv does not, so load it explicitly here.
loadEnv({ path: ".env.local" });
loadEnv();

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
