/**
 * Rate limits for the appointment-request feature.
 *
 *  - Per phone:  3 requests per rolling 24h. Catches a single user being
 *                eager + a single spammer using one number.
 *  - Per clinic: 50 requests per rolling 24h. Bounds the blast radius of
 *                anyone who bypasses the phone limit (e.g. a Twilio Verify
 *                outage causing legit users to retry, or a malicious
 *                burst from many numbers targeting one clinic).
 *
 * Both checks share the appointment_requests + appointment_request_recipients
 * tables — no separate counter store. That keeps the source of truth simple
 * at the cost of one extra SQL query per submit.
 */
import { db, schema } from "@/db";
import { and, eq, gte, sql } from "drizzle-orm";

const PHONE_WINDOW_MS = 24 * 60 * 60 * 1000;
const PER_PHONE_LIMIT = 3;
const CLINIC_WINDOW_MS = 24 * 60 * 60 * 1000;
const PER_CLINIC_LIMIT = 50;

export type RateLimitResult =
  | { kind: "ok" }
  | { kind: "phone_exceeded"; usedInWindow: number; limit: number }
  | { kind: "clinic_exceeded"; clinicId: number; usedInWindow: number; limit: number };

export async function checkRateLimits(args: {
  phoneHash: string;
  clinicIds: number[];
}): Promise<RateLimitResult> {
  const since = new Date(Date.now() - PHONE_WINDOW_MS);

  // Per-phone count.
  const phoneRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.appointmentRequests)
    .where(
      and(
        eq(schema.appointmentRequests.phoneHash, args.phoneHash),
        gte(schema.appointmentRequests.submittedAt, since),
      ),
    );
  const phoneUsed = phoneRows[0]?.n ?? 0;
  if (phoneUsed >= PER_PHONE_LIMIT) {
    return { kind: "phone_exceeded", usedInWindow: phoneUsed, limit: PER_PHONE_LIMIT };
  }

  // Per-clinic count (across all phones).
  const sinceClinic = new Date(Date.now() - CLINIC_WINDOW_MS);
  for (const clinicId of args.clinicIds) {
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.appointmentRequestRecipients)
      .where(
        and(
          eq(schema.appointmentRequestRecipients.clinicId, clinicId),
          gte(schema.appointmentRequestRecipients.sentAt, sinceClinic),
        ),
      );
    const used = rows[0]?.n ?? 0;
    if (used >= PER_CLINIC_LIMIT) {
      return { kind: "clinic_exceeded", clinicId, usedInWindow: used, limit: PER_CLINIC_LIMIT };
    }
  }

  return { kind: "ok" };
}
