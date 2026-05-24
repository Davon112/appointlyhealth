import { NextRequest, NextResponse } from "next/server";
import { rawSqlite } from "@/db";
import { geocodeZip } from "@/lib/zip";
import { boundingBox } from "@/lib/geo";

export const runtime = "nodejs";

const SPECIALTY_GROUPS = [
  "primary_care",
  "family_medicine",
  "internal_medicine",
  "pediatrics",
];
const ALL_PRIMARY = SPECIALTY_GROUPS;

type SearchRow = {
  npi: string;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  credential: string | null;
  primary_taxonomy: string | null;
  specialty_group: string | null;
  phone: string | null;
  languages: string | null;
  accepting_status: string;
  accepting_status_updated_at: number | null;
  accepting_status_source: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  distance_miles: number | null;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const zip = url.searchParams.get("zip")?.trim() ?? "";
  const radius = Math.min(Math.max(Number(url.searchParams.get("radius_miles") ?? 10), 1), 50);
  const specialty = url.searchParams.get("specialty")?.trim() || "all_primary";
  const acceptingOnly = url.searchParams.get("accepting_only") === "true";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("page_size") ?? 20)));

  if (!zip) {
    return NextResponse.json(
      { error: "zip query parameter is required" },
      { status: 400 },
    );
  }
  const geo = await geocodeZip(zip);
  if (!geo) {
    return NextResponse.json(
      {
        error: "Could not geocode ZIP",
        hint: "Try a Kansas City metro ZIP (e.g. 64108, 66160, 66112, 64111), or set NEXT_PUBLIC_MAPBOX_TOKEN for nationwide coverage.",
      },
      { status: 422 },
    );
  }

  const bb = boundingBox(geo.lat, geo.lng, radius);

  // Build specialty filter
  const specialties = specialty === "all_primary" ? ALL_PRIMARY : [specialty];
  const specialtyPlaceholders = specialties.map(() => "?").join(",");

  // Build accepting filter
  const acceptingClause = acceptingOnly ? `AND p.accepting_status = 'yes'` : "";

  const sqlite = rawSqlite();

  // One pass: filter by specialty + bounding box + accepting; sort by haversine.
  const sql = `
    SELECT
      p.npi, p.first_name, p.last_name, p.organization_name,
      p.credential, p.primary_taxonomy, p.specialty_group,
      p.phone, p.languages,
      p.accepting_status, p.accepting_status_updated_at, p.accepting_status_source,
      l.address_line1, l.address_line2, l.city, l.state, l.zip, l.lat, l.lng,
      haversine_miles(l.lat, l.lng, ?, ?) AS distance_miles
    FROM provider_locations l
    JOIN providers p ON p.npi = l.npi
    WHERE l.is_primary = 1
      AND l.lat BETWEEN ? AND ?
      AND l.lng BETWEEN ? AND ?
      AND p.specialty_group IN (${specialtyPlaceholders})
      ${acceptingClause}
      AND haversine_miles(l.lat, l.lng, ?, ?) <= ?
    ORDER BY distance_miles ASC
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) AS n
    FROM provider_locations l
    JOIN providers p ON p.npi = l.npi
    WHERE l.is_primary = 1
      AND l.lat BETWEEN ? AND ?
      AND l.lng BETWEEN ? AND ?
      AND p.specialty_group IN (${specialtyPlaceholders})
      ${acceptingClause}
      AND haversine_miles(l.lat, l.lng, ?, ?) <= ?
  `;

  const rows = sqlite
    .prepare(sql)
    .all(
      geo.lat, geo.lng,
      bb.minLat, bb.maxLat,
      bb.minLng, bb.maxLng,
      ...specialties,
      geo.lat, geo.lng, radius,
      pageSize, (page - 1) * pageSize,
    ) as SearchRow[];

  const countRow = sqlite
    .prepare(countSql)
    .get(
      bb.minLat, bb.maxLat,
      bb.minLng, bb.maxLng,
      ...specialties,
      geo.lat, geo.lng, radius,
    ) as { n: number };

  const results = rows.map((r) => ({
    npi: r.npi,
    name: r.organization_name
      ? r.organization_name
      : `${r.first_name ?? ""} ${r.last_name ?? ""}${r.credential ? ", " + r.credential : ""}`.trim(),
    specialty: r.primary_taxonomy,
    specialty_group: r.specialty_group,
    phone: r.phone,
    languages: r.languages ? (JSON.parse(r.languages) as string[]) : [],
    address: {
      line1: r.address_line1,
      line2: r.address_line2,
      city: r.city,
      state: r.state,
      zip: r.zip,
    },
    lat: r.lat,
    lng: r.lng,
    distance_miles: r.distance_miles == null ? null : Math.round(r.distance_miles * 10) / 10,
    accepting_patients: {
      status: r.accepting_status,
      last_verified_at: r.accepting_status_updated_at
        ? new Date(r.accepting_status_updated_at * 1000).toISOString()
        : null,
      source: r.accepting_status_source,
    },
  }));

  return NextResponse.json({
    query: { zip, radius_miles: radius, specialty, accepting_only: acceptingOnly },
    origin: { lat: geo.lat, lng: geo.lng, source: geo.source },
    results,
    total: countRow.n,
    page,
    page_size: pageSize,
  });
}
