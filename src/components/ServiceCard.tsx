import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
  title: string;
  blurb: string;
  href: string;
  icon: LucideIcon;
  available: boolean; // false = coming-in-v2 stub
  flipTitle?: string;
  flipBlurb?: string;
};

/**
 * Accessible flip-card. On hover/focus the card flips to reveal the
 * "why this matters" copy. Tapping the card navigates.
 *
 * Replaces the Bootstrap `image-flip` pattern from the original home.html
 * — no jQuery, no Bootstrap, keyboard-accessible.
 */
export default function ServiceCard({
  title,
  blurb,
  href,
  icon: Icon,
  available,
  flipTitle,
  flipBlurb,
}: Props) {
  return (
    <Link
      href={href}
      className="group block [perspective:1000px]"
      aria-label={`${title}: ${blurb}`}
    >
      <div
        className={`
          relative h-56 w-full rounded-xl
          transition-transform duration-500 ease-out
          [transform-style:preserve-3d]
          group-hover:[transform:rotateY(180deg)]
          group-focus-visible:[transform:rotateY(180deg)]
        `}
      >
        {/* Front */}
        <div
          className={`
            absolute inset-0 rounded-xl border border-slate-200 bg-white
            p-6 flex flex-col items-center text-center justify-center
            shadow-sm [backface-visibility:hidden]
          `}
        >
          <Icon className="w-10 h-10 text-brand-600 mb-3" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{blurb}</p>
          {!available && (
            <span className="mt-3 inline-block text-[10px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
              Coming soon
            </span>
          )}
        </div>
        {/* Back */}
        <div
          className={`
            absolute inset-0 rounded-xl bg-brand-600 text-white
            p-6 flex flex-col items-center text-center justify-center
            shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]
          `}
        >
          <h3 className="text-lg font-semibold">{flipTitle ?? title}</h3>
          <p className="mt-2 text-sm text-brand-50">{flipBlurb ?? blurb}</p>
          <span className="mt-4 text-sm font-medium underline underline-offset-4">
            {available ? "Open →" : "Preview →"}
          </span>
        </div>
      </div>
    </Link>
  );
}
