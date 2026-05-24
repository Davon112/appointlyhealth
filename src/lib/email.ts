/**
 * Email channel — Resend wrapper + appointment-request templates.
 *
 * Design notes:
 *  - One email per clinic (not BCC) so each clinic can Reply-To the patient
 *    and the patient's response goes only to them.
 *  - From: requests@appointlyhealth.org once the domain is verified in
 *    Resend. Until then APPOINTMENT_REQUEST_FROM defaults to
 *    onboarding@resend.dev (Resend's sandbox sender that requires no DNS).
 *  - Reply-To: the patient's email, so clinic responses go straight to them
 *    and Appointly never sees the body of the conversation.
 *  - APPOINTMENT_REQUEST_TEST_RECIPIENT overrides every `to:` value. Use
 *    while developing or before launch so we never send to a real clinic
 *    with a typo'd payload.
 */
import { Resend } from "resend";

export type AppointmentRequestEmailPayload = {
  // Patient
  firstName: string;
  lastName: string;
  dob: string; // ISO YYYY-MM-DD
  phone: string; // E.164
  email: string | null;
  reasonCategory: string;
  reasonDetail: string | null;
  insuranceSituation: string;
  preferredTimes: string[]; // canonical slugs
  language: string;
  // Clinic
  clinic: {
    name: string;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    phone: string | null;
  };
  // Misc
  requestId: number;
};

const INSURANCE_LABEL: Record<string, string> = {
  uninsured: "Uninsured",
  medicaid: "Medicaid",
  medicare: "Medicare",
  commercial: "Commercial / employer plan",
  unknown: "Not sure",
};
const REASON_LABEL: Record<string, string> = {
  new_patient: "New patient — establishing care",
  annual: "Annual physical / wellness visit",
  specific: "Specific concern",
  followup: "Follow-up on previous visit",
  other: "Other",
};
const TIME_LABEL: Record<string, string> = {
  weekday_morning: "Weekday mornings",
  weekday_afternoon: "Weekday afternoons",
  weekday_evening: "Weekday evenings",
  weekend: "Weekends",
};
const LANGUAGE_LABEL: Record<string, string> = {
  en: "English",
  es: "Spanish (Español)",
  vi: "Vietnamese",
  so: "Somali",
  bs: "Bosnian",
};

function formatPhone(e164: string): string {
  // +18165550100 → (816) 555-0100
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return e164;
}

function isLowIncomeFlag(insurance: string): boolean {
  return insurance === "uninsured" || insurance === "medicaid";
}

function buildSubject(p: AppointmentRequestEmailPayload): string {
  const flag = isLowIncomeFlag(p.insuranceSituation) ? " [sliding-scale candidate]" : "";
  return `Appointment request — ${p.firstName} ${p.lastName}${flag}`;
}

function buildPlainText(p: AppointmentRequestEmailPayload): string {
  const lines: string[] = [];
  lines.push(`APPOINTMENT REQUEST`);
  lines.push(`From: Appointly (appointlyhealth.org) on behalf of a patient`);
  lines.push(``);
  lines.push(`PATIENT`);
  lines.push(`  Name:   ${p.firstName} ${p.lastName}`);
  lines.push(`  DOB:    ${p.dob}`);
  lines.push(`  Phone:  ${formatPhone(p.phone)}`);
  if (p.email) lines.push(`  Email:  ${p.email}`);
  lines.push(`  Language: ${LANGUAGE_LABEL[p.language] ?? p.language}`);
  lines.push(``);
  lines.push(`VISIT`);
  lines.push(`  Reason:  ${REASON_LABEL[p.reasonCategory] ?? p.reasonCategory}`);
  if (p.reasonDetail) lines.push(`  Detail:  ${p.reasonDetail}`);
  lines.push(`  Insurance: ${INSURANCE_LABEL[p.insuranceSituation] ?? p.insuranceSituation}`);
  if (isLowIncomeFlag(p.insuranceSituation)) {
    lines.push(`           >>> Sliding-scale candidate <<<`);
  }
  const times = p.preferredTimes.map((t) => TIME_LABEL[t] ?? t);
  lines.push(`  Preferred times: ${times.length ? times.join(", ") : "Any"}`);
  lines.push(``);
  lines.push(`HOW TO RESPOND`);
  lines.push(`  Reply to this email to reach the patient directly.`);
  lines.push(`  Or call them at ${formatPhone(p.phone)}.`);
  lines.push(``);
  lines.push(`-- `);
  lines.push(`This message was sent via Appointly (appointlyhealth.org), a public-good`);
  lines.push(`tool that helps Kansas City patients reach primary care. We are not`);
  lines.push(`affiliated with ${p.clinic.name}. Reference: request #${p.requestId}.`);
  lines.push(`To opt out of future requests, reply STOP and we'll suppress this clinic.`);
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(p: AppointmentRequestEmailPayload): string {
  const e = escapeHtml;
  const lowIncome = isLowIncomeFlag(p.insuranceSituation);
  const times = p.preferredTimes.map((t) => TIME_LABEL[t] ?? t);
  const detailBlock = p.reasonDetail
    ? `<tr><td style="padding:4px 12px 4px 0;color:#475569;vertical-align:top;">Detail</td><td style="padding:4px 0;color:#0f172a;">${e(p.reasonDetail)}</td></tr>`
    : "";
  const emailBlock = p.email
    ? `<tr><td style="padding:4px 12px 4px 0;color:#475569;">Email</td><td style="padding:4px 0;"><a href="mailto:${e(p.email)}" style="color:#0369a1;">${e(p.email)}</a></td></tr>`
    : "";
  const slidingScaleBanner = lowIncome
    ? `<div style="background:#fef3c7;border:1px solid #fbbf24;color:#78350f;padding:10px 14px;border-radius:8px;margin:16px 0;font-size:14px;"><strong>Sliding-scale candidate.</strong> Patient indicated they are ${e(INSURANCE_LABEL[p.insuranceSituation])}.</div>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:24px 0;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;">
<tr><td style="padding:24px 28px 12px 28px;">
  <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Appointment request</div>
  <h1 style="margin:6px 0 0 0;font-size:22px;font-weight:700;color:#0f172a;">${e(p.firstName)} ${e(p.lastName)}</h1>
  <div style="margin-top:4px;font-size:14px;color:#475569;">sent via Appointly — appointlyhealth.org</div>
</td></tr>
<tr><td style="padding:0 28px;">${slidingScaleBanner}</td></tr>
<tr><td style="padding:8px 28px 0 28px;">
  <h2 style="font-size:13px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;margin:8px 0;">Patient</h2>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-size:15px;line-height:1.5;">
    <tr><td style="padding:4px 12px 4px 0;color:#475569;">DOB</td><td style="padding:4px 0;color:#0f172a;">${e(p.dob)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#475569;">Phone</td><td style="padding:4px 0;"><a href="tel:${e(p.phone)}" style="color:#0369a1;font-weight:600;">${e(formatPhone(p.phone))}</a></td></tr>
    ${emailBlock}
    <tr><td style="padding:4px 12px 4px 0;color:#475569;">Language</td><td style="padding:4px 0;color:#0f172a;">${e(LANGUAGE_LABEL[p.language] ?? p.language)}</td></tr>
  </table>
</td></tr>
<tr><td style="padding:16px 28px 0 28px;">
  <h2 style="font-size:13px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;margin:8px 0;">Visit</h2>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-size:15px;line-height:1.5;">
    <tr><td style="padding:4px 12px 4px 0;color:#475569;vertical-align:top;">Reason</td><td style="padding:4px 0;color:#0f172a;">${e(REASON_LABEL[p.reasonCategory] ?? p.reasonCategory)}</td></tr>
    ${detailBlock}
    <tr><td style="padding:4px 12px 4px 0;color:#475569;">Insurance</td><td style="padding:4px 0;color:#0f172a;">${e(INSURANCE_LABEL[p.insuranceSituation] ?? p.insuranceSituation)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#475569;vertical-align:top;">Times</td><td style="padding:4px 0;color:#0f172a;">${times.length ? e(times.join(", ")) : "Any"}</td></tr>
  </table>
</td></tr>
<tr><td style="padding:20px 28px;">
  <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;font-size:14px;color:#0f172a;line-height:1.5;">
    <strong>How to respond:</strong> reply to this email to reach the patient directly, or call them at <a href="tel:${e(p.phone)}" style="color:#0369a1;font-weight:600;">${e(formatPhone(p.phone))}</a>.
  </div>
</td></tr>
<tr><td style="padding:0 28px 24px 28px;">
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0 14px 0;" />
  <div style="font-size:12px;color:#64748b;line-height:1.5;">
    Sent via <a href="https://appointlyhealth.org" style="color:#64748b;text-decoration:underline;">Appointly</a> — a public-good tool helping Kansas City patients reach primary care. We are not affiliated with ${e(p.clinic.name)}. Reference: request #${p.requestId}. To stop receiving these, reply with the word <strong>STOP</strong>.
  </div>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ----------------------- send ---------------------------------------------

export type SendOutcome =
  | { kind: "ok"; messageId: string; actualRecipient: string }
  | { kind: "no_key" }
  | { kind: "no_clinic_email" }
  | { kind: "error"; message: string };

export async function sendAppointmentRequestEmail(
  p: AppointmentRequestEmailPayload,
  clinicIntakeEmail: string | null,
): Promise<SendOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { kind: "no_key" };

  // Test-mode override: every email routes to this single address so we can
  // dry-run the full flow without spamming clinics.
  const testRecipient = process.env.APPOINTMENT_REQUEST_TEST_RECIPIENT;
  const toAddress = testRecipient || clinicIntakeEmail;
  if (!toAddress) return { kind: "no_clinic_email" };

  const from = process.env.APPOINTMENT_REQUEST_FROM || "onboarding@resend.dev";
  const subject = buildSubject(p);
  const text = buildPlainText(p);
  const html = buildHtml(p);

  const resend = new Resend(apiKey);
  try {
    const res = await resend.emails.send({
      from,
      to: toAddress,
      replyTo: p.email ?? undefined, // clinic Reply → patient directly
      subject,
      text,
      html,
      headers: {
        "X-Appointly-Request-Id": String(p.requestId),
        "X-Appointly-Test-Mode": testRecipient ? "true" : "false",
      },
    });
    if (res.error) {
      return { kind: "error", message: res.error.message };
    }
    if (!res.data?.id) {
      return { kind: "error", message: "No message id returned by Resend" };
    }
    return { kind: "ok", messageId: res.data.id, actualRecipient: toAddress };
  } catch (e) {
    return { kind: "error", message: (e as Error).message };
  }
}
