/**
 * Seed Appointly's local SQLite DB with synthetic-but-realistic
 * primary-care providers in Austin, Atlanta, and Chicago.
 *
 * IMPORTANT: all NPIs in this file are synthetic — they begin with "9",
 * which is outside the range CMS issues to real providers (real NPIs
 * start with "1" or "2"). Phone numbers use the 555-01xx reserved
 * fictional range. Addresses are real street addresses of medical
 * buildings; the providers themselves are not real.
 *
 * Run:  npm run db:seed   (after db:migrate)
 */
import { db, schema } from "../src/db";
import { sql } from "drizzle-orm";

// --- Deterministic PRNG so reseeds are stable ------------------------------
function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

// --- Name pools ------------------------------------------------------------
const FIRST_NAMES = [
  "Aaliyah", "Andre", "Maya", "Jamal", "Sofia", "Marcus", "Priya", "Diego",
  "Naomi", "Kenji", "Imani", "Liam", "Zoe", "Hassan", "Elena", "Tomás",
  "Aisha", "Lucas", "Ava", "Daniel", "Mei", "Carlos", "Jordan", "Leah",
  "Tariq", "Olivia", "Amari", "Yara",
];
const LAST_NAMES = [
  "Patel", "Nguyen", "Garcia", "Okafor", "Rodriguez", "Chen", "Martinez",
  "Singh", "Williams", "Hernandez", "Khan", "Kim", "Thompson", "Brooks",
  "Adeyemi", "Davis", "Sandoval", "Choi", "Reyes", "Brown",
];

// --- Taxonomies ------------------------------------------------------------
const TAXONOMIES = [
  { code: "207Q00000X", desc: "Family Medicine",     group: "family_medicine",   credential: "MD" },
  { code: "207R00000X", desc: "Internal Medicine",   group: "internal_medicine", credential: "MD" },
  { code: "208000000X", desc: "Pediatrics",          group: "pediatrics",        credential: "MD" },
  { code: "363LF0000X", desc: "Family NP",           group: "primary_care",      credential: "NP" },
  { code: "363LP2300X", desc: "Primary Care NP",     group: "primary_care",      credential: "NP" },
] as const;

// --- Address pools per metro (real medical-building streets) --------------
type Addr = { line1: string; city: string; state: string; zip: string; lat: number; lng: number };
const AUSTIN: Addr[] = [
  { line1: "1313 Red River St", city: "Austin", state: "TX", zip: "78701", lat: 30.2740, lng: -97.7350 },
  { line1: "601 E 15th St",      city: "Austin", state: "TX", zip: "78701", lat: 30.2774, lng: -97.7380 },
  { line1: "2911 Medical Arts St", city: "Austin", state: "TX", zip: "78705", lat: 30.2934, lng: -97.7344 },
  { line1: "3833 S 1st St",      city: "Austin", state: "TX", zip: "78704", lat: 30.2249, lng: -97.7665 },
  { line1: "5625 Eiers Rd",      city: "Austin", state: "TX", zip: "78745", lat: 30.2070, lng: -97.8025 },
  { line1: "12221 N Mopac Expy", city: "Austin", state: "TX", zip: "78758", lat: 30.4144, lng: -97.7032 },
  { line1: "11645 Angus Rd",     city: "Austin", state: "TX", zip: "78759", lat: 30.4112, lng: -97.7551 },
];
const ATLANTA: Addr[] = [
  { line1: "80 Jesse Hill Jr Dr SE",   city: "Atlanta", state: "GA", zip: "30303", lat: 33.7530, lng: -84.3812 },
  { line1: "550 Peachtree St NE",      city: "Atlanta", state: "GA", zip: "30308", lat: 33.7720, lng: -84.3837 },
  { line1: "1968 Peachtree Rd NW",     city: "Atlanta", state: "GA", zip: "30309", lat: 33.7976, lng: -84.3879 },
  { line1: "201 Edgewood Ave SE",      city: "Atlanta", state: "GA", zip: "30303", lat: 33.7540, lng: -84.3829 },
  { line1: "1335 Hardee St NE",        city: "Atlanta", state: "GA", zip: "30307", lat: 33.7693, lng: -84.3358 },
  { line1: "100 Edgewood Ave NE",      city: "Atlanta", state: "GA", zip: "30303", lat: 33.7544, lng: -84.3870 },
  { line1: "1255 Cleveland Ave",       city: "East Point", state: "GA", zip: "30344", lat: 33.6739, lng: -84.4404 },
];
const CHICAGO: Addr[] = [
  { line1: "1740 W Taylor St",         city: "Chicago", state: "IL", zip: "60612", lat: 41.8696, lng: -87.6699 },
  { line1: "251 E Huron St",           city: "Chicago", state: "IL", zip: "60611", lat: 41.8949, lng: -87.6212 },
  { line1: "5841 S Maryland Ave",      city: "Chicago", state: "IL", zip: "60637", lat: 41.7886, lng: -87.6047 },
  { line1: "1900 W Polk St",           city: "Chicago", state: "IL", zip: "60612", lat: 41.8716, lng: -87.6736 },
  { line1: "1407 N Milwaukee Ave",     city: "Chicago", state: "IL", zip: "60622", lat: 41.9081, lng: -87.6790 },
  { line1: "851 W Belmont Ave",        city: "Chicago", state: "IL", zip: "60657", lat: 41.9396, lng: -87.6520 },
  { line1: "836 W Wellington Ave",     city: "Chicago", state: "IL", zip: "60657", lat: 41.9367, lng: -87.6512 },
];

const LANGUAGES_BY_METRO: Record<string, string[][]> = {
  austin:  [["en"], ["en", "es"], ["en", "es"], ["en"], ["en", "vi"]],
  atlanta: [["en"], ["en", "es"], ["en"], ["en", "ko"], ["en", "ht"]],
  chicago: [["en"], ["en", "es"], ["en", "pl"], ["en", "zh"], ["en"]],
};

const STATUS_DISTRIBUTION: Array<{ s: "yes" | "no" | "full" | "unknown"; w: number }> = [
  { s: "yes",     w: 5 },
  { s: "unknown", w: 3 },
  { s: "full",    w: 1 },
  { s: "no",      w: 1 },
];
function pickStatus(): "yes" | "no" | "full" | "unknown" {
  const total = STATUS_DISTRIBUTION.reduce((s, x) => s + x.w, 0);
  let r = rand() * total;
  for (const { s, w } of STATUS_DISTRIBUTION) {
    r -= w;
    if (r <= 0) return s;
  }
  return "unknown";
}

// --- Synthetic NPI generator -----------------------------------------------
// Real NPIs start with 1 or 2. We start with 9 to make these unambiguously
// fake — so nobody calls a phone number that maps to a real clinician.
const usedNpi = new Set<string>();
function fakeNpi(): string {
  while (true) {
    let n = "9";
    for (let i = 0; i < 9; i++) n += Math.floor(rand() * 10);
    if (!usedNpi.has(n)) {
      usedNpi.add(n);
      return n;
    }
  }
}
function fakePhone(): string {
  // 555-01xx is the reserved fictional range in NANP.
  const four = String(100 + Math.floor(rand() * 100)).padStart(4, "0");
  return `(555) 01${four.slice(0, 1)}-${four.slice(1)}`;
}

// --- Build records ---------------------------------------------------------
type Metro = { name: string; addrs: Addr[]; langPool: string[][] };
const METROS: Metro[] = [
  { name: "austin",  addrs: AUSTIN,  langPool: LANGUAGES_BY_METRO.austin },
  { name: "atlanta", addrs: ATLANTA, langPool: LANGUAGES_BY_METRO.atlanta },
  { name: "chicago", addrs: CHICAGO, langPool: LANGUAGES_BY_METRO.chicago },
];

const PER_METRO = 17;
const now = new Date();

const providerRows: Array<typeof schema.providers.$inferInsert> = [];
const locationRows: Array<typeof schema.providerLocations.$inferInsert> = [];
const reportRows: Array<typeof schema.acceptingStatusReports.$inferInsert> = [];

for (const metro of METROS) {
  for (let i = 0; i < PER_METRO; i++) {
    const npi = fakeNpi();
    const tax = pick(TAXONOMIES as unknown as typeof TAXONOMIES[number][]);
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const addr = pick(metro.addrs);
    // Jitter lat/lng slightly so multiple providers don't all stack on one pin.
    const jitter = () => (rand() - 0.5) * 0.01;
    const status = pickStatus();
    const reportedAt = new Date(now.getTime() - Math.floor(rand() * 90 * 86400_000));

    providerRows.push({
      npi,
      firstName: first,
      lastName: last,
      organizationName: null,
      credential: tax.credential,
      primaryTaxonomy: `${tax.code} ${tax.desc}`,
      specialtyGroup: tax.group,
      phone: fakePhone(),
      languages: JSON.stringify(pick(metro.langPool)),
      acceptingStatus: status,
      acceptingStatusUpdatedAt: status === "unknown" ? null : reportedAt,
      acceptingStatusSource: status === "unknown" ? null : "self_attested",
      loadedAt: now,
    });
    locationRows.push({
      npi,
      addressLine1: addr.line1,
      addressLine2: null,
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      lat: addr.lat + jitter(),
      lng: addr.lng + jitter(),
      isPrimary: true,
    });
    if (status !== "unknown") {
      reportRows.push({
        npi,
        status,
        source: "self_attested",
        sourceDetail: "seed",
        reportedAt,
      });
    }
  }
}

// --- Wipe + insert ---------------------------------------------------------
console.log(`Seeding ${providerRows.length} providers across ${METROS.length} metros...`);
db.run(sql`DELETE FROM accepting_status_reports`);
db.run(sql`DELETE FROM provider_locations`);
db.run(sql`DELETE FROM providers`);

db.insert(schema.providers).values(providerRows).run();
db.insert(schema.providerLocations).values(locationRows).run();
if (reportRows.length) {
  db.insert(schema.acceptingStatusReports).values(reportRows).run();
}

console.log(`Done. ${providerRows.length} providers, ${locationRows.length} locations, ${reportRows.length} status reports.`);
