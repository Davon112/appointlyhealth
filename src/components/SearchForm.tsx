"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

export default function SearchForm() {
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
    next.set("specialty", String(fd.get("specialty") ?? "all_primary"));
    if (fd.get("accepting_only") === "on") next.set("accepting_only", "true");
    router.push(`/find-doctor?${next.toString()}`);
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
            placeholder="78701"
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
          Specialty
          <select
            name="specialty"
            defaultValue={params.get("specialty") ?? "all_primary"}
            className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2"
          >
            <option value="all_primary">All primary care</option>
            <option value="family_medicine">Family medicine</option>
            <option value="internal_medicine">Internal medicine</option>
            <option value="pediatrics">Pediatrics</option>
            <option value="primary_care">Nurse practitioners (primary care)</option>
          </select>
        </label>

        <label className="md:col-span-3 text-sm font-medium text-slate-700 flex items-center gap-2 md:pb-2">
          <input
            type="checkbox"
            name="accepting_only"
            defaultChecked={params.get("accepting_only") === "true"}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
          />
          Accepting new patients only
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
