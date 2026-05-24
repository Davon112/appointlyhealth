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
 * name of the facility at that address. Hand-curated.
 *
 * Keys are normalized: lowercased, punctuation-stripped (apostrophes/periods/
 * commas removed), whitespace collapsed. Input addresses are normalized the
 * same way before lookup, so case + apostrophe variants ("LEES" vs "Lee's")
 * resolve identically.
 *
 * The lookup also does a prefix-with-word-boundary fallback so that
 * "3901 rainbow blvd # ms 2027" matches the base "3901 rainbow blvd" entry.
 *
 * Coverage as of curation: ~30 anchors covering most rows in the top-60
 * by provider count. Extend with:
 *   SELECT address_line1, COUNT(*)::int
 *   FROM provider_locations
 *   GROUP BY 1 ORDER BY 2 DESC LIMIT 60;
 */
const KC_PRACTICE_BY_ADDRESS: Record<string, string> = {
  // ─── MO — urban-core hospitals ───────────────────────────────────────
  "2301 holmes st":               "University Health Truman Medical Center",
  "2401 gillham rd":              "Children's Mercy Kansas City",
  "2410 gillham rd":              "Children's Mercy Kansas City",
  "4401 wornall rd":              "Saint Luke's Hospital of Kansas City",
  "4330 wornall rd":              "Saint Luke's Medical Plaza Building",
  "4321 washington st":           "Saint Luke's Medical Plaza Building",
  "2316 e meyer blvd":            "Research Medical Center",
  "4801 e linwood blvd":          "Research Medical Center",
  "3801 blue pkwy":               "Swope Health Central",
  "3801 dr martin luther king jr blvd": "Swope Health Central",
  "825 euclid ave":               "Samuel U. Rodgers Health Center",
  "3515 broadway blvd":           "KC CARE Health Center",
  "5701 troost ave":              "Saint Luke's Hospital — East",

  // ─── MO — Saint Joseph Medical Center campus ────────────────────────
  "1000 carondelet dr":           "Saint Joseph Medical Center",
  "1004 carondelet dr":           "Saint Joseph Medical Center",
  "1010 carondelet dr":           "Saint Joseph Medical Center",

  // ─── MO — Suburbs ────────────────────────────────────────────────────
  "7900 lees summit rd":          "University Health Lakewood Medical Center",
  "19600 e 39th st s":            "Centerpoint Medical Center",
  "17065 s 71 hwy":               "Belton Regional Medical Center",
  "2525 glenn hendren dr":        "Liberty Hospital",
  "2609 glenn hendren dr":        "Liberty Hospital — Medical Office",
  "1425 nw blue pkwy":            "Lee's Summit Medical Center",
  "20 ne saint lukes blvd":       "Saint Luke's East Hospital",

  // ─── MO — Northland ──────────────────────────────────────────────────
  "2700 clay edwards dr":         "North Kansas City Hospital",
  "2800 clay edwards dr":         "North Kansas City Hospital — Medical Plaza",

  // ─── KS — Wyandotte / Johnson hospitals ──────────────────────────────
  "4000 cambridge st":            "University of Kansas Hospital",
  "3901 rainbow blvd":            "University of Kansas Medical Center",
  "5808 w 110th st":              "Children's Mercy Hospital Kansas",
  "9100 w 74th st":               "AdventHealth Shawnee Mission",
  "20333 w 151st st":             "Olathe Medical Center",
  "20375 w 151st st":             "Olathe Medical Center",
  "5701 w 119th st":              "Menorah Medical Center",
  "8929 parallel pkwy":           "Providence Medical Center",
  "10500 quivira rd":             "Overland Park Regional Medical Center",
  "2330 shawnee mission pkwy":    "University of Kansas Health System — Westwood",
  "2650 shawnee mission pkwy":    "University of Kansas Health System — Westwood",
};

function normalizeAddress(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’`.,]/g, "")  // strip apostrophes (straight + curly), periods, commas
    .replace(/\s+/g, " ")
    .trim();
}

export function lookupKcPractice(addressLine1: string | null | undefined): string | null {
  if (!addressLine1) return null;
  const normalized = normalizeAddress(addressLine1);

  // Exact match.
  const direct = KC_PRACTICE_BY_ADDRESS[normalized];
  if (direct) return direct;

  // Prefix-with-boundary match — "3901 rainbow blvd # ms 2027" matches the
  // "3901 rainbow blvd" key. The boundary check (next char must be space, #,
  // or end-of-string) prevents "100 main st" from matching "100 mainstem ln".
  for (const [key, name] of Object.entries(KC_PRACTICE_BY_ADDRESS)) {
    if (normalized.startsWith(key)) {
      const next = normalized.charAt(key.length);
      if (next === "" || next === " " || next === "#" || next === ",") {
        return name;
      }
    }
  }
  return null;
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
