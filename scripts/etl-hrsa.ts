/**
 * HRSA Health Center Service Delivery Sites ETL.
 *
 * Loads federally-supported Federally Qualified Health Centers (FQHCs) and
 * FQHC look-alikes into the `clinics` table. All HRSA-funded sites are
 * required by statute to operate on a sliding fee scale, which is why this
 * dataset is the right source for Appointly's "Sliding-Scale Clinics" finder.
 *
 * The dataset is published quarterly by HRSA at:
 *   https://data.hrsa.gov/data/download
 * Look for "Health Center Service Delivery and Look-Alike Sites" — a CSV
 * that includes name, address, lat/lng (already geocoded!), site type, and
 * service flags. Unlike NPPES, you do NOT need a Mapbox token for this ETL.
 *
 * USAGE
 *   # download the CSV manually, then:
 *   npm run etl:hrsa -- --file ./hrsa-sites.csv
 *
 *   # restrict to the KC MSA via the ZIP allowlist (recommended)
 *   npm run etl:hrsa -- --file ./hrsa-sites.csv --zip-allowlist data/kc-metro-zips.json
 *
 *   # restrict to one state
 *   npm run etl:hrsa -- --file ./hrsa-sites.csv --state MO
 *
 *   # dry run — count rows that would be inserted, do not write
 *   npm run etl:hrsa -- --file ./hrsa-sites.csv --zip-allowlist data/kc-metro-zips.json --dry-run
 *
 * NOTES
 *   - HRSA column names drift slightly between quarterly releases. The
 *     resolveColumn() helper does a case-insensitive substring match
 *     against the header row so a small rename doesn't break the script.
 *   - lat/lng come from the HRSA file directly. Rows missing coordinates
 *     are skipped (and counted in skippedNoGeo).
 */
// Load .env before any other import — required because src/db reads
// process.env.DATABASE_URL at import time. tsx invocations don't auto-load
// .env the way Next.js does.
import "dotenv/config";

import { createReadStream, existsSync, readFileSync } from "fs";
import { createInterface } from "readline";
import { db, schema, pgPool } from "../src/db";

// ----------------------- arg parsing --------------------------------------
type Args = {
  file?: string;
  download: boolean;
  state?: string;
  zipAllowlist?: string;
  limit?: number;
  dryRun: boolean;
};
function parseArgs(): Args {
  const out: Args = { download: false, dryRun: false };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === "--file") out.file = a[++i];
    else if (k === "--download") out.download = true;
    else if (k === "--state") out.state = a[++i]?.toUpperCase();
    else if (k === "--zip-allowlist") out.zipAllowlist = a[++i];
    else if (k === "--limit") out.limit = Number(a[++i]);
    else if (k === "--dry-run") out.dryRun = true;
  }
  return out;
}

function loadZipAllowlist(filePath: string): Set<string> {
  if (!existsSync(filePath)) {
    console.error(`ZIP allowlist file not found: ${filePath}`);
    process.exit(1);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error(`Failed to parse ZIP allowlist JSON at ${filePath}: ${(e as Error).message}`);
    process.exit(1);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    console.error(`ZIP allowlist must be a JSON object keyed by ZIP code: ${filePath}`);
    process.exit(1);
  }
  const zips = Object.keys(raw).filter((k) => !k.startsWith("_") && /^\d{5}$/.test(k));
  if (!zips.length) {
    console.error(`ZIP allowlist contains zero valid 5-digit ZIP keys: ${filePath}`);
    process.exit(1);
  }
  return new Set(zips);
}

// ----------------------- CSV parsing (RFC4180-ish) -------------------------
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') inQuotes = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// HRSA column names drift across quarterly releases ("Site Address" vs
// "Site Street Address", "Latitude" vs "Geocoded Latitude", etc.). Resolve
// each logical column by trying a list of candidates against the header.
function resolveColumn(header: string[], candidates: string[]): number {
  const lower = header.map((h) => h.toLowerCase().trim());
  for (const cand of candidates) {
    const idx = lower.findIndex((h) => h === cand.toLowerCase());
    if (idx !== -1) return idx;
  }
  // Fall back to substring match (in candidate-priority order).
  for (const cand of candidates) {
    const idx = lower.findIndex((h) => h.includes(cand.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

// HRSA service flags are typically "Y" / "N" boolean columns named e.g.
// "Health Center Service Delivery Site Has Dental Service Indicator".
// We translate the Y-flagged ones to a JSON array.
const SERVICE_FLAGS: Array<{ label: string; col: string }> = [
  { label: "primary_care", col: "Primary Medical Care" },
  { label: "dental",       col: "Dental" },
  { label: "behavioral",   col: "Mental Health" },
  { label: "substance_use",col: "Substance Use" },
  { label: "vision",       col: "Vision" },
  { label: "pharmacy",     col: "Pharmacy" },
  { label: "prenatal",     col: "Prenatal" },
];

async function main() {
  const args = parseArgs();

  if (!args.file && !args.download) {
    console.error(
      "Provide --file <path> or --download.\n" +
      "Download manually from: https://data.hrsa.gov/data/download",
    );
    process.exit(1);
  }
  if (args.download) {
    console.error(
      "Auto-download isn't implemented (HRSA's URLs change with each quarterly\n" +
      "release). Please:\n" +
      "  1. Open https://data.hrsa.gov/data/download\n" +
      "  2. Download 'Health Center Service Delivery and Look-Alike Sites' CSV\n" +
      "  3. Re-run with --file path/to/your-file.csv --zip-allowlist data/kc-metro-zips.json",
    );
    process.exit(1);
  }

  const file = args.file!;
  if (!existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const zipAllowlist = args.zipAllowlist ? loadZipAllowlist(args.zipAllowlist) : null;

  console.log(
    `Reading ${file}` +
    (args.state ? ` (state=${args.state})` : "") +
    (zipAllowlist ? ` (zip-allowlist=${args.zipAllowlist}, ${zipAllowlist.size} ZIPs)` : "") +
    (args.dryRun ? " [DRY RUN]" : ""),
  );

  const stream = createReadStream(file, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let header: string[] | null = null;
  let cIdx: Record<string, number> = {};
  let read = 0, matched = 0, inserted = 0, skippedNoGeo = 0, skippedNotInAllowlist = 0;
  const now = new Date();

  const batch: Array<typeof schema.clinics.$inferInsert> = [];

  async function flush() {
    if (!batch.length) return;
    if (!args.dryRun) {
      // Dedupe by site ID inside a batch — Postgres rejects ON CONFLICT
      // DO UPDATE if the same conflict target appears twice in one statement.
      const seen = new Map<string, typeof batch[number]>();
      for (const row of batch) {
        if (row.hrsaSiteId) seen.set(row.hrsaSiteId, row);
      }
      const deduped = [...seen.values()];
      try {
        // sql.raw a column-list excluded-update so we don't have to repeat
        // every column name — but Drizzle's API requires an explicit set.
        // Two round trips per flush is fine; HRSA only has ~85 KC rows total.
        for (const row of deduped) {
          await db.insert(schema.clinics).values(row).onConflictDoUpdate({
            target: schema.clinics.hrsaSiteId,
            set: {
              name: row.name,
              addressLine1: row.addressLine1,
              city: row.city,
              state: row.state,
              zip: row.zip,
              phone: row.phone,
              lat: row.lat,
              lng: row.lng,
              servicesOffered: row.servicesOffered,
              isFqhc: row.isFqhc,
              isLookAlike: row.isLookAlike,
              slidingFeeScale: row.slidingFeeScale,
            },
          });
        }
      } catch (e) {
        console.warn(`Clinic batch insert failed: ${(e as Error).message}`);
      }
    }
    inserted += batch.length;
    batch.length = 0;
    if (inserted % 200 === 0) {
      console.log(`  ...inserted ${inserted} (read ${read}, matched ${matched}, skipped-no-geo ${skippedNoGeo}, skipped-not-in-allowlist ${skippedNotInAllowlist})`);
    }
  }

  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line).map((s) => s.replace(/^"|"$/g, ""));
      cIdx = {
        // Site-level unique key. "BPHC Assigned Number" (BPS-H80-* values) is
        // the only field in this release that's truly unique per delivery
        // site. Beware: "Health Center Location Identification Number" sounds
        // right but is a per-grantee enum (1, 2, 3...) that collides across
        // grantees; "BHCMIS Organization Identification Number" is the
        // grantee, not the site. Both would cause silent upsert collisions.
        siteId:  resolveColumn(header, [
          "BPHC Assigned Number",
          "Site ID",
          "Health Center Site ID",
        ]),
        name:    resolveColumn(header, ["Site Name", "Health Center Site Name"]),
        addr:    resolveColumn(header, ["Site Address", "Site Street Address", "Health Center Site Address"]),
        city:    resolveColumn(header, ["Site City", "Health Center Site City"]),
        state:   resolveColumn(header, ["Site State Abbreviation", "Site State", "State"]),
        zip:     resolveColumn(header, ["Site Postal Code", "Site ZIP Code", "ZIP"]),
        phone:   resolveColumn(header, ["Site Telephone Number", "Telephone"]),
        siteType:resolveColumn(header, ["Health Center Type", "Site Type", "Site Status"]),
        lat:     resolveColumn(header, ["Geocoding Artifact Address Primary Y Coordinate", "Latitude"]),
        lng:     resolveColumn(header, ["Geocoding Artifact Address Primary X Coordinate", "Longitude"]),
      };
      for (const flag of SERVICE_FLAGS) {
        cIdx[`service_${flag.label}`] = resolveColumn(header, [flag.col]);
      }
      for (const required of ["name", "addr", "state", "zip"] as const) {
        if (cIdx[required] === -1) {
          console.error(`HRSA CSV is missing expected column for: ${required}`);
          console.error(`Header row was:\n  ${header.slice(0, 20).join(", ")}${header.length > 20 ? "..." : ""}`);
          process.exit(2);
        }
      }
      continue;
    }
    read++;
    if (args.limit && matched >= args.limit) break;

    const cols = parseCsvLine(line);
    const get = (key: string): string => {
      const i = cIdx[key];
      return i >= 0 ? (cols[i] ?? "").trim() : "";
    };

    const state = get("state").toUpperCase();
    if (args.state && state !== args.state) continue;

    const zipRaw = get("zip");
    const zip = zipRaw.length >= 5 ? zipRaw.slice(0, 5) : zipRaw;
    if (zipAllowlist && !zipAllowlist.has(zip)) {
      skippedNotInAllowlist++;
      continue;
    }

    matched++;

    const latStr = get("lat");
    const lngStr = get("lng");
    const lat = latStr ? Number(latStr) : NaN;
    const lng = lngStr ? Number(lngStr) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      skippedNoGeo++;
      continue;
    }

    const siteType = get("siteType").toLowerCase();
    const isLookAlike = /look[- ]?alike/.test(siteType);
    // HRSA grantees are FQHCs; look-alikes are a separate (smaller) category.
    const isFqhc = !isLookAlike;

    const services: string[] = [];
    for (const flag of SERVICE_FLAGS) {
      const v = get(`service_${flag.label}`).toUpperCase();
      if (v === "Y" || v === "YES" || v === "TRUE" || v === "1") services.push(flag.label);
    }

    const siteIdRaw = get("siteId");
    // hrsaSiteId is uniquely constrained — if the file has no ID column we
    // fall back to a deterministic synthetic key based on name+address.
    const hrsaSiteId = siteIdRaw || `synthetic:${get("name")}|${get("addr")}|${zip}`;

    batch.push({
      hrsaSiteId,
      name: get("name"),
      addressLine1: get("addr") || null,
      city: get("city") || null,
      state: state || null,
      zip: zip || null,
      phone: get("phone") || null,
      servicesOffered: services.length ? JSON.stringify(services) : null,
      isFqhc,
      isLookAlike,
      slidingFeeScale: true,
      lat,
      lng,
    });
    if (batch.length >= 100) await flush();
  }
  await flush();

  console.log(
    `\nDone. Read ${read} rows, matched ${matched}, inserted ${inserted}, ` +
    `skipped (no geo) ${skippedNoGeo}` +
    (zipAllowlist ? `, skipped (not in allowlist) ${skippedNotInAllowlist}` : "") +
    `. Loaded at ${now.toISOString()}.`,
  );
  if (args.dryRun) console.log("(dry run — no rows written)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pgPool().end());
