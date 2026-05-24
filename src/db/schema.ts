import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * Providers — one row per NPI.
 * Sourced from NPPES (CMS National Plan and Provider Enumeration System).
 * `accepting_status` is denormalized for fast filtering; it's the latest
 * value from accepting_status_reports, updated on each verification.
 */
export const providers = sqliteTable(
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
    acceptingStatusUpdatedAt: integer("accepting_status_updated_at", { mode: "timestamp" }),
    acceptingStatusSource: text("accepting_status_source"), // "user_report" | "payer_feed" | "self_attested"
    loadedAt: integer("loaded_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    specialtyIdx: index("providers_specialty_idx").on(t.specialtyGroup),
  }),
);

/**
 * One provider can have multiple practice locations.
 * lat/lng stored as REAL; we hand-roll a Haversine UDF in JS for distance.
 */
export const providerLocations = sqliteTable(
  "provider_locations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    npi: text("npi")
      .notNull()
      .references(() => providers.npi, { onDelete: "cascade" }),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    lat: real("lat"),
    lng: real("lng"),
    isPrimary: integer("is_primary", { mode: "boolean" }).default(false),
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
export const acceptingStatusReports = sqliteTable(
  "accepting_status_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    npi: text("npi")
      .notNull()
      .references(() => providers.npi, { onDelete: "cascade" }),
    status: text("status").notNull(), // "yes" | "no" | "full" | "unknown"
    source: text("source").notNull(), // "user_report" | "payer_feed" | "self_attested"
    sourceDetail: text("source_detail"), // hashed IP, payer name, etc.
    reportedAt: integer("reported_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    npiIdx: index("asr_npi_reported_at_idx").on(t.npi, t.reportedAt),
  }),
);

/**
 * HRSA Health Center Service Delivery Sites — FQHCs and look-alikes.
 * Refreshed quarterly. All rows are sliding-scale by federal requirement.
 */
export const clinics = sqliteTable(
  "clinics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    hrsaSiteId: text("hrsa_site_id").unique(),
    name: text("name").notNull(),
    addressLine1: text("address_line1"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    phone: text("phone"),
    servicesOffered: text("services_offered"), // JSON array
    isFqhc: integer("is_fqhc", { mode: "boolean" }).default(false),
    isLookAlike: integer("is_look_alike", { mode: "boolean" }).default(false),
    slidingFeeScale: integer("sliding_fee_scale", { mode: "boolean" }).default(true),
    lat: real("lat"),
    lng: real("lng"),
  },
  (t) => ({
    geoIdx: index("clinics_geo_idx").on(t.lat, t.lng),
  }),
);

export type Provider = typeof providers.$inferSelect;
export type ProviderLocation = typeof providerLocations.$inferSelect;
export type AcceptingStatusReport = typeof acceptingStatusReports.$inferSelect;
export type Clinic = typeof clinics.$inferSelect;
