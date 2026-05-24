import Link from "next/link";
import { MapPin, Phone, BadgeCheck, Car, CalendarPlus } from "lucide-react";

type Clinic = {
  id: number;
  name: string;
  address: {
    line1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  phone: string | null;
  services: string[];
  isFqhc: boolean;
  isLookAlike: boolean;
  slidingFeeScale: boolean;
  lat: number | null;
  lng: number | null;
  distance_miles: number | null;
};

const SERVICE_LABEL: Record<string, string> = {
  primary_care:  "Primary care",
  dental:        "Dental",
  behavioral:    "Behavioral health",
  prenatal:      "Prenatal",
  pharmacy:      "Pharmacy",
  vision:        "Vision",
  substance_use: "Substance use",
};

export default function ClinicCard({ c }: { c: Clinic }) {
  const addrLine = [c.address.line1, c.address.city, c.address.state, c.address.zip]
    .filter(Boolean)
    .join(", ");

  // Build a /get-ride deeplink with destination prefilled, if we have coords.
  const rideHref =
    c.lat != null && c.lng != null
      ? `/get-ride?lat=${c.lat}&lng=${c.lng}&to=${encodeURIComponent(c.name)}`
      : null;

  return (
    <li className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-brand-700">{c.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {c.isFqhc && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 font-medium">
                <BadgeCheck className="w-3 h-3" /> FQHC
              </span>
            )}
            {c.isLookAlike && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 px-2 py-0.5 font-medium">
                FQHC look-alike
              </span>
            )}
            {c.slidingFeeScale && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 font-medium">
                Sliding fee scale
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {typeof c.distance_miles === "number" && (
            <span className="text-sm font-medium text-slate-700">
              {c.distance_miles} mi
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-4 text-sm text-slate-700">
        <div className="flex items-start gap-2 min-w-0">
          <MapPin className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" />
          <span className="truncate">{addrLine}</span>
        </div>
        {c.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <a href={`tel:${c.phone}`} className="hover:underline">
              {c.phone}
            </a>
          </div>
        )}
      </div>

      {c.services.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.services.map((s) => (
            <span
              key={s}
              className="text-xs rounded-md bg-slate-100 text-slate-700 px-2 py-0.5"
            >
              {SERVICE_LABEL[s] ?? s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={`/request-appointment?clinic_id=${c.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
        >
          <CalendarPlus className="w-4 h-4" /> Request appointment
        </Link>
        {rideHref && (
          <a
            href={rideHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
          >
            <Car className="w-4 h-4" /> Get a ride here
          </a>
        )}
      </div>
    </li>
  );
}
