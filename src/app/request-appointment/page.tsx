import Link from "next/link";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { inArray, eq } from "drizzle-orm";
import AppointmentRequestForm, { type Recipient } from "@/components/AppointmentRequestForm";
import { smsIsStub } from "@/lib/sms";
import { cleanSpecialty, formatProviderName, lookupKcPractice } from "@/lib/provider-display";

export const dynamic = "force-dynamic";

const CONSENT_VERSION = "2026-05-24";
const MAX_RECIPIENTS = 3;

function parseIntList(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}
function parseNpiList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{10}$/.test(s));
}

export default async function RequestAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    clinic_id?: string;
    clinic_ids?: string;
    provider_npi?: string;
    provider_npis?: string;
  }>;
}) {
  const sp = await searchParams;
  const clinicIds = [
    ...parseIntList(sp.clinic_ids),
    ...parseIntList(sp.clinic_id),
  ];
  const providerNpis = [
    ...parseNpiList(sp.provider_npis),
    ...parseNpiList(sp.provider_npi),
  ];

  if (clinicIds.length === 0 && providerNpis.length === 0) {
    redirect("/find-doctor");
  }

  // Cap total recipients at 3.
  const totalRequested = clinicIds.length + providerNpis.length;
  const trimmedClinicIds = totalRequested > MAX_RECIPIENTS
    ? clinicIds.slice(0, Math.max(0, MAX_RECIPIENTS - providerNpis.length))
    : clinicIds;
  const trimmedProviderNpis = totalRequested > MAX_RECIPIENTS
    ? providerNpis.slice(0, MAX_RECIPIENTS - trimmedClinicIds.length)
    : providerNpis;

  // Load both kinds in parallel.
  const [clinicRows, providerRows] = await Promise.all([
    trimmedClinicIds.length
      ? db.select().from(schema.clinics).where(inArray(schema.clinics.id, trimmedClinicIds))
      : Promise.resolve([]),
    trimmedProviderNpis.length
      ? db
          .select({
            npi: schema.providers.npi,
            firstName: schema.providers.firstName,
            lastName: schema.providers.lastName,
            organizationName: schema.providers.organizationName,
            credential: schema.providers.credential,
            primaryTaxonomy: schema.providers.primaryTaxonomy,
            phone: schema.providers.phone,
            intakeEmail: schema.providers.intakeEmail,
            addressLine1: schema.providerLocations.addressLine1,
            city: schema.providerLocations.city,
            state: schema.providerLocations.state,
            zip: schema.providerLocations.zip,
          })
          .from(schema.providers)
          .leftJoin(
            schema.providerLocations,
            eq(schema.providerLocations.npi, schema.providers.npi),
          )
          .where(inArray(schema.providers.npi, trimmedProviderNpis))
      : Promise.resolve([]),
  ]);

  if (clinicRows.length === 0 && providerRows.length === 0) {
    redirect("/find-doctor");
  }

  // Build recipients list, preserving the URL order so "your top 3" feels
  // intentional. Note: leftJoin on providerLocations can return multiple rows
  // per provider if a provider has multiple practice locations — we dedup
  // by NPI and keep the first row, which is the most common case.
  const clinicById = new Map(clinicRows.map((c) => [c.id, c]));
  const providerByNpi = new Map<string, typeof providerRows[number]>();
  for (const p of providerRows) {
    if (!providerByNpi.has(p.npi)) providerByNpi.set(p.npi, p);
  }

  const ordered: Recipient[] = [];
  for (const id of trimmedClinicIds) {
    const c = clinicById.get(id);
    if (!c) continue;
    ordered.push({
      kind: "clinic",
      id: c.id,
      name: c.name,
      addressLine1: c.addressLine1,
      city: c.city,
      state: c.state,
      zip: c.zip,
      phone: c.phone,
      intakeEmail: c.intakeEmail,
    });
  }
  for (const npi of trimmedProviderNpis) {
    const p = providerByNpi.get(npi);
    if (!p) continue;
    // Hospital affiliation is best-effort. Use the matched practice name if
    // the address resolves, otherwise just show the person's name.
    const practice = lookupKcPractice(p.addressLine1);
    const personName = formatProviderName({
      firstName: p.firstName,
      lastName: p.lastName,
      organizationName: p.organizationName,
      credential: p.credential,
    });
    const specialty = cleanSpecialty(p.primaryTaxonomy);
    const labelParts = [personName];
    if (specialty) labelParts.push(`(${specialty})`);
    if (practice) labelParts.push(`— ${practice}`);
    ordered.push({
      kind: "provider",
      npi: p.npi,
      name: labelParts.join(" "),
      addressLine1: p.addressLine1,
      city: p.city,
      state: p.state,
      zip: p.zip,
      phone: p.phone,
      intakeEmail: p.intakeEmail,
    });
  }

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;
  const testRecipientActive = !!process.env.APPOINTMENT_REQUEST_TEST_RECIPIENT;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Request an appointment</h1>
        <p className="mt-2 text-slate-600">
          We'll send a short intake to {ordered.length === 1 ? "the recipient" : "the recipients"} you picked.
          They'll typically call you back within 1–2 business days.
        </p>
      </div>

      <AppointmentRequestForm
        recipients={ordered}
        smsIsStub={smsIsStub()}
        turnstileSiteKey={turnstileSiteKey}
        consentVersion={CONSENT_VERSION}
        testRecipientActive={testRecipientActive}
      />

      <p className="mt-10 text-sm">
        <Link
          href={trimmedProviderNpis.length > 0 ? "/find-doctor" : "/find-clinic"}
          className="text-brand-700 hover:underline"
        >
          ← Back
        </Link>
      </p>
    </div>
  );
}
