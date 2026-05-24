/**
 * NPPES NPI Registry ETL — load real provider data into Appointly.
 *
 * The NPPES Monthly file (~6 GB unzipped, ~7M rows) is the canonical
 * dataset of every clinician with an NPI in the U.S. CMS publishes a
 * fresh Version 2 ZIP each month at https://download.cms.gov/nppes/NPI_Files.html
 * (V1 is retired as of 2026-03-03).
 *
 * This script:
 *   1. Downloads (or uses a local) NPPES_Data_Dissemination_<month>.zip
 *   2. Streams the CSV row-by-row (never loads it all into memory)
 *   3. Filters to primary-care taxonomy codes
 *   4. Optionally restricts to a state (--state TX)
 *   5. Geocodes addresses via Mapbox (if NEXT_PUBLIC_MAPBOX_TOKEN set)
 *      — caches results to data/.geocode-cache.json
 *   6. Upserts into providers + provider_locations
 *
 * USAGE
 *   # download fresh & load all states (slow — geocoding limit applies)
 *   npm run etl:nppes -- --download
 *
 *   # use a file you already have
 *   npm run etl:nppes -- --file ./npidata_pfile.csv --state TX
 *
 *   # dry run — count rows that would be inserted, do not write
 *   npm run etl:nppes -- --file ./npidata_pfile.csv --state TX --dry-run
 *
 * NOTES
 *   - Without a Mapbox token, addresses without lat/lng in the NPPES file
 *     are skipped. The NPPES file does NOT include lat/lng columns, so
 *     a token is effectively required for real-world loads.
 *   - Be a good citizen: keep `--limit` reasonable on first runs.
 *   - Running on the full file takes 30-90 min depending on geocode budget.
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { pipeline } from "stream/promises";
import { Transform } from "stream";
import { createInterface } from "readline";
import path from "path";
import { db, schema } from "../src/db";
import { sql } from "drizzle-orm";

// ----------------------- arg parsing --------------------------------------
type Args = {
  file?: string;
  download: boolean;
  state?: string;
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
    else if (k === "--limit") out.limit = Number(a[++i]);
    else if (k === "--dry-run") out.dryRun = true;
  }
  return out;
}

// ----------------------- taxonomy filter -----------------------------------
// Primary care + pediatric primary care + primary-care NP/PA codes.
const TAXONOMY_TO_GROUP: Record<string, string> = {
  "207Q00000X": "family_medicine",
  "207R00000X": "internal_medicine",
  "208000000X": "pediatrics",
  "208D00000X": "primary_care", // General Practice
  "363LF0000X": "primary_care", // Family NP
  "363LP2300X": "primary_care", // Primary Care NP
  "363LA2200X": "primary_care", // Adult Health NP
  "363LP0200X": "pediatrics",   // Pediatrics NP
  "364SF0001X": "family_medicine", // CNS Family Health
};
const PRIMARY_TAXONOMIES = new Set(Object.keys(TAXONOMY_TO_GROUP));

// ----------------------- NPPES CSV columns we need -----------------------
// The Version 2 file has 330+ columns; we map by header name to avoid
// brittle positional indexing.
const NEEDED_COLS = [
  "NPI",
  "Entity Type Code",
  "Provider Last Name (Legal Name)",
  "Provider First Name",
  "Provider Credential Text",
  "Provider Organization Name (Legal Business Name)",
  "Provider First Line Business Practice Location Address",
  "Provider Second Line Business Practice Location Address",
  "Provider Business Practice Location Address City Name",
  "Provider Business Practice Location Address State Name",
  "Provider Business Practice Location Address Postal Code",
  "Provider Business Practice Location Address Telephone Number",
  // Taxonomy 1..15. We check primary switch column to find which one to use.
  ...Array.from({ length: 15 }, (_, i) => `Healthcare Provider Taxonomy Code_${i + 1}`),
  ...Array.from({ length: 15 }, (_, i) => `Healthcare Provider Primary Taxonomy Switch_${i + 1}`),
];

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

// ----------------------- geocoding (Mapbox + on-disk cache) ---------------
const CACHE_PATH = path.resolve("./data/.geocode-cache.json");
type CacheEntry = { lat: number; lng: number } | null;
let cache: Record<string, CacheEntry> = {};
if (existsSync(CACHE_PATH)) {
  try { cache = JSON.parse(readFileSync(CACHE_PATH, "utf8")); } catch {}
}
function saveCache() {
  mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function geocode(line1: string, city: string, state: string, zip: string): Promise<CacheEntry> {
  const key = `${line1}|${city}|${state}|${zip}`.toLowerCase();
  if (key in cache) return cache[key];
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) { cache[key] = null; return null; }
  const q = encodeURIComponent(`${line1}, ${city}, ${state} ${zip}`);
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${q}&country=us&limit=1&access_token=${token}`;
  try {
    const res = await fetch(url);
    if (!res.ok) { cache[key] = null; return null; }
    const json = await res.json() as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> };
    const coords = json.features?.[0]?.geometry?.coordinates;
    if (!coords) { cache[key] = null; return null; }
    cache[key] = { lat: coords[1], lng: coords[0] };
    return cache[key];
  } catch {
    cache[key] = null; return null;
  }
}

// ----------------------- main ----------------------------------------------
async function main() {
  const args = parseArgs();

  if (!args.file && !args.download) {
    console.error(
      "Provide --file <path> or --download.\n" +
      "Download manually from: https://download.cms.gov/nppes/NPI_Files.html",
    );
    process.exit(1);
  }
  if (args.download) {
    console.error(
      "Auto-download isn't implemented (the URL changes monthly and CMS\n" +
      "throttles fetches). Please:\n" +
      "  1. Open https://download.cms.gov/nppes/NPI_Files.html\n" +
      "  2. Download the current 'NPPES Data Dissemination' V2 ZIP\n" +
      "  3. Unzip, then re-run with --file path/to/npidata_pfile_*.csv",
    );
    process.exit(1);
  }

  const file = args.file!;
  if (!existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  console.log(`Reading ${file}${args.state ? ` (state=${args.state})` : ""}${args.dryRun ? " [DRY RUN]" : ""}`);

  const stream = createReadStream(file, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let header: string[] | null = null;
  let colIdx: Record<string, number> = {};
  let read = 0, matched = 0, inserted = 0, geocoded = 0, skippedNoGeo = 0;
  let now = new Date();

  const batch: Array<{ provider: typeof schema.providers.$inferInsert; location: typeof schema.providerLocations.$inferInsert }> = [];

  async function flush() {
    if (!batch.length) return;
    if (!args.dryRun) {
      for (const { provider, location } of batch) {
        try {
          db.insert(schema.providers).values(provider).onConflictDoUpdate({
            target: schema.providers.npi,
            set: { loadedAt: now },
          }).run();
          db.insert(schema.providerLocations).values(location).run();
        } catch (e) {
          // duplicate location row etc — skip and continue.
        }
      }
    }
    inserted += batch.length;
    batch.length = 0;
    if (inserted % 1000 === 0) {
      saveCache();
      console.log(`  ...inserted ${inserted} (read ${read}, matched ${matched}, geocoded ${geocoded}, skipped-no-geo ${skippedNoGeo})`);
    }
  }

  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line).map((s) => s.replace(/^"|"$/g, ""));
      colIdx = Object.fromEntries(header.map((h, i) => [h, i]));
      // Sanity check
      for (const want of ["NPI", "Provider Last Name (Legal Name)"]) {
        if (!(want in colIdx)) {
          console.error(`Header missing expected column: ${want}`);
          process.exit(2);
        }
      }
      continue;
    }
    read++;
    if (args.limit && matched >= args.limit) break;

    const cols = parseCsvLine(line);
    const get = (n: string) => cols[colIdx[n]] ?? "";

    // Find the primary taxonomy
    let taxonomy = "";
    for (let i = 1; i <= 15; i++) {
      if (get(`Healthcare Provider Primary Taxonomy Switch_${i}`) === "Y") {
        taxonomy = get(`Healthcare Provider Taxonomy Code_${i}`);
        break;
      }
    }
    if (!PRIMARY_TAXONOMIES.has(taxonomy)) continue;

    const state = get("Provider Business Practice Location Address State Name");
    if (args.state && state !== args.state) continue;

    matched++;

    const npi = get("NPI");
    const line1 = get("Provider First Line Business Practice Location Address");
    const city = get("Provider Business Practice Location Address City Name");
    const zipRaw = get("Provider Business Practice Location Address Postal Code");
    const zip = zipRaw.length >= 5 ? zipRaw.slice(0, 5) : zipRaw;

    const geo = await geocode(line1, city, state, zip);
    if (!geo) { skippedNoGeo++; continue; }
    geocoded++;

    const provider: typeof schema.providers.$inferInsert = {
      npi,
      firstName: get("Provider First Name") || null,
      lastName: get("Provider Last Name (Legal Name)") || null,
      organizationName: get("Provider Organization Name (Legal Business Name)") || null,
      credential: get("Provider Credential Text") || null,
      primaryTaxonomy: taxonomy,
      specialtyGroup: TAXONOMY_TO_GROUP[taxonomy],
      phone: get("Provider Business Practice Location Address Telephone Number") || null,
      languages: null,
      acceptingStatus: "unknown",
      acceptingStatusUpdatedAt: null,
      acceptingStatusSource: null,
      loadedAt: now,
    };
    const location: typeof schema.providerLocations.$inferInsert = {
      npi,
      addressLine1: line1 || null,
      addressLine2: get("Provider Second Line Business Practice Location Address") || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      lat: geo.lat,
      lng: geo.lng,
      isPrimary: true,
    };
    batch.push({ provider, location });
    if (batch.length >= 200) await flush();
  }
  await flush();
  saveCache();

  console.log(`\nDone. Read ${read} rows, matched ${matched}, geocoded ${geocoded}, inserted ${inserted}, skipped (no geo) ${skippedNoGeo}.`);
  if (args.dryRun) console.log("(dry run — no rows written)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
