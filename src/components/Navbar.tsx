import Link from "next/link";
import { Stethoscope } from "lucide-react";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/find-doctor", label: "Find a Doctor" },
  { href: "/find-clinic", label: "Sliding-Scale Clinics" },
  { href: "/find-pharmacy", label: "Pharmacies" },
  { href: "/get-ride", label: "Get a Ride" },
];

export default function Navbar() {
  return (
    <nav className="border-b border-slate-200 bg-white sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-brand-700">
          <Stethoscope className="w-7 h-7" aria-hidden="true" />
          <span>Appointly</span>
        </Link>
        <ul className="hidden md:flex items-center gap-1">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700 transition-colors"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        {/* Mobile: simple links wrap. Real menu in v1.1. */}
        <ul className="flex md:hidden items-center gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="px-2 py-1 rounded-md text-xs font-medium text-slate-700 hover:text-brand-700 whitespace-nowrap"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
