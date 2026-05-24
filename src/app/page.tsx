import {
  Stethoscope,
  CalendarPlus,
  CalendarCheck,
  HeartHandshake,
  Car,
  Pill,
} from "lucide-react";
import ServiceCard from "@/components/ServiceCard";
import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-4">
      {/* Hero */}
      <section className="pt-16 pb-12 text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-slate-900 leading-tight">
          Healthcare.{" "}
          <span className="text-brand-600 italic font-semibold">
            but simple.
          </span>
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-lg text-slate-600">
          Find a doctor who's actually accepting patients. Get a ride to your
          appointment. Pick up your prescription on the way home. All in one
          place.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/find-doctor"
            className="px-6 py-3 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-colors"
          >
            Find a doctor near me
          </Link>
          <Link
            href="/find-clinic"
            className="px-6 py-3 rounded-lg border-2 border-brand-600 text-brand-700 font-semibold hover:bg-brand-50 transition-colors"
          >
            No insurance? Start here
          </Link>
        </div>
      </section>

      {/* Services */}
      <section className="pb-20">
        <h2 className="text-3xl font-bold text-slate-900 text-center mb-2">
          Our Services
        </h2>
        <p className="text-center text-slate-600 mb-10">
          Hover any card to see how it works.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <ServiceCard
            title="Find a Doctor"
            blurb="Search PCPs in your area accepting new patients."
            href="/find-doctor"
            icon={Stethoscope}
            available={true}
            flipTitle="We do the legwork."
            flipBlurb="No more calling ten offices to find out who's taking patients."
          />
          <ServiceCard
            title="Sliding-Scale Clinics"
            blurb="Clinics that work with you and your income."
            href="/find-clinic"
            icon={HeartHandshake}
            available={true}
            flipTitle="No insurance? No problem."
            flipBlurb="Federally Qualified Health Centers offer care on a sliding fee scale."
          />
          <ServiceCard
            title="Get a Ride"
            blurb="Round-trip rideshare to your appointment."
            href="/get-ride"
            icon={Car}
            available={true}
            flipTitle="We've got transportation covered."
            flipBlurb="Hand off to Uber or Lyft with pickup and drop-off prefilled."
          />
          <ServiceCard
            title="Pharmacies"
            blurb="Pharmacies near you, ready when you need them."
            href="/find-pharmacy"
            icon={Pill}
            available={true}
            flipTitle="Skip the line."
            flipBlurb="Find the closest pharmacy and get prescription-ready alerts."
          />
          <ServiceCard
            title="Schedule Appointment"
            blurb="Book your next visit in just a couple clicks."
            href="/schedule"
            icon={CalendarPlus}
            available={false}
            flipTitle="Coming in v2."
            flipBlurb="Scheduling requires partner integrations — we're working on it."
          />
          <ServiceCard
            title="My Appointments"
            blurb="See your upcoming visits at a glance."
            href="/my-appointments"
            icon={CalendarCheck}
            available={false}
            flipTitle="Coming in v2."
            flipBlurb="Requires accounts, which we'll add once we're HIPAA-ready."
          />
        </div>
      </section>
    </div>
  );
}
