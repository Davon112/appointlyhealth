import { Suspense } from "react";
import SearchForm from "@/components/SearchForm";
import ProviderCard from "@/components/ProviderCard";
import { rawSqlite } from "@/db";
import { geocodeZip } from "@/lib/zip";
import { boundingBox } from "@/lib/geo";

export const dynamic = "force-dynamic";

const ALL_PRIMARY = ["primary_care", "family_medicine", "internal_medicine", "pediatrics"];

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

async function runSearch(sp: {
  zip?: string;
  radius_miles?: string;
  specialty?: string;
  accepting_only?: string;
}) {
  const zip = sp.zip?.trim();
  if (!zip) return null;
  const radius = Math.min(Math.max(Number(sp.radius_miles ?? 10), 1), 50);
  const specialty = sp.specialty?.trim() || "all_primary";
  const acceptingOnly = sp.accepting_only === "true";

  const geo = await geocodeZip(zip);
  if (!geo) return { error: "Could not geocode that ZIP. Try 78701, 30303, or 60601 — or set NEXT_PUBLIC_MAPBOX_TOKEN for nationwide coverage." };

  const bb = boundingBox(geo.lat, geo.lng, radius);
  const specialties = specialty === "all_primary" ? ALL_PRIMARY : [specialty];
  const placeholders = specialties.map(() => "?").join(",");
  const acceptingClause = acceptingOnly ? `AND p.accepting_status = 'yes'` : "";

  const sqlite = rawSqlite();
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
      AND p.specialty_group IN (${placeholders})
      ${acceptingClause}
      AND haversine_miles(l.lat, l.lng, ?, ?) <= ?
    ORDER BY distance_miles ASC
    LIMIT 50
  `;
  const rows = sqlite
    .prepare(sql)
    .all(
      geo.lat, geo.lng,
      bb.minLat, bb.maxLat,
      bb.minLng, bb.maxLng,
      ...specialties,
      geo.lat, geo.lng, radius,
    ) as SearchRow[];

  return {
    geo,
    results: rows.map((r) => ({
      npi: r.npi,
      name: r.organization_name
        ? r.organization_name
        : `${r.first_name ?? ""} ${r.last_name ?? ""}${r.credential ? ", " + r.credential : ""}`.trim(),
      specialty: r.primary_taxonomy,
      phone: r.phone,
      languages: r.languages ? (JSON.parse(r.languages) as string[]) : [],
      address: {
        line1: r.address_line1,
        line2: r.address_line2,
        city: r.city,
        state: r.state,
        zip: r.zip,
      },
      distance_miles: r.distance_miles == null ? null : Math.round(r.distance_miles * 10) / 10,
      accepting_patients: {
        status: r.accepting_status,
        last_verified_at: r.accepting_status_updated_at
          ? new Date(r.accepting_status_updated_at * 1000).toISOString()
          : null,
        source: r.accepting_status_source,
      },
    })),
  };
}

export default async function FindDoctorPage({
  searchParams,
}: {
  searchParams: Promise<{
    zip?: string;
    radius_miles?: string;
    specialty?: string;
    accepting_only?: string;
  }>;
}) {
  const sp = await searchParams;
  const searched = await runSearch(sp);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Find a doctor near you</h1>
        <p className="mt-2 text-slate-600">
          We surface primary-care providers in your area and show whether they're accepting new patients.
          Demo data is loaded for Austin (78701), Atlanta (30303), and Chicago (60601).
        </p>
      </div>

      <Suspense>
        <SearchForm />
      </Suspense>

      <div className="mt-8">
        {!searched && (
          <p className="text-slate-500 text-center py-12">
            Enter a ZIP code above to search.
          </p>
        )}

        {searched && "error" in searched && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-900">
            {searched.error}
          </div>
        )}

        {searched && "results" in searched && (
          <>
            <p className="text-sm text-slate-600 mb-4">
              {searched.results.length === 0
                ? "No providers found in this area."
                : `${searched.results.length} provider${searched.results.length === 1 ? "" : "s"} found, sorted by distance.`}
            </p>
            <ul className="space-y-4">
              {searched.results.map((r) => (
                <ProviderCard key={r.npi} r={r} />
              ))}
            </ul>
            {searched.results.length === 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-sm text-slate-700 mt-4">
                <p className="font-medium mb-2">Try one of these:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Widen the radius (currently {sp.radius_miles ?? 10} miles)</li>
                  <li>Uncheck "accepting new patients only"</li>
                  <li>Try a seed ZIP: 78701, 30303, or 60601</li>
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
