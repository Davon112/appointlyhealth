/**
 * Server-side helper for the pharmacy finder. Wraps Google Places Nearby
 * Search (New) into a shape Appointly's UI can render directly.
 *
 * Used by both:
 *   - /api/pharmacies/nearby  (the external HTTP endpoint)
 *   - /find-pharmacy          (the server-rendered search page)
 *
 * Keeping the credential and the field-mask choices in one file means
 * the page and the API can never drift apart.
 */

export type PharmacyResult = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  open_now: boolean | null;
  business_status: string | null;
  distance_miles: number | null;
};

export type PharmacySearchOutcome =
  | { kind: "ok"; results: PharmacyResult[] }
  | { kind: "no_key"; hint: string }
  | { kind: "error"; message: string; status: number };

type PlacesNearbyResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    nationalPhoneNumber?: string;
    currentOpeningHours?: { openNow?: boolean };
    businessStatus?: string;
  }>;
  error?: { message?: string; code?: number };
};

const NO_KEY_HINT =
  "Add a Google Places API key to .env (GOOGLE_PLACES_API_KEY) to enable live " +
  "pharmacy lookups. Get one at https://console.cloud.google.com/google/maps-apis — " +
  "enable 'Places API (New)' and create an API key.";

function milesToMeters(mi: number): number {
  return Math.round(mi * 1609.34);
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.7613;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function searchPharmaciesNearby(
  lat: number,
  lng: number,
  radiusMiles: number,
): Promise<PharmacySearchOutcome> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { kind: "no_key", hint: NO_KEY_HINT };

  const body = {
    includedTypes: ["pharmacy"],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: milesToMeters(radiusMiles),
      },
    },
  };

  let res: Response;
  try {
    res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // Tight field mask = Nearby Search Pro pricing, not Enterprise.
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.location",
          "places.nationalPhoneNumber",
          "places.currentOpeningHours.openNow",
          "places.businessStatus",
        ].join(","),
      },
      body: JSON.stringify(body),
      // Cache identical queries for 5 min — Google's pharmacy data is stable
      // within a search session and we don't need real-time freshness.
      next: { revalidate: 300 },
    });
  } catch (e) {
    return {
      kind: "error",
      message: `Network error contacting Google Places: ${(e as Error).message}`,
      status: 502,
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      kind: "error",
      message: `Google Places returned ${res.status}: ${text.slice(0, 300)}`,
      status: 502,
    };
  }

  const json = (await res.json()) as PlacesNearbyResponse;
  if (json.error) {
    return {
      kind: "error",
      message: `Google Places error: ${json.error.message ?? "unknown"}`,
      status: 502,
    };
  }

  const results: PharmacyResult[] = (json.places ?? [])
    .filter(
      (p): p is Required<Pick<typeof p, "id" | "location">> & typeof p =>
        !!p.id && p.location?.latitude != null && p.location.longitude != null,
    )
    .map((p) => {
      const pLat = p.location.latitude as number;
      const pLng = p.location.longitude as number;
      return {
        id: p.id as string,
        name: p.displayName?.text ?? "Pharmacy",
        address: p.formattedAddress ?? null,
        phone: p.nationalPhoneNumber ?? null,
        lat: pLat,
        lng: pLng,
        open_now: p.currentOpeningHours?.openNow ?? null,
        business_status: p.businessStatus ?? null,
        distance_miles: Math.round(haversineMiles(lat, lng, pLat, pLng) * 10) / 10,
      };
    })
    .sort((a, b) => (a.distance_miles ?? 999) - (b.distance_miles ?? 999));

  return { kind: "ok", results };
}
