"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, AlertTriangle, MessageSquare, CheckCircle2, X } from "lucide-react";

/**
 * A recipient is either a clinic (FQHC) or an individual provider. Both
 * shapes carry the same display fields; the `kind` discriminator + ID type
 * tells the API which table to look up on the server.
 */
export type Recipient =
  | {
      kind: "clinic";
      id: number;
      name: string;
      addressLine1: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      phone: string | null;
      intakeEmail: string | null;
    }
  | {
      kind: "provider";
      npi: string;
      name: string;
      addressLine1: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      phone: string | null;
      intakeEmail: string | null;
    };

type Props = {
  recipients: Recipient[];
  smsIsStub: boolean;
  turnstileSiteKey: string | null;
  consentVersion: string;
  /** When true, the form notes that emails are routed to the dev inbox. */
  testRecipientActive: boolean;
};

type FormState = {
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
  email: string;
  reasonCategory: string;
  reasonDetail: string;
  insuranceSituation: string;
  preferredTimes: string[];
  language: string;
};

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  dob: "",
  phone: "",
  email: "",
  reasonCategory: "",
  reasonDetail: "",
  insuranceSituation: "",
  preferredTimes: [],
  language: "en",
};

const DRAFT_KEY = "appointly:appointment-request-draft:v1";

const TIME_OPTIONS = [
  { value: "weekday_morning", label: "Weekday mornings" },
  { value: "weekday_afternoon", label: "Weekday afternoons" },
  { value: "weekday_evening", label: "Weekday evenings" },
  { value: "weekend", label: "Weekends" },
];
const INSURANCE_OPTIONS = [
  { value: "uninsured", label: "Uninsured" },
  { value: "medicaid", label: "Medicaid" },
  { value: "medicare", label: "Medicare" },
  { value: "commercial", label: "Commercial / employer plan" },
  { value: "unknown", label: "Not sure" },
];
const REASON_OPTIONS = [
  { value: "new_patient", label: "New patient — establishing care" },
  { value: "annual", label: "Annual physical / wellness" },
  { value: "specific", label: "Specific concern" },
  { value: "followup", label: "Follow-up on previous visit" },
  { value: "other", label: "Other" },
];
const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish (Español)" },
  { value: "vi", label: "Vietnamese" },
  { value: "so", label: "Somali" },
  { value: "bs", label: "Bosnian" },
];

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function AppointmentRequestForm({
  recipients,
  smsIsStub,
  turnstileSiteKey,
  consentVersion,
  testRecipientActive,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Recipient[]>(recipients);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [smsStep, setSmsStep] = useState<"idle" | "sent" | "verified">("idle");
  const [smsCode, setSmsCode] = useState("");
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsSending, setSmsSending] = useState(false);
  const [smsChecking, setSmsChecking] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // ---------- localStorage draft persistence (NO sms code, NO consent) ----------
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(DRAFT_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FormState>;
        setForm((f) => ({ ...f, ...parsed }));
      }
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      // ignore
    }
  }, [form]);

  // ---------- Turnstile widget (lazy load) ----------
  useEffect(() => {
    if (!turnstileSiteKey) return;
    if (document.getElementById("turnstile-script")) return;
    const s = document.createElement("script");
    s.id = "turnstile-script";
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }, [turnstileSiteKey]);

  // ---------- field helpers ----------
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const togglePreferred = (t: string) => {
    setForm((f) => ({
      ...f,
      preferredTimes: f.preferredTimes.includes(t)
        ? f.preferredTimes.filter((x) => x !== t)
        : [...f.preferredTimes, t],
    }));
  };
  const removeRecipient = (r: Recipient) =>
    setSelected((s) =>
      s.filter((x) =>
        x.kind === "clinic" && r.kind === "clinic"
          ? x.id !== r.id
          : x.kind === "provider" && r.kind === "provider"
          ? x.npi !== r.npi
          : true,
      ),
    );

  // ---------- validation ----------
  const formErrors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.lastName.trim()) e.lastName = "Required";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dob)) e.dob = "Use YYYY-MM-DD";
    if (form.phone.replace(/\D/g, "").length !== 10) e.phone = "Enter a 10-digit US number";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Looks invalid";
    if (!form.reasonCategory) e.reasonCategory = "Required";
    if ((form.reasonCategory === "specific" || form.reasonCategory === "other") && !form.reasonDetail.trim()) {
      e.reasonDetail = "Add a short description";
    }
    if (form.reasonDetail.length > 200) e.reasonDetail = "200 char max";
    if (!form.insuranceSituation) e.insuranceSituation = "Required";
    return e;
  }, [form]);
  const formIsValid = Object.keys(formErrors).length === 0;
  const canSendCode = form.phone.replace(/\D/g, "").length === 10;
  const canSubmit =
    formIsValid &&
    selected.length >= 1 &&
    selected.length <= 3 &&
    smsStep === "verified" &&
    consent &&
    !submitting;

  // ---------- SMS verification ----------
  async function sendCode() {
    setSmsError(null);
    setSmsSending(true);
    try {
      const res = await fetch("/api/appointment-requests/verify-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", phone: form.phone }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setSmsStep("sent");
    } catch (e) {
      setSmsError((e as Error).message);
    } finally {
      setSmsSending(false);
    }
  }
  async function checkCode() {
    setSmsError(null);
    setSmsChecking(true);
    try {
      const res = await fetch("/api/appointment-requests/verify-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check", phone: form.phone, code: smsCode }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (!j.valid) throw new Error("Code is wrong or expired");
      setSmsStep("verified");
    } catch (e) {
      setSmsError((e as Error).message);
    } finally {
      setSmsChecking(false);
    }
  }

  // ---------- submit ----------
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/appointment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          dob: form.dob,
          phone: form.phone,
          email: form.email.trim() || null,
          reasonCategory: form.reasonCategory,
          reasonDetail: (form.reasonCategory === "specific" || form.reasonCategory === "other")
            ? form.reasonDetail.trim()
            : null,
          insuranceSituation: form.insuranceSituation,
          preferredTimes: form.preferredTimes,
          language: form.language,
          clinicIds: selected.filter((r): r is Extract<Recipient, { kind: "clinic" }> => r.kind === "clinic").map((r) => r.id),
          providerNpis: selected.filter((r): r is Extract<Recipient, { kind: "provider" }> => r.kind === "provider").map((r) => r.npi),
          smsVerificationCode: smsCode,
          turnstileToken,
          consent: true,
          consentVersion,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        const detail = Array.isArray(j.details) ? `: ${j.details.join("; ")}` : "";
        throw new Error((j.error || `HTTP ${res.status}`) + detail);
      }
      // Clear the draft on success — patient's PHI shouldn't live in localStorage.
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
      router.push(j.confirmation_page as string);
    } catch (e) {
      setSubmitError((e as Error).message);
      setSubmitting(false);
    }
  }

  // ---------- render ----------
  const reasonShowsDetail = form.reasonCategory === "specific" || form.reasonCategory === "other";

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* Selected recipients */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Sending your request to {selected.length === 1 ? "this provider/clinic" : `these ${selected.length} recipients`}:
        </h2>
        <ul className="space-y-2">
          {selected.map((r) => {
            const addr = [r.addressLine1, r.city, r.state, r.zip].filter(Boolean).join(", ");
            const reachable = !!r.intakeEmail || testRecipientActive;
            const key = r.kind === "clinic" ? `c:${r.id}` : `p:${r.npi}`;
            return (
              <li key={key} className="flex items-start justify-between gap-3 border border-slate-200 rounded-lg p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-slate-900">{r.name}</div>
                    <span className={
                      "text-[10px] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded " +
                      (r.kind === "clinic" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700")
                    }>
                      {r.kind === "clinic" ? "Clinic" : "Provider"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 truncate">{addr || "Address unavailable"}</div>
                  {!reachable && (
                    <div className="mt-1 text-xs text-amber-700 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      No intake email on file. {r.phone ? `Please call ${r.phone}.` : "Cannot reach by email."}
                    </div>
                  )}
                </div>
                {selected.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRecipient(r)}
                    className="text-slate-400 hover:text-slate-700 flex-shrink-0"
                    aria-label={`Remove ${r.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {testRecipientActive && (
          <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <strong>Dev mode:</strong> all requests are routed to the configured test inbox until <code className="font-mono">APPOINTMENT_REQUEST_TEST_RECIPIENT</code> is removed in production env.
          </div>
        )}
      </section>

      {/* Patient */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">About you</h2>
        <p className="text-sm text-slate-500 mb-4">
          Clinics use this to match against existing records — they'll ask for it anyway.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="First name" error={formErrors.firstName}>
            <input
              type="text"
              autoComplete="given-name"
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-brand-500"
            />
          </Field>
          <Field label="Last name" error={formErrors.lastName}>
            <input
              type="text"
              autoComplete="family-name"
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-brand-500"
            />
          </Field>
          <Field label="Date of birth" hint="YYYY-MM-DD" error={formErrors.dob}>
            <input
              type="date"
              autoComplete="bday"
              value={form.dob}
              onChange={(e) => set("dob", e.target.value)}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-brand-500"
            />
          </Field>
          <Field label="Preferred language">
            <select
              value={form.language}
              onChange={(e) => set("language", e.target.value)}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-brand-500"
            >
              {LANGUAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>
      </section>

      {/* Contact + SMS verification */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">How clinics will reach you</h2>
        <p className="text-sm text-slate-500 mb-4">
          We verify your phone with a quick text before sending. Spam control + makes sure you actually get the callback.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Phone (US, 10 digits)" error={formErrors.phone}>
            <input
              type="tel"
              autoComplete="tel-national"
              inputMode="numeric"
              value={formatPhone(form.phone)}
              onChange={(e) => {
                set("phone", e.target.value.replace(/\D/g, "").slice(0, 10));
                if (smsStep !== "idle") { setSmsStep("idle"); setSmsCode(""); }
              }}
              placeholder="(816) 555-0100"
              className="block w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-brand-500"
            />
          </Field>
          <Field label="Email (optional)" hint="Clinic responses reply directly to you here" error={formErrors.email}>
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-brand-500"
            />
          </Field>
        </div>

        <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
          {smsStep === "idle" && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={sendCode}
                disabled={!canSendCode || smsSending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-600 text-white font-semibold disabled:opacity-50 hover:bg-brand-700"
              >
                {smsSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                Send verification code
              </button>
              <span className="text-sm text-slate-600">We'll text you a 6-digit code.</span>
            </div>
          )}
          {smsStep === "sent" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                We sent a 6-digit code to <strong>{formatPhone(form.phone)}</strong>.
                {smsIsStub && <span className="ml-1 text-amber-700"> [DEV: use code <code className="font-mono">000000</code>]</span>}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="font-mono w-32 rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={checkCode}
                  disabled={smsCode.length !== 6 || smsChecking}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-600 text-white font-semibold disabled:opacity-50 hover:bg-brand-700"
                >
                  {smsChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Verify
                </button>
                <button
                  type="button"
                  onClick={sendCode}
                  className="text-sm text-brand-700 hover:underline"
                >
                  Resend
                </button>
              </div>
            </div>
          )}
          {smsStep === "verified" && (
            <div className="text-sm text-emerald-700 inline-flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Phone verified.
            </div>
          )}
          {smsError && (
            <div className="mt-3 text-sm text-rose-700 inline-flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {smsError}
            </div>
          )}
        </div>
      </section>

      {/* Visit */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">The visit</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Reason for visit" error={formErrors.reasonCategory}>
            <select
              value={form.reasonCategory}
              onChange={(e) => set("reasonCategory", e.target.value)}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-brand-500"
            >
              <option value="">— Select —</option>
              {REASON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Insurance situation" hint="FQHCs use this to bill on a sliding scale" error={formErrors.insuranceSituation}>
            <select
              value={form.insuranceSituation}
              onChange={(e) => set("insuranceSituation", e.target.value)}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-brand-500"
            >
              <option value="">— Select —</option>
              {INSURANCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>

        {reasonShowsDetail && (
          <div className="mt-4">
            <Field label="Briefly, what's going on?" hint="200 character max — clinics use this to prep" error={formErrors.reasonDetail}>
              <textarea
                value={form.reasonDetail}
                onChange={(e) => set("reasonDetail", e.target.value.slice(0, 200))}
                rows={3}
                className="block w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-brand-500"
              />
              <div className="text-xs text-slate-500 mt-1 text-right">{form.reasonDetail.length}/200</div>
            </Field>
          </div>
        )}

        <div className="mt-4">
          <div className="text-sm font-medium text-slate-700 mb-2">Preferred times (pick any)</div>
          <div className="grid grid-cols-2 gap-2">
            {TIME_OPTIONS.map((t) => (
              <label
                key={t.value}
                className={
                  "flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer text-sm " +
                  (form.preferredTimes.includes(t.value)
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50")
                }
              >
                <input
                  type="checkbox"
                  checked={form.preferredTimes.includes(t.value)}
                  onChange={() => togglePreferred(t.value)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* Turnstile (renders only when site key is set) */}
      {turnstileSiteKey && (
        <section>
          <div
            className="cf-turnstile"
            data-sitekey={turnstileSiteKey}
            data-callback="appointlyTurnstileCb"
          />
          {/* The Turnstile script calls window.appointlyTurnstileCb(token).
              We define it on mount so the form's local state updates. */}
          <TurnstileBridge onToken={setTurnstileToken} />
        </section>
      )}

      {/* Consent */}
      <section className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-950 space-y-2">
            <p className="font-semibold">What happens to the info you just entered:</p>
            <ul className="list-disc list-inside space-y-1 text-amber-900">
              <li>We send your name, date of birth, contact info, reason for visit, insurance situation, and preferred times to the recipient{selected.length > 1 ? "s" : ""} above — and nothing else.</li>
              <li>Appointly does <strong>not</strong> keep this information. We delete it from our database within 24 hours of delivery.</li>
              <li>The clinic replies directly to your email (if provided) or calls you. We never see the conversation.</li>
              <li>You'll get a confirmation text once your request is sent.</li>
            </ul>
            <label className="flex items-start gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 rounded border-amber-400 text-amber-700 focus:ring-amber-500"
              />
              <span className="font-medium text-amber-950">
                I authorize Appointly to send this request to the selected recipient{selected.length > 1 ? "s" : ""}.
              </span>
            </label>
          </div>
        </div>
      </section>

      {/* Submit */}
      {submitError && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-900 inline-flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {submitError}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-brand-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-700"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Send request
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {hint && <span className="ml-2 text-xs text-slate-500">{hint}</span>}
      <div className="mt-1">{children}</div>
      {error && <div className="mt-1 text-xs text-rose-700">{error}</div>}
    </label>
  );
}

/**
 * Bridges Cloudflare Turnstile's global-callback API into React state.
 */
function TurnstileBridge({ onToken }: { onToken: (t: string) => void }) {
  useEffect(() => {
    (window as unknown as { appointlyTurnstileCb?: (t: string) => void }).appointlyTurnstileCb = (token) => onToken(token);
    return () => {
      delete (window as unknown as { appointlyTurnstileCb?: (t: string) => void }).appointlyTurnstileCb;
    };
  }, [onToken]);
  return null;
}
