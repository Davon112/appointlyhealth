/**
 * Apply Drizzle migrations to the local SQLite DB.
 * Generates them on the fly if `drizzle/` is empty.
 *
 *   npm run db:migrate
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { execSync } from "child_process";

const dbPath = (process.env.DATABASE_URL ?? "file:./appointly.db").replace(/^file:/, "");

const migrationsDir = "./drizzle";
if (!existsSync(migrationsDir)) {
  mkdirSync(migrationsDir, { recursive: true });
}
const hasGenerated = readdirSync(migrationsDir).some((f) => f.endsWith(".sql"));
if (!hasGenerated) {
  console.log("No migrations found — generating from schema...");
  execSync("npx drizzle-kit generate", { stdio: "inherit" });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite);

console.log(`Migrating ${dbPath}...`);
migrate(db, { migrationsFolder: migrationsDir });
console.log("Migrations applied.");
sqlite.close();
