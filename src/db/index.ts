import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

type AppDb = NodePgDatabase<typeof schema>;

/**
 * Postgres connection.
 *
 * Local dev and production both point at a Neon Postgres URL (via the
 * pooled connection string — looks like `?sslmode=require`). pg's Pool
 * gives us connection reuse across requests in dev and on Vercel; we
 * hang a single Pool off globalThis so Next.js hot reload doesn't open
 * a fresh pool per file save.
 *
 * Distance is computed by a `haversine_miles(lat1, lng1, lat2, lng2)`
 * SQL function we ship in the first Drizzle migration. That mirrors the
 * JS UDF we used to register on the SQLite connection, and keeps geo
 * queries portable across any Postgres host (Neon, Supabase, RDS, etc.).
 */
declare global {
  // eslint-disable-next-line no-var
  var __appointly_pool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __appointly_db: AppDb | undefined;
}

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add a Neon (or other Postgres) connection " +
      "string to .env — e.g. postgresql://user:pass@host/db?sslmode=require",
    );
  }
  return new Pool({
    connectionString: url,
    // Neon requires TLS. node-postgres reads `sslmode=require` from the
    // URL automatically, but we set this defensively in case the URL is
    // missing the param.
    ssl: url.includes("sslmode=disable")
      ? false
      : { rejectUnauthorized: false },
    // Conservative defaults for serverless + dev. Neon's free tier has
    // a soft connection cap; we don't want to exhaust it.
    max: 5,
    idleTimeoutMillis: 30_000,
  });
}

function createDb(): AppDb {
  const pool = globalThis.__appointly_pool ?? createPool();
  if (!globalThis.__appointly_pool) globalThis.__appointly_pool = pool;
  return drizzle(pool, { schema });
}

export const db: AppDb = globalThis.__appointly_db ?? createDb();
if (process.env.NODE_ENV !== "production") {
  globalThis.__appointly_db = db;
}

/**
 * Raw pg pool for routes that need parameterised SQL (the geo search
 * queries on /find-doctor and /find-clinic). Mirrors the old `rawSqlite()`
 * API so callsites change minimally.
 */
export function pgPool(): Pool {
  if (!globalThis.__appointly_pool) {
    // Touch `db` to force pool creation if a route imports pgPool first.
    void db;
  }
  return globalThis.__appointly_pool!;
}

/**
 * Convenience wrapper around `pgPool().query()` that returns just `rows`.
 * Saves a `.rows` access at every callsite.
 */
export async function pgQuery<T = unknown>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pgPool().query(text, params);
  return res.rows as T[];
}

export type { PoolClient };
export { schema };
