"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

/**
 * Search form for the clinic finder. Simpler than the doctor SearchForm —
 * no specialty selector, no "accepting new patients" filter (FQHCs are
 * required to take all comers). Service filter is a single dropdown.
 */
export default function ClinicSearchForm() {
  const router = useRouter();
  const params = useSearchParams();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = new URLSearchParams();
    const zip = String(fd.get("zip") ?? "").trim();
    if (!zip) return;
    next.set("zip", zip);
    next.set("radius_miles", String(fd.get("radius_miles") ?? "10"));
    const service = String(fd.get("service") ?? "any");
    if (service && service !== "any") next.set("service", service);
    if (fd.get("fqhc_only") === "on") next.set("fqhc_only", "true");
    router.push(`/find-clinic?${next.toString()}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <label className="md:col-span-3 text-sm font-medium text-slate-700">
          ZIP code
          <input
            name="zip"
            type="text"
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            required
            defaultValue={params.get("zip") ?? ""}
            placeholder="64108"
            className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2 focus:border-brand-500 focus:ring-brand-500"
          />
        </label>

        <label className="md:col-span-2 text-sm font-medium text-slate-700">
          Radius
          <select
            name="radius_miles"
            defaultValue={params.get("radius_miles") ?? "10"}
            className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2"
          >
            <option value="3">3 mi</option>
            <option value="5">5 mi</option>
            <option value="10">10 mi</option>
            <option value="25">25 mi</option>
            <option value="50">50 mi</option>
          </select>
        </label>

        <label className="md:col-span-4 text-sm font-medium text-slate-700">
          Service
          <select
            name="service"
            defaultValue={params.get("service") ?? "any"}
            className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2"
          >
            <option value="any">Any service</option>
            <option value="primary_care">Primary care</option>
            <option value="dental">Dental</option>
            <option value="behavioral">Behavioral / mental health</option>
            <option value="prenatal">Prenatal</option>
            <option value="pharmacy">On-site pharmacy</option>
            <option value="vision">Vision</option>
            <option value="substance_use">Substance use</option>
          </select>
        </label>

        <label className="md:col-span-3 text-sm font-medium text-slate-700 flex items-center gap-2 md:pb-2">
          <input
            type="checkbox"
            name="fqhc_only"
            defaultChecked={params.get("fqhc_only") === "true"}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
          />
          FQHC only (excludes look-alikes &amp; safety-net hospitals)
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700"
        >
          <Search className="w-4 h-4" /> Search
        </button>
      </div>
    </form>
  );
}
