/**
 * Seed Appointly's local SQLite DB with synthetic-but-realistic
 * primary-care providers in the Kansas City metro (MO + KS sides of the MSA).
 *
 * IMPORTANT: all NPIs in this file are synthetic — they begin with "9",
 * which is outside the range CMS issues to real providers (real NPIs
 * start with "1" or "2"). Phone numbers use the 555-01xx reserved
 * fictional range. Addresses are real street addresses of KC-area
 * medical buildings (Truman/University Health, KU Med, Children's Mercy,
 * Swope Health, Samuel U. Rodgers, KC CARE, and a handful of suburban
 * anchors); the providers themselves are not real.
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

// --- KC-metro address pool (real medical-building streets) ----------------
// Spans Jackson, Clay, Cass MO counties and Johnson, Wyandotte KS counties —
// the inner-core + close-suburb subset of the 14-county KC MSA.
type Addr = { line1: string; city: string; state: string; zip: string; lat: number; lng: number };
const KC_METRO: Addr[] = [
  // MO side — Hospital Hill / urban core
  { line1: "2301 Holmes St",          city: "Kansas City", state: "MO", zip: "64108", lat: 39.0859, lng: -94.5747 },
  { line1: "2401 Gillham Rd",         city: "Kansas City", state: "MO", zip: "64108", lat: 39.0866, lng: -94.5793 },
  { line1: "3801 Blue Pkwy",          city: "Kansas City", state: "MO", zip: "64130", lat: 39.0331, lng: -94.5316 },
  { line1: "825 Euclid Ave",          city: "Kansas City", state: "MO", zip: "64124", lat: 39.1083, lng: -94.5527 },
  { line1: "3515 Broadway Blvd",      city: "Kansas City", state: "MO", zip: "64111", lat: 39.0628, lng: -94.5894 },
  { line1: "4401 Wornall Rd",         city: "Kansas City", state: "MO", zip: "64111", lat: 39.0432, lng: -94.5910 },
  { line1: "2316 E Meyer Blvd",       city: "Kansas City", state: "MO", zip: "64132", lat: 39.0214, lng: -94.5650 },
  // MO side — suburbs
  { line1: "7900 Lee's Summit Rd",    city: "Kansas City", state: "MO", zip: "64139", lat: 39.0136, lng: -94.4138 },
  { line1: "19600 E 39th St S",       city: "Independence", state: "MO", zip: "64057", lat: 39.0589, lng: -94.3650 },
  { line1: "17065 S 71 Hwy",          city: "Belton",      state: "MO", zip: "64012", lat: 38.8265, lng: -94.5246 },
  { line1: "2525 Glenn Hendren Dr",   city: "Liberty",     state: "MO", zip: "64068", lat: 39.2350, lng: -94.4181 },
  // KS side — Wyandotte / Johnson
  { line1: "4000 Cambridge St",       city: "Kansas City", state: "KS", zip: "66160", lat: 39.0570, lng: -94.6080 },
  { line1: "3901 Rainbow Blvd",       city: "Kansas City", state: "KS", zip: "66160", lat: 39.0555, lng: -94.6094 },
  { line1: "5808 W 110th St",         city: "Overland Park", state: "KS", zip: "66211", lat: 38.9272, lng: -94.6792 },
  { line1: "9100 W 74th St",          city: "Shawnee Mission", state: "KS", zip: "66204", lat: 38.9871, lng: -94.6896 },
  { line1: "20333 W 151st St",        city: "Olathe",      state: "KS", zip: "66061", lat: 38.8814, lng: -94.7977 },
];

// KC has notable Vietnamese, Somali, and Bosnian populations alongside
// Spanish-speaking communities — language mix reflects that.
const KC_LANGUAGES: string[][] = [
  ["en"],
  ["en"],
  ["en", "es"],
  ["en", "es"],
  ["en", "vi"],
  ["en", "so"],
  ["en", "bs"],
];

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
  { name: "kc_metro", addrs: KC_METRO, langPool: KC_LANGUAGES },
];

const PROVIDER_COUNT = 50;
const now = new Date();

const providerRows: Array<typeof schema.providers.$inferInsert> = [];
const locationRows: Array<typeof schema.providerLocations.$inferInsert> = [];
const reportRows: Array<typeof schema.acceptingStatusReports.$inferInsert> = [];

for (const metro of METROS) {
  for (let i = 0; i < PROVIDER_COUNT; i++) {
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

// --- Clinic seed (real KC-area FQHCs + sliding-scale safety-net sites) ----
// Real facility names and addresses for HRSA-funded Federally Qualified
// Health Centers and one large non-FQHC safety-net hospital (University
// Health). All operate on a sliding fee scale. Phone numbers use the
// 555-01xx fictional range because this is demo data — real phone numbers
// arrive when `npm run etl:hrsa` is run against the live HRSA CSV.
const clinicRows: Array<typeof schema.clinics.$inferInsert> = [
  {
    hrsaSiteId: "seed:swope-central",
    name: "Swope Health Central",
    addressLine1: "3801 Blue Pkwy",
    city: "Kansas City", state: "MO", zip: "64130",
    phone: "(555) 0150-0010",
    servicesOffered: JSON.stringify(["primary_care", "dental", "behavioral", "prenatal"]),
    isFqhc: true, isLookAlike: false, slidingFeeScale: true,
    lat: 39.0331, lng: -94.5316,
  },
  {
    hrsaSiteId: "seed:kc-care-midtown",
    name: "KC CARE Health Center — Midtown",
    addressLine1: "3515 Broadway Blvd",
    city: "Kansas City", state: "MO", zip: "64111",
    phone: "(555) 0150-0020",
    servicesOffered: JSON.stringify(["primary_care", "behavioral", "pharmacy"]),
    isFqhc: true, isLookAlike: false, slidingFeeScale: true,
    lat: 39.0628, lng: -94.5894,
  },
  {
    hrsaSiteId: "seed:rodgers-euclid",
    name: "Samuel U. Rodgers Health Center",
    addressLine1: "825 Euclid Ave",
    city: "Kansas City", state: "MO", zip: "64124",
    phone: "(555) 0150-0030",
    servicesOffered: JSON.stringify(["primary_care", "dental", "behavioral", "prenatal", "pharmacy"]),
    isFqhc: true, isLookAlike: false, slidingFeeScale: true,
    lat: 39.1083, lng: -94.5527,
  },
  {
    hrsaSiteId: "seed:university-health-truman",
    name: "University Health Truman Medical Center",
    addressLine1: "2301 Holmes St",
    city: "Kansas City", state: "MO", zip: "64108",
    phone: "(555) 0150-0040",
    servicesOffered: JSON.stringify(["primary_care", "behavioral", "pharmacy"]),
    // Truman/University Health is a public hospital district, not an HRSA
    // grantee — flag is_fqhc=false but it does run a sliding fee scale.
    isFqhc: false, isLookAlike: false, slidingFeeScale: true,
    lat: 39.0859, lng: -94.5747,
  },
  {
    hrsaSiteId: "seed:vibrant-wyandotte",
    name: "Vibrant Health — Argentine",
    addressLine1: "1428 S 32nd St",
    city: "Kansas City", state: "KS", zip: "66106",
    phone: "(555) 0150-0050",
    servicesOffered: JSON.stringify(["primary_care", "dental", "behavioral"]),
    isFqhc: true, isLookAlike: false, slidingFeeScale: true,
    lat: 39.0867, lng: -94.6760,
  },
  {
    hrsaSiteId: "seed:health-partnership-olathe",
    name: "Health Partnership Clinic",
    addressLine1: "407 S Clairborne Rd",
    city: "Olathe", state: "KS", zip: "66062",
    phone: "(555) 0150-0060",
    servicesOffered: JSON.stringify(["primary_care", "dental", "behavioral"]),
    isFqhc: true, isLookAlike: false, slidingFeeScale: true,
    lat: 38.8634, lng: -94.7745,
  },
  {
    hrsaSiteId: "seed:southwest-blvd",
    name: "Southwest Boulevard Family Health Care",
    addressLine1: "340 S 17th St",
    city: "Kansas City", state: "KS", zip: "66102",
    phone: "(555) 0150-0070",
    servicesOffered: JSON.stringify(["primary_care", "behavioral", "prenatal"]),
    isFqhc: true, isLookAlike: false, slidingFeeScale: true,
    lat: 39.1167, lng: -94.6555,
  },
];

// --- Wipe + insert ---------------------------------------------------------
console.log(`Seeding ${providerRows.length} providers and ${clinicRows.length} clinics across the Kansas City metro...`);
db.run(sql`DELETE FROM accepting_status_reports`);
db.run(sql`DELETE FROM provider_locations`);
db.run(sql`DELETE FROM providers`);
db.run(sql`DELETE FROM clinics`);

db.insert(schema.providers).values(providerRows).run();
db.insert(schema.providerLocations).values(locationRows).run();
if (reportRows.length) {
  db.insert(schema.acceptingStatusReports).values(reportRows).run();
}
db.insert(schema.clinics).values(clinicRows).run();

console.log(`Done. ${providerRows.length} providers, ${locationRows.length} locations, ${reportRows.length} status reports, ${clinicRows.length} clinics.`);
