"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

/**
 * Pharmacy search form — same UX pattern as ClinicSearchForm, but trimmed
 * to ZIP + radius. No service filter; Google Places' pharmacy type is
 * the entirety of our filter.
 */
export default function PharmacySearchForm() {
  const router = useRouter();
  const params = useSearchParams();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = new URLSearchParams();
    const zip = String(fd.get("zip") ?? "").trim();
    if (!zip) return;
    next.set("zip", zip);
    next.set("radius_miles", String(fd.get("radius_miles") ?? "5"));
    if (fd.get("open_now") === "on") next.set("open_now", "true");
    router.push(`/find-pharmacy?${next.toString()}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <label className="md:col-span-4 text-sm font-medium text-slate-700">
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

        <label className="md:col-span-3 text-sm font-medium text-slate-700">
          Radius
          <select
            name="radius_miles"
            defaultValue={params.get("radius_miles") ?? "5"}
            className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2"
          >
            <option value="1">1 mi</option>
            <option value="3">3 mi</option>
            <option value="5">5 mi</option>
            <option value="10">10 mi</option>
            <option value="25">25 mi</option>
          </select>
        </label>

        <label className="md:col-span-3 text-sm font-medium text-slate-700 flex items-center gap-2 md:pb-2">
          <input
            type="checkbox"
            name="open_now"
            defaultChecked={params.get("open_now") === "true"}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
          />
          Open now only
        </label>

        <div className="md:col-span-2">
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700"
          >
            <Search className="w-4 h-4" /> Search
          </button>
        </div>
      </div>
    </form>
  );
}
