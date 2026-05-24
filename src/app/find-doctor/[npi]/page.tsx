import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { providers, providerLocations } from "@/db/schema";
import { eq } from "drizzle-orm";
import AcceptingBadge from "@/components/AcceptingBadge";
import VerifyButton from "@/components/VerifyButton";
import { MapPin, Phone, Languages, ArrowLeft, Navigation2, Car } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProviderDetailPage({
  params,
}: {
  params: Promise<{ npi: string }>;
}) {
  const { npi } = await params;
  if (!/^\d{10}$/.test(npi)) notFound();

  const provider = await db.query.providers.findFirst({
    where: eq(providers.npi, npi),
  });
  if (!provider) notFound();

  const locations = await db.query.providerLocations.findMany({
    where: eq(providerLocations.npi, npi),
  });
  const primary = locations.find((l) => l.isPrimary) ?? locations[0];

  const name = provider.organizationName
    ? provider.organizationName
    : `${provider.firstName ?? ""} ${provider.lastName ?? ""}${provider.credential ? ", " + provider.credential : ""}`.trim();

  const langs: string[] = provider.languages ? JSON.parse(provider.languages) : [];

  const directionsUrl = primary
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        [primary.addressLine1, primary.city, primary.state, primary.zip].filter(Boolean).join(", "),
      )}`
    : null;

  // Rideshare deeplinks — see spec §7.3 for the v2 upgrade to Uber Health / Lyft Pass.
  const dropoffLat = primary?.lat;
  const dropoffLng = primary?.lng;
  const dropoffName = primary?.addressLine1 ?? name;
  const uberUrl = dropoffLat && dropoffLng
    ? `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${dropoffLat}&dropoff[longitude]=${dropoffLng}&dropoff[nickname]=${encodeURIComponent(dropoffName)}`
    : null;
  const lyftUrl = dropoffLat && dropoffLng
    ? `https://ride.lyft.com/ridetype?id=lyft&destination[latitude]=${dropoffLat}&destination[longitude]=${dropoffLng}`
    : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/find-doctor" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to search
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{name}</h1>
          {provider.primaryTaxonomy && (
            <p className="text-slate-600 mt-1">{provider.primaryTaxonomy}</p>
          )}
        </div>
        <AcceptingBadge
          status={provider.acceptingStatus}
          lastVerifiedAt={
            provider.acceptingStatusUpdatedAt
              ? new Date(provider.acceptingStatusUpdatedAt).toISOString()
              : null
          }
          size="md"
        />
      </div>

      {/* Quick facts */}
      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        {primary && (
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-slate-900">{primary.addressLine1}</p>
              <p className="text-slate-600 text-sm">
                {[primary.city, primary.state, primary.zip].filter(Boolean).join(", ")}
              </p>
            </div>
          </div>
        )}
        {provider.phone && (
          <div className="flex items-center gap-3">
            <Phone className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <a href={`tel:${provider.phone}`} className="text-brand-700 hover:underline">
              {provider.phone}
            </a>
          </div>
        )}
        {langs.length > 0 && (
          <div className="flex items-center gap-3">
            <Languages className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <span className="text-slate-700">{langs.join(", ")}</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {provider.phone && (
          <a
            href={`tel:${provider.phone}`}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700"
          >
            <Phone className="w-4 h-4" /> Call
          </a>
        )}
        {directionsUrl && (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-slate-300 text-slate-800 font-semibold hover:bg-slate-50"
          >
            <Navigation2 className="w-4 h-4" /> Directions
          </a>
        )}
        {(uberUrl || lyftUrl) && (
          <Link
            href={{
              pathname: "/get-ride",
              query: {
                to: dropoffName,
                lat: String(dropoffLat),
                lng: String(dropoffLng),
              },
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-brand-600 text-brand-700 font-semibold hover:bg-brand-50"
          >
            <Car className="w-4 h-4" /> Get a ride
          </Link>
        )}
      </div>

      {/* Verification flow */}
      <section className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">
          Help keep this up to date
        </h2>
        <VerifyButton npi={provider.npi} />
        {provider.acceptingStatusUpdatedAt && (
          <p className="mt-3 text-xs text-slate-500">
            Last update {new Date(provider.acceptingStatusUpdatedAt).toLocaleDateString()}
            {provider.acceptingStatusSource && ` · ${provider.acceptingStatusSource.replace("_", " ")}`}
          </p>
        )}
      </section>

      <p className="mt-8 text-xs text-slate-400">
        NPI {provider.npi} · Information sourced from NPPES. Verifications are crowdsourced. Always call ahead to confirm.
      </p>
    </div>
  );
}
