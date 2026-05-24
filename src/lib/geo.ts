/**
 * Geo helpers. Mirror the haversine_miles UDF registered in src/db/index.ts
 * so we can also compute distances client-side / in tests.
 */
const R_MI = 3958.7613;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.sqrt(a));
}

/**
 * Bounding box around a point. Used to bracket-filter rows on indexed
 * lat/lng columns before the more expensive haversine sort.
 *
 * Slightly over-includes near the poles; fine for the contiguous US.
 */
export function boundingBox(lat: number, lng: number, radiusMiles: number) {
  const latDelta = radiusMiles / 69.0; // ~69 miles per degree latitude
  const lngDelta = radiusMiles / (Math.cos(toRad(lat)) * 69.172);
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}
