import { NextRequest, NextResponse } from "next/server";
import { pgQuery } from "@/db";
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
  accepting_status_updated_at: Date | null;
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
  const specialties = specialty === "all_primary" ? ALL_PRIMARY : [specialty];
  const acceptingClause = acceptingOnly ? `AND p.accepting_status = 'yes'` : "";

  // Build SELECT params: $1..$2 = haversine SELECT, $3..$6 = bbox,
  // $7..$(6+N) = specialty IN list, $(7+N)..$(9+N) = haversine WHERE,
  // $(10+N) = LIMIT, $(11+N) = OFFSET.
  const selectParams: Array<number | string> = [
    geo.lat, geo.lng,
    bb.minLat, bb.maxLat,
    bb.minLng, bb.maxLng,
    ...specialties,
    geo.lat, geo.lng, radius,
    pageSize, (page - 1) * pageSize,
  ];
  const specialtyPlaceholders = specialties.map((_, i) => `$${7 + i}`).join(",");
  const havLatIdx = 7 + specialties.length;
  const havLngIdx = havLatIdx + 1;
  const radiusIdx = havLngIdx + 1;
  const limitIdx = radiusIdx + 1;
  const offsetIdx = limitIdx + 1;

  const sql = `
    SELECT
      p.npi, p.first_name, p.last_name, p.organization_name,
      p.credential, p.primary_taxonomy, p.specialty_group,
      p.phone, p.languages,
      p.accepting_status, p.accepting_status_updated_at, p.accepting_status_source,
      l.address_line1, l.address_line2, l.city, l.state, l.zip, l.lat, l.lng,
      haversine_miles(l.lat, l.lng, $1, $2) AS distance_miles
    FROM provider_locations l
    JOIN providers p ON p.npi = l.npi
    WHERE l.is_primary = true
      AND l.lat BETWEEN $3 AND $4
      AND l.lng BETWEEN $5 AND $6
      AND p.specialty_group IN (${specialtyPlaceholders})
      ${acceptingClause}
      AND haversine_miles(l.lat, l.lng, $${havLatIdx}, $${havLngIdx}) <= $${radiusIdx}
    ORDER BY distance_miles ASC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  // Count query — same WHERE shape, but no LIMIT/OFFSET, no SELECT haversine.
  // $1..$4 = bbox, $5..$(4+N) = specialty IN, $(5+N)..$(7+N) = haversine WHERE.
  const countParams: Array<number | string> = [
    bb.minLat, bb.maxLat,
    bb.minLng, bb.maxLng,
    ...specialties,
    geo.lat, geo.lng, radius,
  ];
  const cSpecPlaceholders = specialties.map((_, i) => `$${5 + i}`).join(",");
  const cHavLat = 5 + specialties.length;
  const cHavLng = cHavLat + 1;
  const cRadius = cHavLng + 1;
  const countSql = `
    SELECT COUNT(*)::int AS n
    FROM provider_locations l
    JOIN providers p ON p.npi = l.npi
    WHERE l.is_primary = true
      AND l.lat BETWEEN $1 AND $2
      AND l.lng BETWEEN $3 AND $4
      AND p.specialty_group IN (${cSpecPlaceholders})
      ${acceptingClause}
      AND haversine_miles(l.lat, l.lng, $${cHavLat}, $${cHavLng}) <= $${cRadius}
  `;

  const [rows, countRows] = await Promise.all([
    pgQuery<SearchRow>(sql, selectParams),
    pgQuery<{ n: number }>(countSql, countParams),
  ]);

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
        ? r.accepting_status_updated_at.toISOString()
        : null,
      source: r.accepting_status_source,
    },
  }));

  return NextResponse.json({
    query: { zip, radius_miles: radius, specialty, accepting_only: acceptingOnly },
    origin: { lat: geo.lat, lng: geo.lng, source: geo.source },
    results,
    total: countRows[0]?.n ?? 0,
    page,
    page_size: pageSize,
  });
}
