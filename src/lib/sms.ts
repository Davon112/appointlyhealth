/**
 * SMS — Twilio Verify wrapper + a dev stub so the form is testable without
 * Twilio credentials.
 *
 * Two flows:
 *  - Verification: `startVerification(phone)` → Twilio sends a 6-digit code
 *    → `checkVerification(phone, code)` validates. We don't store the code
 *    ourselves — Twilio Verify holds it server-side for 10 min.
 *  - Confirmation: `sendAppointmentConfirmation(phone, body)` — plain SMS
 *    after a successful submit.
 *
 * Stub behavior (when TWILIO_VERIFY_SERVICE_SID is empty):
 *  - startVerification logs the would-be SMS and returns ok
 *  - checkVerification accepts the literal code "000000" and rejects others
 *  - sendAppointmentConfirmation logs the message and returns ok
 *
 * This lets the appointment-request flow be end-to-end testable in dev without
 * burning Twilio credit or needing an account at all.
 */

type Outcome<T> =
  | ({ kind: "ok" } & T)
  | { kind: "error"; message: string };

const DEV_CODE = "000000";

function isStubMode(): boolean {
  return !process.env.TWILIO_VERIFY_SERVICE_SID || !process.env.TWILIO_ACCOUNT_SID;
}

function basicAuthHeader(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const tok = process.env.TWILIO_AUTH_TOKEN!;
  return "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64");
}

// ----------------------- normalize phone ----------------------------------

/**
 * Normalize a user-entered US phone number to E.164.
 * Returns null if the input doesn't look like a 10-digit US number.
 */
export function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// ----------------------- verification flow --------------------------------

export async function startVerification(phoneE164: string): Promise<Outcome<{ channel: "sms" }>> {
  if (isStubMode()) {
    // eslint-disable-next-line no-console
    console.log(`[sms:stub] startVerification(${phoneE164}) — accept code ${DEV_CODE}`);
    return { kind: "ok", channel: "sms" };
  }
  const sid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  const url = `https://verify.twilio.com/v2/Services/${sid}/Verifications`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phoneE164, Channel: "sms" }).toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { kind: "error", message: `Twilio Verify ${res.status}: ${text.slice(0, 200)}` };
    }
    return { kind: "ok", channel: "sms" };
  } catch (e) {
    return { kind: "error", message: (e as Error).message };
  }
}

export async function checkVerification(
  phoneE164: string,
  code: string,
): Promise<Outcome<{ valid: boolean }>> {
  if (isStubMode()) {
    const valid = code === DEV_CODE;
    // eslint-disable-next-line no-console
    console.log(`[sms:stub] checkVerification(${phoneE164}, ${code}) → ${valid}`);
    return { kind: "ok", valid };
  }
  const sid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  const url = `https://verify.twilio.com/v2/Services/${sid}/VerificationCheck`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phoneE164, Code: code }).toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { kind: "error", message: `Twilio Verify ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = (await res.json()) as { status?: string };
    return { kind: "ok", valid: json.status === "approved" };
  } catch (e) {
    return { kind: "error", message: (e as Error).message };
  }
}

// ----------------------- confirmation SMS ---------------------------------

export async function sendAppointmentConfirmation(
  phoneE164: string,
  body: string,
): Promise<Outcome<{ sid: string | null }>> {
  if (isStubMode()) {
    // eslint-disable-next-line no-console
    console.log(`[sms:stub] confirmation → ${phoneE164}: ${body}`);
    return { kind: "ok", sid: null };
  }
  const from = process.env.TWILIO_FROM_PHONE;
  if (!from) {
    return { kind: "error", message: "TWILIO_FROM_PHONE not set" };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phoneE164, From: from, Body: body }).toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { kind: "error", message: `Twilio SMS ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = (await res.json()) as { sid?: string };
    return { kind: "ok", sid: json.sid ?? null };
  } catch (e) {
    return { kind: "error", message: (e as Error).message };
  }
}

/**
 * Whether SMS is in stub mode. Used by the form UI to render a small
 * "DEV: use code 000000" hint instead of waiting for an SMS that won't arrive.
 */
export function smsIsStub(): boolean {
  return isStubMode();
}
