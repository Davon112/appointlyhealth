import Link from "next/link";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { inArray } from "drizzle-orm";
import AppointmentRequestForm from "@/components/AppointmentRequestForm";
import { smsIsStub } from "@/lib/sms";

export const dynamic = "force-dynamic";

const CONSENT_VERSION = "2026-05-24";

function parseClinicIds(sp: { clinic_id?: string; clinic_ids?: string }): number[] {
  const raw =
    sp.clinic_ids ??
    sp.clinic_id ??
    "";
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 3);
}

export default async function RequestAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ clinic_id?: string; clinic_ids?: string }>;
}) {
  const sp = await searchParams;
  const clinicIds = parseClinicIds(sp);

  if (clinicIds.length === 0) {
    redirect("/find-clinic");
  }

  const rows = await db
    .select()
    .from(schema.clinics)
    .where(inArray(schema.clinics.id, clinicIds));

  if (rows.length === 0) {
    redirect("/find-clinic");
  }

  // Preserve the order the URL specified so "your top 3" feels intentional.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = clinicIds
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => ({
      id: c.id,
      name: c.name,
      addressLine1: c.addressLine1,
      city: c.city,
      state: c.state,
      zip: c.zip,
      phone: c.phone,
      intakeEmail: c.intakeEmail,
    }));

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Request an appointment</h1>
        <p className="mt-2 text-slate-600">
          We'll send a short intake to the clinic{ordered.length > 1 ? "s" : ""} you picked.
          They'll typically call you back within 1–2 business days.
        </p>
      </div>

      <AppointmentRequestForm
        clinics={ordered}
        smsIsStub={smsIsStub()}
        turnstileSiteKey={turnstileSiteKey}
        consentVersion={CONSENT_VERSION}
      />

      <p className="mt-10 text-sm">
        <Link href="/find-clinic" className="text-brand-700 hover:underline">← Back to clinics</Link>
      </p>
    </div>
  );
}
