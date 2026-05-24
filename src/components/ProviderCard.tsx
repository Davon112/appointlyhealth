import Link from "next/link";
import { MapPin, Phone, Languages, Building2, Mail } from "lucide-react";
import AcceptingBadge from "./AcceptingBadge";
import { cleanSpecialty, lookupKcPractice } from "@/lib/provider-display";

type Result = {
  npi: string;
  name: string;
  specialty: string | null;
  phone: string | null;
  languages: string[];
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  distance_miles: number | null;
  accepting_patients: {
    status: string;
    last_verified_at: string | null;
    source: string | null;
  };
};

export default function ProviderCard({ r }: { r: Result }) {
  const cityZip = [r.address.line1, r.address.city, r.address.state, r.address.zip]
    .filter(Boolean)
    .join(", ");
  const specialty = cleanSpecialty(r.specialty);
  const practice = lookupKcPractice(r.address.line1);

  return (
    <li className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link
            href={`/find-doctor/${r.npi}`}
            className="text-lg font-semibold text-brand-700 hover:underline"
          >
            {r.name}
          </Link>
          {specialty && (
            <p className="text-sm text-slate-600 mt-0.5">{specialty}</p>
          )}
          {practice && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              {practice}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {typeof r.distance_miles === "number" && (
            <span className="text-sm font-medium text-slate-700">
              {r.distance_miles} mi
            </span>
          )}
          <AcceptingBadge status={r.accepting_patients.status} lastVerifiedAt={r.accepting_patients.last_verified_at} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-4 text-sm text-slate-700">
        <div className="flex items-start gap-2 min-w-0">
          <MapPin className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" />
          <span className="truncate">{cityZip}</span>
        </div>
        {r.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <a href={`tel:${r.phone}`} className="hover:underline">
              {r.phone}
            </a>
          </div>
        )}
        {r.languages.length > 0 && (
          <div className="flex items-center gap-2 sm:col-span-2">
            <Languages className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span>{r.languages.join(", ")}</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={`/request-appointment?provider_npi=${r.npi}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
        >
          <Mail className="w-4 h-4" /> Email provider
        </Link>
      </div>
    </li>
  );
}
