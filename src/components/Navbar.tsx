"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Stethoscope, Menu, X } from "lucide-react";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/find-doctor", label: "Find a Doctor" },
  { href: "/find-clinic", label: "Sliding-Scale Clinics" },
  { href: "/find-pharmacy", label: "Pharmacies" },
  { href: "/get-ride", label: "Get a Ride" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape — keyboard accessibility.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // When the menu is open on mobile, lock body scroll so the page underneath
  // doesn't drift around while the user is in the panel.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <nav className="border-b border-slate-200 bg-white sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-xl text-brand-700"
          onClick={() => setOpen(false)}
        >
          <Stethoscope className="w-7 h-7" aria-hidden="true" />
          <span>Appointly</span>
        </Link>

        {/* Desktop: horizontal nav */}
        <ul className="hidden md:flex items-center gap-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "px-3 py-2 rounded-md text-sm font-medium transition-colors " +
                    (active
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-700 hover:bg-brand-50 hover:text-brand-700")
                  }
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Mobile: hamburger toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md text-slate-700 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600 focus-visible:outline-offset-2"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile panel — slides under the nav bar. Hidden on md+. */}
      <div
        id="mobile-nav"
        className={
          "md:hidden overflow-hidden transition-[max-height,opacity] duration-200 ease-out border-t border-slate-200 " +
          (open ? "max-h-96 opacity-100" : "max-h-0 opacity-0 pointer-events-none")
        }
      >
        <ul className="px-4 py-2 flex flex-col gap-1 bg-white">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "block px-3 py-3 rounded-md text-base font-medium transition-colors " +
                    (active
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-800 hover:bg-brand-50 hover:text-brand-700")
                  }
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

/**
 * Active when pathname matches exactly (for /) or starts with the link's
 * path (for /find-doctor matching /find-doctor/:npi).
 */
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
