/**
 * POST /api/appointment-requests
 *
 * Submit an appointment-request form to 1..3 clinics. On the wire:
 * {
 *   firstName, lastName, dob, phone, email?,
 *   reasonCategory, reasonDetail?,
 *   insuranceSituation, preferredTimes: string[], language,
 *   clinicIds: number[],          // 1 to 3
 *   smsVerificationCode: string,  // re-verified server-side
 *   turnstileToken?: string,      // when Turnstile keys are configured
 *   consent: true,
 *   consentVersion: "2026-05-24",
 * }
 *
 * On success: { request_id, confirmation_page, sms_sent, deliveries: [{ clinic_id, status }] }
 *
 * Behavior:
 *  1. Validate everything (shape, content, consent).
 *  2. Re-verify the SMS code server-side (form might lie about UI state).
 *  3. Verify Turnstile token if TURNSTILE_SECRET is set.
 *  4. Rate-limit by phone hash + per clinic.
 *  5. Insert request row + per-clinic recipient rows.
 *  6. Send one email per clinic, update recipient row status.
 *  7. Fire confirmation SMS to the patient.
 *  8. Return summary. PHI cleanup is handled by the 24h cleanup job
 *     (scripts/cleanup-phi.ts), not inline here.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db, schema } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { normalizeUsPhone, checkVerification, sendAppointmentConfirmation } from "@/lib/sms";
import { sendAppointmentRequestEmail } from "@/lib/email";
import { checkRateLimits } from "@/lib/appointment-rate-limit";

export const runtime = "nodejs";

const CONSENT_VERSION = "2026-05-24";
const ALLOWED_REASONS = new Set(["new_patient", "annual", "specific", "followup", "other"]);
const ALLOWED_INSURANCE = new Set(["uninsured", "medicaid", "medicare", "commercial", "unknown"]);
const ALLOWED_TIMES = new Set([
  "weekday_morning", "weekday_afternoon", "weekday_evening", "weekend",
]);
const ALLOWED_LANGUAGES = new Set(["en", "es", "vi", "so", "bs"]);

type SubmitBody = {
  firstName?: string;
  lastName?: string;
  dob?: string;
  phone?: string;
  email?: string | null;
  reasonCategory?: string;
  reasonDetail?: string | null;
  insuranceSituation?: string;
  preferredTimes?: string[];
  language?: string;
  clinicIds?: number[];
  smsVerificationCode?: string;
  turnstileToken?: string;
  consent?: boolean;
  consentVersion?: string;
};

function hashPhone(phoneE164: string): string {
  const salt = process.env.IP_HASH_SALT ?? "appointly-dev-salt";
  return createHash("sha256").update(`${salt}:${phoneE164}`).digest("hex").slice(0, 64);
}

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true; // not configured → skip
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }).toString(),
    });
    const json = (await res.json()) as { success?: boolean };
    return !!json.success;
  } catch {
    return false;
  }
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ---------------- 1. shape validation ----------------
  const errors: string[] = [];
  const firstName = (body.firstName ?? "").trim();
  const lastName = (body.lastName ?? "").trim();
  const dob = (body.dob ?? "").trim();
  const reasonCategory = (body.reasonCategory ?? "").trim();
  const reasonDetailRaw = body.reasonDetail?.trim() ?? null;
  const insuranceSituation = (body.insuranceSituation ?? "").trim();
  const language = (body.language ?? "en").trim();
  const preferredTimes = Array.isArray(body.preferredTimes) ? body.preferredTimes : [];
  const clinicIds = Array.isArray(body.clinicIds)
    ? body.clinicIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const emailRaw = body.email?.trim() || null;
  const smsCode = (body.smsVerificationCode ?? "").trim();

  if (firstName.length < 1 || firstName.length > 100) errors.push("First name required (1–100 chars)");
  if (lastName.length < 1 || lastName.length > 100) errors.push("Last name required (1–100 chars)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    errors.push("Date of birth must be YYYY-MM-DD");
  } else {
    const d = new Date(dob);
    if (isNaN(d.getTime()) || d > new Date()) errors.push("Date of birth invalid");
  }
  const phoneE164 = body.phone ? normalizeUsPhone(body.phone) : null;
  if (!phoneE164) errors.push("Valid US phone required");
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) errors.push("Email address invalid");
  if (!ALLOWED_REASONS.has(reasonCategory)) errors.push("Invalid reason category");
  if ((reasonCategory === "specific" || reasonCategory === "other") && (!reasonDetailRaw || reasonDetailRaw.length === 0)) {
    errors.push("Please describe your reason for visit");
  }
  if (reasonDetailRaw && reasonDetailRaw.length > 200) errors.push("Reason detail must be ≤ 200 chars");
  if (!ALLOWED_INSURANCE.has(insuranceSituation)) errors.push("Invalid insurance choice");
  if (!ALLOWED_LANGUAGES.has(language)) errors.push("Invalid language choice");
  for (const t of preferredTimes) {
    if (!ALLOWED_TIMES.has(t)) errors.push(`Invalid preferred time: ${t}`);
  }
  if (clinicIds.length < 1 || clinicIds.length > 3) errors.push("Select 1–3 clinics");
  if (!body.consent) errors.push("You must accept the data-use consent to submit");
  if (body.consentVersion !== CONSENT_VERSION) errors.push("Consent has been updated — please reload the page");

  if (errors.length) {
    return NextResponse.json({ error: "Invalid form data", details: errors }, { status: 422 });
  }

  // ---------------- 2. SMS re-verification ----------------
  // The form already verified, but we don't trust client state.
  if (!/^\d{6}$/.test(smsCode)) {
    return NextResponse.json({ error: "Missing SMS verification code" }, { status: 422 });
  }
  const verify = await checkVerification(phoneE164!, smsCode);
  if (verify.kind === "error") {
    return NextResponse.json({ error: `SMS verification failed: ${verify.message}` }, { status: 502 });
  }
  if (!verify.valid) {
    return NextResponse.json({ error: "SMS code is invalid or expired" }, { status: 403 });
  }

  // ---------------- 3. Turnstile (skipped if not configured) ----------------
  const turnstileOk = await verifyTurnstile(body.turnstileToken, getClientIp(req));
  if (!turnstileOk) {
    return NextResponse.json({ error: "Bot-protection check failed" }, { status: 403 });
  }

  // ---------------- 4. Rate limit ----------------
  const phoneHash = hashPhone(phoneE164!);
  const rl = await checkRateLimits({ phoneHash, clinicIds });
  if (rl.kind === "phone_exceeded") {
    return NextResponse.json(
      {
        error: `Rate limit: ${rl.usedInWindow} of ${rl.limit} requests used from this phone in the last 24 hours.`,
      },
      { status: 429 },
    );
  }
  if (rl.kind === "clinic_exceeded") {
    return NextResponse.json(
      {
        error: `Clinic #${rl.clinicId} has received its daily intake cap from Appointly. Try again tomorrow.`,
      },
      { status: 429 },
    );
  }

  // ---------------- 5. Load clinics ----------------
  const clinicRows = await db
    .select()
    .from(schema.clinics)
    .where(inArray(schema.clinics.id, clinicIds));
  if (clinicRows.length !== clinicIds.length) {
    return NextResponse.json({ error: "One or more clinics not found" }, { status: 422 });
  }
  const clinicsById = new Map(clinicRows.map((c) => [c.id, c]));

  // ---------------- 6. Insert request row ----------------
  const [insertedRequest] = await db
    .insert(schema.appointmentRequests)
    .values({
      phoneHash,
      channel: "email",
      status: "pending",
      firstName,
      lastName,
      dob,
      phone: phoneE164!,
      email: emailRaw,
      reasonCategory,
      reasonDetail: reasonDetailRaw,
      insuranceSituation,
      preferredTimes: JSON.stringify(preferredTimes),
      language,
      consentVersion: CONSENT_VERSION,
      consentAcceptedAt: new Date(),
    })
    .returning();

  if (!insertedRequest) {
    return NextResponse.json({ error: "Failed to record request" }, { status: 500 });
  }

  // ---------------- 7. Insert recipient rows + send emails ----------------
  const deliveries: Array<{
    clinic_id: number;
    clinic_name: string;
    status: "sent" | "no_email" | "failed";
    error?: string;
  }> = [];

  for (const clinicId of clinicIds) {
    const clinic = clinicsById.get(clinicId)!;
    const [recipient] = await db
      .insert(schema.appointmentRequestRecipients)
      .values({
        requestId: insertedRequest.id,
        clinicId,
        intakeEmail: clinic.intakeEmail,
        status: "pending",
      })
      .returning();

    if (!clinic.intakeEmail && !process.env.APPOINTMENT_REQUEST_TEST_RECIPIENT) {
      await db
        .update(schema.appointmentRequestRecipients)
        .set({ status: "failed", lastError: "Clinic has no intake_email on file" })
        .where(eq(schema.appointmentRequestRecipients.id, recipient.id));
      deliveries.push({ clinic_id: clinicId, clinic_name: clinic.name, status: "no_email" });
      continue;
    }

    const sendOutcome = await sendAppointmentRequestEmail(
      {
        requestId: insertedRequest.id,
        firstName, lastName, dob,
        phone: phoneE164!,
        email: emailRaw,
        reasonCategory,
        reasonDetail: reasonDetailRaw,
        insuranceSituation,
        preferredTimes,
        language,
        clinic: {
          name: clinic.name,
          addressLine1: clinic.addressLine1,
          city: clinic.city,
          state: clinic.state,
          zip: clinic.zip,
          phone: clinic.phone,
        },
      },
      clinic.intakeEmail,
    );

    if (sendOutcome.kind === "ok") {
      await db
        .update(schema.appointmentRequestRecipients)
        .set({
          status: "sent",
          providerMessageId: sendOutcome.messageId,
          sentAt: new Date(),
        })
        .where(eq(schema.appointmentRequestRecipients.id, recipient.id));
      deliveries.push({ clinic_id: clinicId, clinic_name: clinic.name, status: "sent" });
    } else {
      const errMsg =
        sendOutcome.kind === "no_key" ? "RESEND_API_KEY not set" :
        sendOutcome.kind === "no_clinic_email" ? "No intake email and no test recipient" :
        sendOutcome.message;
      await db
        .update(schema.appointmentRequestRecipients)
        .set({ status: "failed", lastError: errMsg })
        .where(eq(schema.appointmentRequestRecipients.id, recipient.id));
      deliveries.push({
        clinic_id: clinicId,
        clinic_name: clinic.name,
        status: "failed",
        error: errMsg,
      });
    }
  }

  // ---------------- 8. Update request status + send confirmation SMS ----------------
  const sentCount = deliveries.filter((d) => d.status === "sent").length;
  const overallStatus =
    sentCount === 0 ? "failed" :
    sentCount === deliveries.length ? "sent" :
    "partial_failure";
  await db
    .update(schema.appointmentRequests)
    .set({ status: overallStatus, deliveredAt: sentCount > 0 ? new Date() : null })
    .where(eq(schema.appointmentRequests.id, insertedRequest.id));

  let smsSent = false;
  if (sentCount > 0) {
    const clinicList = deliveries
      .filter((d) => d.status === "sent")
      .map((d) => d.clinic_name)
      .join(", ");
    const smsBody =
      `Appointly: your appointment request was sent to ${clinicList}. ` +
      `They'll typically call you within 1–2 business days. Reply STOP to opt out.`;
    const sms = await sendAppointmentConfirmation(phoneE164!, smsBody);
    smsSent = sms.kind === "ok";
  }

  return NextResponse.json({
    request_id: insertedRequest.id,
    status: overallStatus,
    deliveries,
    sms_sent: smsSent,
    confirmation_page: `/request-appointment/sent?id=${insertedRequest.id}`,
  });
}
