import { Suspense } from "react";
import Link from "next/link";
import { Pill, ExternalLink, KeyRound } from "lucide-react";
import PharmacySearchForm from "@/components/PharmacySearchForm";
import PharmacyCard from "@/components/PharmacyCard";
import ResultMap from "@/components/ResultMap";
import { geocodeZip } from "@/lib/zip";
import { searchPharmaciesNearby, type PharmacyResult } from "@/lib/pharmacies";

export const dynamic = "force-dynamic";

type SearchError = { kind: "error"; message: string };
type NoKey = { kind: "no_key"; hint: string; geo: { lat: number; lng: number } };
type SearchSuccess = {
  kind: "ok";
  geo: { lat: number; lng: number };
  results: PharmacyResult[];
};

async function runSearch(sp: {
  zip?: string;
  radius_miles?: string;
  open_now?: string;
}): Promise<null | SearchError | NoKey | SearchSuccess> {
  const zip = sp.zip?.trim();
  if (!zip) return null;
  const radius = Math.min(Math.max(Number(sp.radius_miles ?? 5), 1), 30);
  const openNow = sp.open_now === "true";

  const geo = await geocodeZip(zip);
  if (!geo) {
    return {
      kind: "error",
      message:
        "Could not geocode that ZIP. Try a Kansas City metro ZIP like 64108, 66160, 66112, or 64111 — or set NEXT_PUBLIC_MAPBOX_TOKEN for nationwide coverage.",
    };
  }

  const outcome = await searchPharmaciesNearby(geo.lat, geo.lng, radius);
  if (outcome.kind === "no_key") {
    return { kind: "no_key", hint: outcome.hint, geo };
  }
  if (outcome.kind === "error") {
    return { kind: "error", message: outcome.message };
  }
  const results = openNow ? outcome.results.filter((p) => p.open_now === true) : outcome.results;
  return { kind: "ok", geo, results };
}

export default async function FindPharmacyPage({
  searchParams,
}: {
  searchParams: Promise<{
    zip?: string;
    radius_miles?: string;
    open_now?: string;
  }>;
}) {
  const sp = await searchParams;
  const searched = await runSearch(sp);

  const mapPoints =
    searched && searched.kind === "ok"
      ? searched.results.map((p) => ({
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          label: p.name,
        }))
      : [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Pill className="w-8 h-8 text-brand-600" />
          <h1 className="text-3xl font-bold text-slate-900">Find a Pharmacy</h1>
        </div>
        <p className="mt-2 text-slate-600">
          Pharmacies near a Kansas City metro ZIP. Powered by Google Places —
          covers chains and independents alike, with current open-now status when
          Google has it.
        </p>
      </div>

      <Suspense>
        <PharmacySearchForm />
      </Suspense>

      <div className="mt-8">
        {!searched && (
          <p className="text-slate-500 text-center py-12">
            Enter a ZIP code above to search.
          </p>
        )}

        {searched && searched.kind === "error" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-900">
            {searched.message}
          </div>
        )}

        {searched && searched.kind === "no_key" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-amber-900">
            <div className="flex items-start gap-3">
              <KeyRound className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-amber-950">
                  Pharmacy lookups are disabled — no Google Places API key configured.
                </p>
                <p>{searched.hint}</p>
                <p>
                  Once a key is in <code className="font-mono">.env</code>, restart{" "}
                  <code className="font-mono">npm run dev</code> and reload this page.
                  In the meantime, the official locators below still work.
                </p>
              </div>
            </div>
          </div>
        )}

        {searched && searched.kind === "ok" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7">
              <p className="text-sm text-slate-600 mb-4">
                {searched.results.length === 0
                  ? "No pharmacies found in this area."
                  : `${searched.results.length} pharmac${searched.results.length === 1 ? "y" : "ies"} found, sorted by distance.`}
              </p>
              <ul className="space-y-4">
                {searched.results.map((p) => (
                  <PharmacyCard key={p.id} p={p} />
                ))}
              </ul>
              {searched.results.length === 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-sm text-slate-700 mt-4">
                  <p className="font-medium mb-2">Try one of these:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Widen the radius (currently {sp.radius_miles ?? 5} miles)</li>
                    <li>Uncheck "Open now only"</li>
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
          Looking for low-cost prescriptions or mail order? These public locators have broader coverage:
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold text-brand-700">
          <a
            href="https://www.goodrx.com/pharmacy-near-me"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            GoodRx pharmacy locator <ExternalLink className="w-4 h-4" />
          </a>
          <a
            href="https://findahealthcenter.hrsa.gov/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            HRSA — health centers with on-site pharmacy <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      <p className="mt-8">
        <Link href="/" className="text-brand-700 hover:underline">← Back home</Link>
      </p>
    </div>
  );
}
