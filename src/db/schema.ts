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
 *
 * `intakeEmail` is curated by hand from clinic websites — HRSA's dataset
 * doesn't publish per-site intake addresses. When null, the appointment-
 * request feature degrades to "call directly" with the phone number.
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
    intakeEmail: text("intake_email"),
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

/**
 * Appointment request — patient-submitted intake form bundled and emailed
 * to one or more clinics. HIPAA architecture: PHI columns are populated
 * at submit, then NULLed by a scheduled cleanup 24h after delivery.
 *
 * Long-term columns (retained forever, no PHI):
 *   id, phone_hash, channel, submitted_at, delivered_at, phi_deleted_at, status
 *
 * Transient PHI (set NULL by the 24h cleanup):
 *   first_name, last_name, dob, phone, email, reason_*, insurance_*,
 *   preferred_times, language, consent_*
 *
 * Why this shape: per-clinic delivery rows live in appointment_request_recipients
 * — so we can track each clinic's status independently when multi-clinic is on,
 * without duplicating the patient payload.
 */
export const appointmentRequests = pgTable(
  "appointment_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    // Retained long-term (no PHI):
    phoneHash: text("phone_hash").notNull(), // sha256(phone + salt)
    channel: text("channel").notNull().default("email"), // "email" in v1
    status: text("status").notNull().default("pending"), // pending | sent | partial_failure | failed
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    phiDeletedAt: timestamp("phi_deleted_at", { withTimezone: true }),
    // Transient PHI (cleared by scheduled cleanup 24h after deliveredAt):
    firstName: text("first_name"),
    lastName: text("last_name"),
    dob: text("dob"), // ISO YYYY-MM-DD; text avoids tz games
    phone: text("phone"), // E.164 form
    email: text("email"),
    reasonCategory: text("reason_category"), // new_patient | annual | specific | followup | other
    reasonDetail: text("reason_detail"), // free text, only set when category in (specific, other)
    insuranceSituation: text("insurance_situation"), // uninsured | medicaid | medicare | commercial | unknown
    preferredTimes: text("preferred_times"), // JSON string array
    language: text("language"), // ISO code, e.g. "en"
    consentVersion: text("consent_version"), // version of consent text the patient accepted
    consentAcceptedAt: timestamp("consent_accepted_at", { withTimezone: true }),
  },
  (t) => ({
    phoneHashIdx: index("ar_phone_hash_idx").on(t.phoneHash, t.submittedAt),
    statusIdx: index("ar_status_idx").on(t.status, t.deliveredAt),
  }),
);

/**
 * Per-clinic delivery row. One appointment_request → 1..3 recipient rows.
 * Retained forever — clinic_id + status + timestamps are not PHI.
 */
export const appointmentRequestRecipients = pgTable(
  "appointment_request_recipients",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => appointmentRequests.id, { onDelete: "cascade" }),
    clinicId: integer("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    intakeEmail: text("intake_email"), // snapshot of clinic's email at send time
    status: text("status").notNull().default("pending"), // pending | sent | delivered | failed
    providerMessageId: text("provider_message_id"), // Resend's message id, for tracebacks
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (t) => ({
    requestIdx: index("arr_request_idx").on(t.requestId),
    clinicIdx: index("arr_clinic_idx").on(t.clinicId, t.sentAt),
  }),
);

export type Provider = typeof providers.$inferSelect;
export type ProviderLocation = typeof providerLocations.$inferSelect;
export type AcceptingStatusReport = typeof acceptingStatusReports.$inferSelect;
export type Clinic = typeof clinics.$inferSelect;
export type AppointmentRequest = typeof appointmentRequests.$inferSelect;
export type AppointmentRequestRecipient = typeof appointmentRequestRecipients.$inferSelect;

// Note about `integer`: imported so future migrations can use it without
// re-importing; keeps the drizzle generator's diff clean.
export { integer };
