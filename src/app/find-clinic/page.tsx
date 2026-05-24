import Link from "next/link";
import { HeartHandshake, ExternalLink } from "lucide-react";

export default function FindClinicPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <HeartHandshake className="w-12 h-12 text-brand-600 mx-auto mb-4" />
      <h1 className="text-3xl font-bold text-slate-900">Sliding-Scale Clinics</h1>
      <p className="mt-3 text-slate-600">
        Coming in Phase 2 of the build. This page will let you search the HRSA
        Health Center Service Delivery Sites — Federally Qualified Health
        Centers (FQHCs) and look-alikes — all of which are federally required
        to offer sliding-fee-scale care.
      </p>
      <div className="mt-6 inline-flex flex-col items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-5">
        <p className="text-sm text-slate-700">In the meantime, search the official HRSA locator:</p>
        <a
          href="https://findahealthcenter.hrsa.gov/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700"
        >
          Find a Health Center (HRSA) <ExternalLink className="w-4 h-4" />
        </a>
      </div>
      <p className="mt-8">
        <Link href="/" className="text-brand-700 hover:underline">← Back home</Link>
      </p>
    </div>
  );
}
