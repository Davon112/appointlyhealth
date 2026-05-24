import type { Config } from "drizzle-kit";

// .env is consumed by Next.js automatically at runtime, but drizzle-kit
// invoked via `npm run db:generate` / `db:migrate` doesn't go through Next,
// so we load it explicitly here.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
