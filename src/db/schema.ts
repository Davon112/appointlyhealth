import {
  pgTable,
  text,
  integer,
  bigserial,
  doublePrecision,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Providers — one row per NPI.
 * Sourced from NPPES (CMS National Plan and Provider Enumeration System).
 * `accepting_status` is denormalized for fast filtering; it's the latest
 * value from accepting_status_reports, updated on each verification.
 */
export const providers = pgTable(
  "providers",
  {
    npi: text("npi").primaryKey(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    organizationName: text("organization_name"),
    credential: text("credential"), // "MD", "DO", "NP", "PA"
    primaryTaxonomy: text("primary_taxonomy"), // e.g. "207Q00000X Family Medicine"
    specialtyGroup: text("specialty_group"), // normalized: "primary_care" | "pediatrics" | "internal_medicine" | "family_medicine"
    phone: text("phone"),
    languages: text("languages"), // JSON array stringified
    acceptingStatus: text("accepting_status").notNull().default("unknown"), // "yes" | "no" | "full" | "unknown"
    acceptingStatusUpdatedAt: timestamp("accepting_status_updated_at", { withTimezone: true }),
    acceptingStatusSource: text("accepting_status_source"), // "user_report" | "payer_feed" | "self_attested"
    loadedAt: timestamp("loaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    specialtyIdx: index("providers_specialty_idx").on(t.specialtyGroup),
  }),
);

/**
 * One provider can have multiple practice locations. lat/lng stored as
 * doublePrecision; geo queries bracket-filter on a btree index then
 * sort by haversine_miles() — a PL/pgSQL function we ship as a migration.
 */
export const providerLocations = pgTable(
  "provider_locations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    npi: text("npi")
      .notNull()
      .references(() => providers.npi, { onDelete: "cascade" }),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    isPrimary: boolean("is_primary").default(false),
  },
  (t) => ({
    npiIdx: index("provider_locations_npi_idx").on(t.npi),
    // Bounding-box index — bracket-filter lat/lng before haversine sort.
    geoIdx: index("provider_locations_geo_idx").on(t.lat, t.lng),
  }),
);

/**
 * Crowdsourced + payer-feed verifications of accepting-patients status.
 * Append-only. providers.accepting_status reflects the most recent row.
 */
export const acceptingStatusReports = pgTable(
  "accepting_status_reports",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    npi: text("npi")
      .notNull()
      .references(() => providers.npi, { onDelete: "cascade" }),
    status: text("status").notNull(), // "yes" | "no" | "full" | "unknown"
    source: text("source").notNull(), // "user_report" | "payer_feed" | "self_attested"
    sourceDetail: text("source_detail"), // hashed IP, payer name, etc.
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    npiIdx: index("asr_npi_reported_at_idx").on(t.npi, t.reportedAt),
  }),
);

/**
 * HRSA Health Center Service Delivery Sites — FQHCs and look-alikes.
 * Refreshed quarterly. All rows are sliding-scale by federal requirement.
 */
export const clinics = pgTable(
  "clinics",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    hrsaSiteId: text("hrsa_site_id").unique(),
    name: text("name").notNull(),
    addressLine1: text("address_line1"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    phone: text("phone"),
    servicesOffered: text("services_offered"), // JSON array
    isFqhc: boolean("is_fqhc").default(false),
    isLookAlike: boolean("is_look_alike").default(false),
    slidingFeeScale: boolean("sliding_fee_scale").default(true),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
  },
  (t) => ({
    geoIdx: index("clinics_geo_idx").on(t.lat, t.lng),
  }),
);

export type Provider = typeof providers.$inferSelect;
export type ProviderLocation = typeof providerLocations.$inferSelect;
export type AcceptingStatusReport = typeof acceptingStatusReports.$inferSelect;
export type Clinic = typeof clinics.$inferSelect;

// Note about `integer`: imported so future migrations can use it without
// re-importing; keeps the drizzle generator's diff clean.
export { integer };
