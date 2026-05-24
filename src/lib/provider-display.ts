/**
 * Display helpers for individual providers.
 *
 * Two things this fixes for the UI:
 *  - `primary_taxonomy` from NPPES looks like "207Q00000X Family Medicine".
 *    The leading code is ugly; `cleanSpecialty()` strips it.
 *  - Individual providers don't carry a "hospital name" field. We match the
 *    practice address against a small hand-curated map of well-known KC
 *    medical buildings so we can label the card with "Children's Mercy",
 *    "Saint Luke's", etc. Falls back to NULL for unknown addresses.
 */

/**
 * NPPES Healthcare Provider Taxonomy Code Set — minimal map for the
 * primary-care codes Appointly's ETLs filter on. Source:
 *   https://taxonomy.nucc.org/  (NUCC publishes the canonical mapping)
 * Keys are the 10-char codes. Values are the human-readable label.
 *
 * Extend as we surface more specialties.
 */
const TAXONOMY_LABELS: Record<string, string> = {
  // Allopathic & Osteopathic Physicians
  "207Q00000X": "Family Medicine",
  "207QA0000X": "Family Medicine — Adolescent Medicine",
  "207QA0505X": "Family Medicine — Adult Medicine",
  "207QG0300X": "Family Medicine — Geriatric Medicine",
  "207R00000X": "Internal Medicine",
  "207RA0000X": "Internal Medicine — Adolescent Medicine",
  "207RG0300X": "Internal Medicine — Geriatric Medicine",
  "208000000X": "Pediatrics",
  "208D00000X": "General Practice",
  // Nurse Practitioner / Clinical Nurse Specialist
  "363LF0000X": "Family Nurse Practitioner",
  "363LP2300X": "Primary Care Nurse Practitioner",
  "363LA2200X": "Adult Health Nurse Practitioner",
  "363LP0200X": "Pediatric Nurse Practitioner",
  "364SF0001X": "Clinical Nurse Specialist — Family Health",
  // Physician Assistant
  "363A00000X": "Physician Assistant",
  "363AM0700X": "Physician Assistant — Medical",
  "363AS0400X": "Physician Assistant — Surgical",
};

/**
 * Turn a raw NPPES `primary_taxonomy` field into a display string.
 *   "207Q00000X"                  →  "Family Medicine"     (looked up)
 *   "207Q00000X Family Medicine"  →  "Family Medicine"     (suffix stripped)
 *   "Family Medicine"             →  "Family Medicine"     (no-op)
 *   "999ZZZZZZX"                  →  "999ZZZZZZX"          (unknown code — return as-is)
 *   null / ""                     →  null
 */
export function cleanSpecialty(taxonomy: string | null | undefined): string | null {
  if (!taxonomy) return null;
  const trimmed = taxonomy.trim();

  // Format A: "{10-char code} {description}" — strip the prefix.
  const withSuffix = trimmed.match(/^([0-9A-Z]{9}X)\s+(.+)$/);
  if (withSuffix) return withSuffix[2].trim() || null;

  // Format B: pure 10-char taxonomy code — look up in our label map.
  if (/^[0-9A-Z]{9}X$/.test(trimmed)) {
    return TAXONOMY_LABELS[trimmed] ?? trimmed;
  }

  // Anything else (already-human label, weird input) — pass through.
  return trimmed || null;
}

/**
 * Best-effort map from a KC-area practice address line 1 to the recognizable
 * name of the facility at that address. Hand-curated. Extend as you discover
 * other anchor addresses in your data — `SELECT address_line1, count(*) FROM
 * provider_locations GROUP BY 1 ORDER BY 2 DESC LIMIT 50` will surface the
 * most common addresses to add here.
 */
const KC_PRACTICE_BY_ADDRESS: Record<string, string> = {
  // MO — urban core
  "2301 holmes st":               "University Health Truman Medical Center",
  "2401 gillham rd":              "Children's Mercy Kansas City",
  "2410 gillham rd":              "Children's Mercy Kansas City",
  "4401 wornall rd":              "Saint Luke's Hospital of Kansas City",
  "2316 e meyer blvd":            "Research Medical Center",
  "3801 blue pkwy":               "Swope Health Central",
  "825 euclid ave":               "Samuel U. Rodgers Health Center",
  "3515 broadway blvd":           "KC CARE Health Center",
  "1004 carondelet dr":           "Saint Luke's Hospital — Plaza",
  "5701 troost ave":              "Saint Luke's Hospital — East",
  // MO — suburbs
  "7900 lee's summit rd":         "University Health Lakewood Medical Center",
  "19600 e 39th st s":            "Centerpoint Medical Center",
  "17065 s 71 hwy":               "Belton Regional Medical Center",
  "2525 glenn hendren dr":        "Liberty Hospital",
  "23000 midland dr":             "Lee's Summit Medical Center",
  "2316 e meyer cir":             "Research Medical Center — Brookside",
  // KS — Wyandotte / Johnson
  "4000 cambridge st":            "University of Kansas Hospital",
  "3901 rainbow blvd":            "KU Medical Center",
  "5808 w 110th st":              "Children's Mercy Hospital Kansas",
  "9100 w 74th st":               "AdventHealth Shawnee Mission",
  "20333 w 151st st":             "Olathe Medical Center",
  "5701 w 119th st":              "Menorah Medical Center",
  "8929 parallel pkwy":           "Providence Medical Center",
};

export function lookupKcPractice(addressLine1: string | null | undefined): string | null {
  if (!addressLine1) return null;
  const key = addressLine1.toLowerCase().trim().replace(/\s+/g, " ");
  return KC_PRACTICE_BY_ADDRESS[key] ?? null;
}

/**
 * Format a provider's display name. Mirrors the logic that was inline in
 * find-doctor/page.tsx so the same name appears on the doctor card and on
 * appointment emails.
 */
export function formatProviderName(p: {
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
  credential?: string | null;
}): string {
  if (p.organizationName) return p.organizationName;
  const last = p.lastName ?? "";
  const first = p.firstName ?? "";
  const cred = p.credential ? `, ${p.credential}` : "";
  return `${first} ${last}${cred}`.trim();
}
