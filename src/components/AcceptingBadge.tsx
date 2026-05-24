import { CheckCircle2, XCircle, MinusCircle, HelpCircle } from "lucide-react";

const CONFIG: Record<
  string,
  { label: string; cls: string; Icon: typeof CheckCircle2 }
> = {
  yes:     { label: "Accepting new patients", cls: "bg-emerald-50 text-emerald-800 border-emerald-200", Icon: CheckCircle2 },
  no:      { label: "Not accepting patients", cls: "bg-rose-50 text-rose-800 border-rose-200",         Icon: XCircle },
  full:    { label: "Currently full",         cls: "bg-amber-50 text-amber-800 border-amber-200",      Icon: MinusCircle },
  unknown: { label: "Unverified",             cls: "bg-slate-50 text-slate-700 border-slate-200",      Icon: HelpCircle },
};

function ageLabel(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function AcceptingBadge({
  status,
  lastVerifiedAt,
  size = "sm",
}: {
  status: string;
  lastVerifiedAt: string | null;
  size?: "sm" | "md";
}) {
  const cfg = CONFIG[status] ?? CONFIG.unknown;
  const Icon = cfg.Icon;
  const pad = size === "md" ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap ${cfg.cls} ${pad}`}
    >
      <Icon className={size === "md" ? "w-4 h-4" : "w-3.5 h-3.5"} />
      {cfg.label}
      {lastVerifiedAt && status !== "unknown" && (
        <span className="opacity-70 font-normal">· {ageLabel(lastVerifiedAt)}</span>
      )}
    </span>
  );
}
