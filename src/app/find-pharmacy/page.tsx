import Link from "next/link";
import { Pill } from "lucide-react";

export default function FindPharmacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <Pill className="w-12 h-12 text-brand-600 mx-auto mb-4" />
      <h1 className="text-3xl font-bold text-slate-900">Pharmacies near you</h1>
      <p className="mt-3 text-slate-600">
        Coming in Phase 3. This page will use the Google Places API to surface
        the closest open pharmacies and (later) integrate price estimates from
        GoodRx and prescription-ready notifications.
      </p>
      <p className="mt-6 text-sm text-slate-500">
        Requires <code className="bg-slate-100 px-1.5 py-0.5 rounded">GOOGLE_PLACES_API_KEY</code> in <code className="bg-slate-100 px-1.5 py-0.5 rounded">.env</code>.
      </p>
      <p className="mt-8">
        <Link href="/" className="text-brand-700 hover:underline">← Back home</Link>
      </p>
    </div>
  );
}
