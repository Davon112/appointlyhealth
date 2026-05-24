/**
 * Apply Drizzle migrations to the configured Postgres DB.
 * Generates them on the fly if `drizzle/` is empty, then installs the
 * haversine_miles() SQL function that the geo search queries depend on.
 *
 *   npm run db:migrate
 */
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { execSync } from "child_process";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set. Add a Neon (or other Postgres) connection " +
    "string to .env — e.g. postgresql://user:pass@host/db?sslmode=require",
  );
  process.exit(1);
}

const migrationsDir = "./drizzle";
if (!existsSync(migrationsDir)) mkdirSync(migrationsDir, { recursive: true });

const hasGenerated = readdirSync(migrationsDir).some((f) => f.endsWith(".sql"));
if (!hasGenerated) {
  console.log("No migrations found — generating from schema...");
  execSync("npx drizzle-kit generate", { stdio: "inherit" });
}

const pool = new Pool({
  connectionString: url,
  ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log(`Migrating ${redactDbUrl(url!)}...`);
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: migrationsDir });

  console.log("Installing haversine_miles() SQL function...");
  // Mirror of the SQLite UDF and the JS implementation in src/lib/geo.
  // IMMUTABLE PARALLEL SAFE so Postgres can inline + reuse plan caches.
  await pool.query(`
    CREATE OR REPLACE FUNCTION haversine_miles(
      lat1 double precision,
      lng1 double precision,
      lat2 double precision,
      lng2 double precision
    ) RETURNS double precision
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
    DECLARE
      r CONSTANT double precision := 3958.7613;
      d_lat double precision;
      d_lng double precision;
      a double precision;
    BEGIN
      IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
        RETURN NULL;
      END IF;
      d_lat := radians(lat2 - lat1);
      d_lng := radians(lng2 - lng1);
      a := sin(d_lat / 2) ^ 2
         + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ^ 2;
      RETURN 2 * r * asin(sqrt(a));
    END;
    $$;
  `);

  console.log("Installing appointment_request_recipients CHECK constraint...");
  // Exactly one of clinic_id or provider_npi must be set per row. Drizzle
  // doesn't ship CHECK constraints as a first-class feature yet, so we add
  // it idempotently here.
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'arr_recipient_xor'
      ) THEN
        ALTER TABLE appointment_request_recipients
          ADD CONSTRAINT arr_recipient_xor
          CHECK ((clinic_id IS NOT NULL)::int + (provider_npi IS NOT NULL)::int = 1);
      END IF;
    END $$;
  `);

  console.log("Migrations applied + haversine_miles() installed.");
}

function redactDbUrl(u: string): string {
  try {
    const p = new URL(u);
    return `${p.protocol}//${p.username}:***@${p.host}${p.pathname}`;
  } catch {
    return "<db>";
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
