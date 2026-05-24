"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";

type Status = "yes" | "no" | "full";

const OPTIONS: Array<{ status: Status; label: string; Icon: typeof CheckCircle2; cls: string }> = [
  { status: "yes",  label: "They're accepting patients", Icon: CheckCircle2, cls: "border-emerald-300 hover:bg-emerald-50 text-emerald-800" },
  { status: "full", label: "They're full right now",     Icon: MinusCircle,  cls: "border-amber-300 hover:bg-amber-50 text-amber-800" },
  { status: "no",   label: "They're not accepting",      Icon: XCircle,      cls: "border-rose-300 hover:bg-rose-50 text-rose-800" },
];

export default function VerifyButton({ npi }: { npi: string }) {
  const [submitting, setSubmitting] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Status | null>(null);
  const router = useRouter();

  async function submit(status: Status) {
    setSubmitting(status);
    setError(null);
    try {
      const res = await fetch(`/api/providers/${npi}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Something went wrong.");
        setSubmitting(null);
        return;
      }
      setDone(status);
      // Refresh the server-rendered page to show the updated badge.
      router.refresh();
    } catch {
      setError("Network error. Try again?");
    } finally {
      setSubmitting(null);
    }
  }

  if (done) {
    return (
      <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
        Thanks for reporting. Your update helps the next person searching here.
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-slate-700 mb-3">
        Did you call this provider? Help the next person by sharing what you heard:
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {OPTIONS.map(({ status, label, Icon, cls }) => (
          <button
            key={status}
            type="button"
            onClick={() => submit(status)}
            disabled={!!submitting}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 bg-white text-sm font-medium transition-colors disabled:opacity-50 ${cls}`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="text-left">{submitting === status ? "Sending..." : label}</span>
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-sm text-rose-700">{error}</p>
      )}
    </div>
  );
}
