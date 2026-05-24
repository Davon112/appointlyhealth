"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map, GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export type ResultPoint = {
  id: string | number;
  lat: number;
  lng: number;
  label: string;
  href?: string;
};

type Props = {
  center: { lat: number; lng: number };
  points: ResultPoint[];
  /** Initial zoom. Defaults to 11 (city scale). */
  zoom?: number;
  /** Tailwind classes for the outer container. */
  className?: string;
};

/**
 * Map embed for /find-doctor and /find-clinic.
 *
 * Uses mapbox-gl directly (no react-map-gl wrapper — keeps bundle small).
 * Renders the result set as a clustered GeoJSON source so the map stays
 * usable whether we have 5 points or 5,000. Clicking a cluster zooms in;
 * clicking an individual marker navigates to its detail page (if `href`).
 *
 * No-op when NEXT_PUBLIC_MAPBOX_TOKEN is not set — we render a friendly
 * banner instead so the page degrades gracefully.
 */
export default function ResultMap({ center, points, zoom = 11, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!token || !containerRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [center.lng, center.lat],
      zoom,
      attributionControl: true,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.GeolocateControl({ showAccuracyCircle: false }), "top-right");

    // Center pin (the searched ZIP's centroid) — a small distinct marker so
    // users can orient relative to their query.
    new mapboxgl.Marker({ color: "#0f172a", scale: 0.7 })
      .setLngLat([center.lng, center.lat])
      .setPopup(new mapboxgl.Popup({ offset: 12 }).setText("Search center"))
      .addTo(map);

    map.on("load", () => {
      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: points.map((p) => ({
          type: "Feature",
          properties: { id: String(p.id), label: p.label, href: p.href ?? null },
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        })),
      };

      map.addSource("results", {
        type: "geojson",
        data,
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: 14,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "results",
        filter: ["has", "point_count"],
        paint: {
          // Brand-tinted clusters that scale by count.
          "circle-color": [
            "step", ["get", "point_count"],
            "#60a5fa", 25,
            "#3b82f6", 100,
            "#1d4ed8",
          ],
          "circle-radius": [
            "step", ["get", "point_count"],
            18, 25,
            24, 100,
            30,
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "results",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 13,
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "unclustered",
        type: "circle",
        source: "results",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#0f766e",
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Click a cluster → zoom in to it.
      // Note: mapbox-gl 3.x returns a Promise from getClusterExpansionZoom,
      // but the @types still declare a callback signature. Cast through.
      map.on("click", "clusters", (e) => {
        const feat = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        if (!feat) return;
        const clusterId = feat.properties?.cluster_id as number;
        const src = map.getSource("results") as GeoJSONSource;
        const result = (src as unknown as {
          getClusterExpansionZoom: (id: number) => Promise<number>;
        }).getClusterExpansionZoom(clusterId);
        Promise.resolve(result).then((nextZoom) => {
          const geom = feat.geometry as GeoJSON.Point;
          map.easeTo({ center: geom.coordinates as [number, number], zoom: nextZoom });
        });
      });

      // Click an individual marker → popup + navigate.
      map.on("click", "unclustered", (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const geom = feat.geometry as GeoJSON.Point;
        const [lng, lat] = geom.coordinates as [number, number];
        const label = (feat.properties?.label as string) ?? "";
        const href = feat.properties?.href as string | null | undefined;
        const html = href
          ? `<div class="text-sm"><a href="${href}" class="font-semibold text-brand-700 hover:underline">${escapeHtml(label)}</a></div>`
          : `<div class="text-sm font-semibold">${escapeHtml(label)}</div>`;
        new mapboxgl.Popup({ offset: 12, closeButton: false })
          .setLngLat([lng, lat])
          .setHTML(html)
          .addTo(map);
      });

      // Cursor affordance.
      for (const layer of ["clusters", "unclustered"]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // We intentionally re-init the map when center, points, zoom, or token change.
    // For large `points` arrays this is fine — mapbox-gl is cheap to recreate
    // and we avoid the complexity of differential source updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, center.lat, center.lng, zoom, JSON.stringify(points.map((p) => p.id))]);

  if (!token) {
    return (
      <div
        className={
          "bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 " +
          (className ?? "")
        }
      >
        Map disabled — set <code className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> in <code className="font-mono">.env</code>{" "}
        to enable. Get a free token at{" "}
        <a
          href="https://account.mapbox.com/access-tokens/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-medium"
        >
          mapbox.com
        </a>
        .
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={"w-full h-[420px] lg:h-[640px] rounded-xl overflow-hidden border border-slate-200 " + (className ?? "")}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
