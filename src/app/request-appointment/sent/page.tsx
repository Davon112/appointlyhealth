import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, AlertTriangle, MessageSquare, Mail } from "lucide-react";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AppointmentRequestSentPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const sp = await searchParams;
  const id = Number(sp.id);
  if (!Number.isInteger(id) || id <= 0) {
    redirect("/find-clinic");
  }

  const request = await db.query.appointmentRequests.findFirst({
    where: eq(schema.appointmentRequests.id, id),
  });
  if (!request) {
    redirect("/find-clinic");
  }

  // Per-clinic delivery rows (joined to clinic name).
  const recipients = await db
    .select({
      rid: schema.appointmentRequestRecipients.id,
      status: schema.appointmentRequestRecipients.status,
      sentAt: schema.appointmentRequestRecipients.sentAt,
      clinicId: schema.appointmentRequestRecipients.clinicId,
      clinicName: schema.clinics.name,
      clinicPhone: schema.clinics.phone,
    })
    .from(schema.appointmentRequestRecipients)
    .innerJoin(schema.clinics, eq(schema.clinics.id, schema.appointmentRequestRecipients.clinicId))
    .where(eq(schema.appointmentRequestRecipients.requestId, id));

  const sentCount = recipients.filter((r) => r.status === "sent").length;
  const anyFailed = recipients.some((r) => r.status === "failed");

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center">
        {sentCount > 0 ? (
          <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto" />
        ) : (
          <AlertTriangle className="w-14 h-14 text-amber-600 mx-auto" />
        )}
        <h1 className="mt-4 text-3xl font-bold text-slate-900">
          {sentCount > 0 ? "Request sent" : "Request couldn't be delivered"}
        </h1>
        <p className="mt-3 text-slate-600">
          {sentCount > 0 ? (
            <>
              Your appointment request reached {sentCount === recipients.length
                ? `all ${sentCount === 1 ? "" : sentCount + " "}clinic${sentCount === 1 ? "" : "s"} you selected`
                : `${sentCount} of ${recipients.length} clinics`}.
              They'll typically call you within 1–2 business days.
            </>
          ) : (
            <>
              We couldn't reach any of the clinics you selected by email.
              Try calling them directly using the phone numbers below.
            </>
          )}
        </p>
      </div>

      <section className="mt-8 bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Delivery status</h2>
        <ul className="space-y-3">
          {recipients.map((r) => {
            const sentTs = r.sentAt ? new Date(r.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
            return (
              <li key={r.rid} className="flex flex-wrap items-start justify-between gap-3 border border-slate-200 rounded-lg p-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{r.clinicName}</div>
                  {r.clinicPhone && (
                    <div className="text-xs text-slate-500">
                      Or call: <a href={`tel:${r.clinicPhone}`} className="hover:underline">{r.clinicPhone}</a>
                    </div>
                  )}
                </div>
                <Status status={r.status} sentAt={sentTs} />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-5 text-sm text-slate-700">
        <div className="flex items-start gap-3">
          <MessageSquare className="w-5 h-5 mt-0.5 text-slate-500 flex-shrink-0" />
          <div>
            <p className="font-semibold text-slate-900">What happens next</p>
            <ul className="mt-1 list-disc list-inside space-y-1">
              <li>You'll get a confirmation text shortly.</li>
              <li>The clinic{recipients.length > 1 ? "(s)" : ""} will reach out by email or phone within 1–2 business days.</li>
              <li>If you don't hear back in 3 business days, call the clinic directly using the number above.</li>
            </ul>
          </div>
        </div>
      </section>

      {anyFailed && (
        <section className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <p>
              Some clinics couldn't be reached by email. They likely don't publish a public intake address — please call them
              directly using the phone number above.
            </p>
          </div>
        </section>
      )}

      <p className="mt-10 text-sm text-center">
        <Link href="/find-doctor" className="text-brand-700 hover:underline">Find another provider →</Link>
      </p>
    </div>
  );
}

function Status({ status, sentAt }: { status: string; sentAt: string | null }) {
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Sent{sentAt && ` ${sentAt}`}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 px-2.5 py-0.5 text-xs font-medium">
        <AlertTriangle className="w-3.5 h-3.5" />
        Couldn't send
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-xs font-medium">
      Pending
    </span>
  );
}
