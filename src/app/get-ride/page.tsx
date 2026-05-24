import Link from "next/link";
import { Car } from "lucide-react";

export default async function GetRidePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; lat?: string; lng?: string }>;
}) {
  const sp = await searchParams;
  const lat = sp.lat ? Number(sp.lat) : null;
  const lng = sp.lng ? Number(sp.lng) : null;
  const to = sp.to ?? "your destination";

  const uberUrl = lat != null && lng != null
    ? `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[nickname]=${encodeURIComponent(to)}`
    : null;
  const lyftUrl = lat != null && lng != null
    ? `https://ride.lyft.com/ridetype?id=lyft&destination[latitude]=${lat}&destination[longitude]=${lng}`
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="text-center">
        <Car className="w-12 h-12 text-brand-600 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-slate-900">Get a Ride</h1>
        {lat != null && lng != null ? (
          <p className="mt-3 text-slate-600">
            Heading to <strong>{to}</strong>. Pick a service to open with your pickup &amp; drop-off prefilled.
          </p>
        ) : (
          <p className="mt-3 text-slate-600">
            From any provider page, tap <em>Get a ride</em> to come here with the destination prefilled. Or pick a starting place on the home page.
          </p>
        )}
      </div>

      {lat != null && lng != null && (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {uberUrl && (
            <a
              href={uberUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center px-6 py-5 rounded-xl bg-black text-white font-semibold text-lg hover:bg-slate-800"
            >
              Open Uber
            </a>
          )}
          {lyftUrl && (
            <a
              href={lyftUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center px-6 py-5 rounded-xl bg-pink-600 text-white font-semibold text-lg hover:bg-pink-700"
            >
              Open Lyft
            </a>
          )}
        </div>
      )}

      <div className="mt-10 bg-slate-50 border border-slate-200 rounded-xl p-5 text-sm text-slate-700">
        <p className="font-semibold text-slate-900 mb-1">v2 upgrade</p>
        <p>
          These buttons hand off to the consumer Uber and Lyft apps — fast to ship, free,
          but the user pays. For Phase 2 we plan to integrate <em>Uber Health</em> and
          <em> Lyft Pass for Healthcare</em>, which let a sponsoring partner cover the ride
          and support multi-stop trips (appointment → pharmacy → home).
          Both require a B2B contract — start those conversations early.
        </p>
      </div>

      <p className="mt-6 text-center">
        <Link href="/" className="text-brand-700 hover:underline">← Back home</Link>
      </p>
    </div>
  );
}
