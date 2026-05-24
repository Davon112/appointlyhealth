import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

type AppDb = BetterSQLite3Database<typeof schema>;

/**
 * SQLite has no PostGIS. We register a tiny Haversine UDF so that the
 * search query can both bracket-filter on lat/lng (using the index) AND
 * order by true great-circle distance — all in one SQL pass.
 *
 * When you migrate to Postgres, drop this and use PostGIS's
 * `ST_DistanceSphere(geom, ...)` instead.
 */
function attachHaversine(db: Database.Database): void {
  db.function(
    "haversine_miles",
    { deterministic: true, varargs: false },
    (lat1: number, lng1: number, lat2: number, lng2: number) => {
      if (
        lat1 == null || lng1 == null || lat2 == null || lng2 == null ||
        Number.isNaN(lat1) || Number.isNaN(lng1) || Number.isNaN(lat2) || Number.isNaN(lng2)
      ) {
        return null;
      }
      const R = 3958.7613; // earth radius, miles
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    },
  );
}

// Singleton across hot reloads in dev.
declare global {
  // eslint-disable-next-line no-var
  var __appointly_db: AppDb | undefined;
  // eslint-disable-next-line no-var
  var __appointly_sqlite: Database.Database | undefined;
}

function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL ?? "file:./appointly.db";
  return raw.replace(/^file:/, "");
}

function createDb(): AppDb {
  const sqlite = new Database(resolveDbPath());
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  attachHaversine(sqlite);
  globalThis.__appointly_sqlite = sqlite;
  return drizzle(sqlite, { schema });
}

export const db: AppDb = globalThis.__appointly_db ?? createDb();
if (process.env.NODE_ENV !== "production") {
  globalThis.__appointly_db = db;
}

// Expose the raw sqlite connection for places that need to run prepared
// statements with the UDF (search route).
export function rawSqlite(): Database.Database {
  if (!globalThis.__appointly_sqlite) {
    // Forces creation of the singleton if a route imports rawSqlite first.
    void db;
  }
  return globalThis.__appointly_sqlite!;
}

export { schema };
