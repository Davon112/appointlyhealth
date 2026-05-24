/**
 * Pharmacy finder — public HTTP API.
 *
 * GET /api/pharmacies/nearby?zip=64108&radius_miles=5
 * GET /api/pharmacies/nearby?lat=39.0848&lng=-94.5797&radius_miles=5
 *
 * Returns: { results: PharmacyResult[], geo: { lat, lng } }
 *
 * The core Google Places call lives in src/lib/pharmacies.ts so the
 * server-rendered /find-pharmacy page and external callers stay in sync.
 */
import { NextRequest, NextResponse } from "next/server";
import { geocodeZip } from "@/lib/zip";
import { searchPharmaciesNearby } from "@/lib/pharmacies";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const zip = sp.get("zip")?.trim();
  const latParam = sp.get("lat");
  const lngParam = sp.get("lng");
  const radiusMi = Math.min(Math.max(Number(sp.get("radius_miles") ?? 5), 1), 30);

  let lat: number;
  let lng: number;
  if (latParam && lngParam) {
    lat = Number(latParam);
    lng = Number(lngParam);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Invalid lat/lng" }, { status: 422 });
    }
  } else if (zip) {
    const geo = await geocodeZip(zip);
    if (!geo) {
      return NextResponse.json(
        {
          error: "Could not geocode ZIP",
          hint: "Try a Kansas City metro ZIP (e.g. 64108, 66160, 66112, 64111).",
        },
        { status: 422 },
      );
    }
    lat = geo.lat;
    lng = geo.lng;
  } else {
    return NextResponse.json({ error: "Provide either zip or lat+lng" }, { status: 422 });
  }

  const outcome = await searchPharmaciesNearby(lat, lng, radiusMi);

  if (outcome.kind === "no_key") {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY is not set", hint: outcome.hint, geo: { lat, lng } },
      { status: 503 },
    );
  }
  if (outcome.kind === "error") {
    return NextResponse.json({ error: outcome.message }, { status: outcome.status });
  }

  return NextResponse.json({ results: outcome.results, geo: { lat, lng } });
}
