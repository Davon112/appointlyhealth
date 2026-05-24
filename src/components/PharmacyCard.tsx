import { MapPin, Phone, Clock, Car } from "lucide-react";
import type { PharmacyResult } from "@/lib/pharmacies";

export default function PharmacyCard({ p }: { p: PharmacyResult }) {
  const rideHref = `/get-ride?lat=${p.lat}&lng=${p.lng}&to=${encodeURIComponent(p.name)}`;

  return (
    <li className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-brand-700">{p.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {p.open_now === true && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 font-medium">
                <Clock className="w-3 h-3" /> Open now
              </span>
            )}
            {p.open_now === false && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 font-medium">
                <Clock className="w-3 h-3" /> Closed
              </span>
            )}
            {p.business_status && p.business_status !== "OPERATIONAL" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 font-medium">
                {p.business_status.replace(/_/g, " ").toLowerCase()}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {typeof p.distance_miles === "number" && (
            <span className="text-sm font-medium text-slate-700">
              {p.distance_miles} mi
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-4 text-sm text-slate-700">
        {p.address && (
          <div className="flex items-start gap-2 min-w-0">
            <MapPin className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">{p.address}</span>
          </div>
        )}
        {p.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <a href={`tel:${p.phone}`} className="hover:underline">
              {p.phone}
            </a>
          </div>
        )}
      </div>

      <div className="mt-4">
        <a
          href={rideHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
        >
          <Car className="w-4 h-4" /> Get a ride here
        </a>
      </div>
    </li>
  );
}
