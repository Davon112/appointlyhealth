import { Suspense } from "react";
import Link from "next/link";
import { HeartHandshake, ExternalLink } from "lucide-react";
import ClinicSearchForm from "@/components/ClinicSearchForm";
import ClinicCard from "@/components/ClinicCard";
import ResultMap from "@/components/ResultMap";
import { rawSqlite } from "@/db";
import { geocodeZip } from "@/lib/zip";
import { boundingBox } from "@/lib/geo";

export const dynamic = "force-dynamic";

type ClinicRow = {
  id: number;
  hrsa_site_id: string | null;
  name: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  services_offered: string | null;
  is_fqhc: number | null;
  is_look_alike: number | null;
  sliding_fee_scale: number | null;
  lat: number | null;
  lng: number | null;
  distance_miles: number | null;
};

type ClinicError = { error: string };
type ClinicResultItem = {
  id: number;
  name: string;
  address: { line1: string | null; city: string | null; state: string | null; zip: string | null };
  phone: string | null;
  services: string[];
  isFqhc: boolean;
  isLookAlike: boolean;
  slidingFeeScale: boolean;
  lat: number | null;
  lng: number | null;
  distance_miles: number | null;
};
type ClinicSuccess = {
  geo: { lat: number; lng: number };
  results: ClinicResultItem[];
};

async function runSearch(sp: {
  zip?: string;
  radius_miles?: string;
  service?: string;
  fqhc_only?: string;
}): Promise<null | ClinicError | ClinicSuccess> {
  const zip = sp.zip?.trim();
  if (!zip) return null;
  const radius = Math.min(Math.max(Number(sp.radius_miles ?? 10), 1), 50);
  const service = sp.service?.trim();
  const fqhcOnly = sp.fqhc_only === "true";

  const geo = await geocodeZip(zip);
  if (!geo) return { error: "Could not geocode that ZIP. Try a Kansas City metro ZIP like 64108, 66160, 66112, or 64111 — or set NEXT_PUBLIC_MAPBOX_TOKEN for nationwide coverage." };

  const bb = boundingBox(geo.lat, geo.lng, radius);
  const fqhcClause = fqhcOnly ? `AND c.is_fqhc = 1` : "";

  // services_offered is a JSON-stringified array; SQLite has no JSON-array
  // function in the default build, so we do a substring match on the raw
  // text. The labels are slug-style ("primary_care", "dental") so collisions
  // are unlikely.
  const serviceClause =
    service && service !== "any"
      ? `AND c.services_offered LIKE ?`
      : "";
  const serviceParam = service && service !== "any" ? `%"${service}"%` : null;

  const sqlite = rawSqlite();
  const sql = `
    SELECT
      c.id, c.hrsa_site_id, c.name,
      c.address_line1, c.city, c.state, c.zip,
      c.phone, c.services_offered,
      c.is_fqhc, c.is_look_alike, c.sliding_fee_scale,
      c.lat, c.lng,
      haversine_miles(c.lat, c.lng, ?, ?) AS distance_miles
    FROM clinics c
    WHERE c.lat BETWEEN ? AND ?
      AND c.lng BETWEEN ? AND ?
      ${fqhcClause}
      ${serviceClause}
      AND haversine_miles(c.lat, c.lng, ?, ?) <= ?
    ORDER BY distance_miles ASC
    LIMIT 50
  `;
  const params: Array<number | string> = [
    geo.lat, geo.lng,
    bb.minLat, bb.maxLat,
    bb.minLng, bb.maxLng,
  ];
  if (serviceParam) params.push(serviceParam);
  params.push(geo.lat, geo.lng, radius);

  const rows = sqlite.prepare(sql).all(...params) as ClinicRow[];

  return {
    geo,
    results: rows.map((r): ClinicResultItem => ({
      id: r.id,
      name: r.name,
      address: {
        line1: r.address_line1,
        city: r.city,
        state: r.state,
        zip: r.zip,
      },
      phone: r.phone,
      services: r.services_offered ? (JSON.parse(r.services_offered) as string[]) : [],
      isFqhc: !!r.is_fqhc,
      isLookAlike: !!r.is_look_alike,
      slidingFeeScale: !!r.sliding_fee_scale,
      lat: r.lat,
      lng: r.lng,
      distance_miles: r.distance_miles == null ? null : Math.round(r.distance_miles * 10) / 10,
    })),
  };
}

export default async function FindClinicPage({
  searchParams,
}: {
  searchParams: Promise<{
    zip?: string;
    radius_miles?: string;
    service?: string;
    fqhc_only?: string;
  }>;
}) {
  const sp = await searchParams;
  const searched = await runSearch(sp);

  const mapPoints =
    searched && "results" in searched
      ? searched.results
          .filter((c): c is ClinicResultItem & { lat: number; lng: number } => c.lat != null && c.lng != null)
          .map((c) => ({
            id: c.id,
            lat: c.lat,
            lng: c.lng,
            label: c.name,
          }))
      : [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <HeartHandshake className="w-8 h-8 text-brand-600" />
          <h1 className="text-3xl font-bold text-slate-900">Sliding-Scale Clinics</h1>
        </div>
        <p className="mt-2 text-slate-600">
          Federally Qualified Health Centers (FQHCs) and other safety-net clinics in the Kansas City metro.
          Every site here offers care on a sliding fee scale — bring proof of income.
        </p>
      </div>

      <Suspense>
        <ClinicSearchForm />
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7">
              <p className="text-sm text-slate-600 mb-4">
                {searched.results.length === 0
                  ? "No sliding-scale clinics found in this area."
                  : `${searched.results.length} clinic${searched.results.length === 1 ? "" : "s"} found, sorted by distance.`}
              </p>
              <ul className="space-y-4">
                {searched.results.map((c) => (
                  <ClinicCard key={c.id} c={c} />
                ))}
              </ul>
              {searched.results.length === 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-sm text-slate-700 mt-4">
                  <p className="font-medium mb-2">Try one of these:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Widen the radius (currently {sp.radius_miles ?? 10} miles)</li>
                    <li>Uncheck "FQHC only" or "Any service"</li>
                    <li>Try a KC-metro ZIP: 64108, 66160, 66112, or 64111</li>
                  </ul>
                </div>
              )}
            </div>
            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-6">
                <ResultMap center={searched.geo} points={mapPoints} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-12 bg-slate-50 border border-slate-200 rounded-xl p-5">
        <p className="text-sm text-slate-700">
          Not finding what you need? The official HRSA locator covers every health center nationwide:
        </p>
        <a
          href="https://findahealthcenter.hrsa.gov/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline"
        >
          Find a Health Center (HRSA) <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      <p className="mt-8">
        <Link href="/" className="text-brand-700 hover:underline">← Back home</Link>
      </p>
    </div>
  );
}
