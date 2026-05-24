/**
 * Drop all Appointly tables + Drizzle's migration tracker. Used by
 * `npm run db:reset` before re-running migrations.
 *
 *   npm run db:drop
 *
 * SAFETY: this nukes data. There's an interactive confirmation prompt
 * unless you pass `--yes` (which the npm scripts do).
 */
import "dotenv/config";
import { Pool } from "pg";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const url: string = (() => {
  const u = process.env.DATABASE_URL;
  if (!u) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  return u;
})();

const skipConfirm = process.argv.includes("--yes");

async function main() {
  if (!skipConfirm) {
    const rl = readline.createInterface({ input, output });
    const host = (() => { try { return new URL(url).host; } catch { return "<db>"; } })();
    const answer = await rl.question(
      `About to DROP all Appointly tables on ${host}. Type 'yes' to continue: `,
    );
    rl.close();
    if (answer.trim().toLowerCase() !== "yes") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
  });

  console.log("Dropping tables + haversine function + drizzle migration log...");
  // CASCADE to clear FKs in any order.
  await pool.query(`DROP TABLE IF EXISTS accepting_status_reports CASCADE`);
  await pool.query(`DROP TABLE IF EXISTS provider_locations CASCADE`);
  await pool.query(`DROP TABLE IF EXISTS providers CASCADE`);
  await pool.query(`DROP TABLE IF EXISTS clinics CASCADE`);
  await pool.query(`DROP FUNCTION IF EXISTS haversine_miles(double precision, double precision, double precision, double precision)`);
  // Drizzle stores its migration journal in this table — drop it so the
  // next `db:migrate` re-applies migrations cleanly.
  await pool.query(`DROP TABLE IF EXISTS "__drizzle_migrations" CASCADE`);
  await pool.query(`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await pool.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
