import zipData from "../../data/zip-coords.json";

type ZipEntry = { lat: number; lng: number; city: string; state: string };
type ZipMap = Record<string, ZipEntry>;

const STATIC: ZipMap = Object.fromEntries(
  Object.entries(zipData).filter(([k]) => k !== "_comment"),
) as ZipMap;

export type GeocodeResult = {
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  source: "static" | "mapbox";
};

/**
 * Geocode a ZIP. Falls back to Mapbox if NEXT_PUBLIC_MAPBOX_TOKEN is set
 * and the ZIP isn't in our small static lookup.
 *
 * For the seed metros (Austin, Atlanta, Chicago), no token is required.
 */
export async function geocodeZip(zip: string): Promise<GeocodeResult | null> {
  const clean = zip.trim();
  if (!/^\d{5}$/.test(clean)) return null;

  const hit = STATIC[clean];
  if (hit) {
    return { ...hit, source: "static" };
  }

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  // Mapbox geocoding v6
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", clean);
  url.searchParams.set("country", "us");
  url.searchParams.set("types", "postcode");
  url.searchParams.set("limit", "1");
  url.searchParams.set("access_token", token);

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: { context?: { place?: { name?: string }; region?: { region_code?: string } } };
      }>;
    };
    const feat = json.features?.[0];
    const coords = feat?.geometry?.coordinates;
    if (!coords) return null;
    return {
      lng: coords[0],
      lat: coords[1],
      city: feat.properties?.context?.place?.name,
      state: feat.properties?.context?.region?.region_code,
      source: "mapbox",
    };
  } catch {
    return null;
  }
}
