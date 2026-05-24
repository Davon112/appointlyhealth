/**
 * Rate limits for the appointment-request feature.
 *
 *  - Per phone:    3 requests per rolling 24h. Catches a single user being
 *                  eager + a single spammer using one number.
 *  - Per clinic:   50 requests per rolling 24h. Bounds the blast radius of
 *                  anyone who bypasses the phone limit.
 *  - Per provider: 25 requests per rolling 24h. Tighter than clinics
 *                  because individual providers have less capacity to
 *                  triage spam.
 *
 * All checks read from appointment_requests + appointment_request_recipients
 * — no separate counter store. One extra SQL pass per submit.
 */
import { db, schema } from "@/db";
import { and, eq, gte, sql } from "drizzle-orm";

const PHONE_WINDOW_MS = 24 * 60 * 60 * 1000;
const PER_PHONE_LIMIT = 3;
const CLINIC_WINDOW_MS = 24 * 60 * 60 * 1000;
const PER_CLINIC_LIMIT = 50;
const PROVIDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const PER_PROVIDER_LIMIT = 25;

export type RateLimitResult =
  | { kind: "ok" }
  | { kind: "phone_exceeded"; usedInWindow: number; limit: number }
  | { kind: "clinic_exceeded"; clinicId: number; usedInWindow: number; limit: number }
  | { kind: "provider_exceeded"; providerNpi: string; usedInWindow: number; limit: number };

export async function checkRateLimits(args: {
  phoneHash: string;
  clinicIds: number[];
  providerNpis: string[];
}): Promise<RateLimitResult> {
  // Per-phone.
  const phoneSince = new Date(Date.now() - PHONE_WINDOW_MS);
  const phoneRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.appointmentRequests)
    .where(
      and(
        eq(schema.appointmentRequests.phoneHash, args.phoneHash),
        gte(schema.appointmentRequests.submittedAt, phoneSince),
      ),
    );
  const phoneUsed = phoneRows[0]?.n ?? 0;
  if (phoneUsed >= PER_PHONE_LIMIT) {
    return { kind: "phone_exceeded", usedInWindow: phoneUsed, limit: PER_PHONE_LIMIT };
  }

  // Per-clinic.
  const clinicSince = new Date(Date.now() - CLINIC_WINDOW_MS);
  for (const clinicId of args.clinicIds) {
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.appointmentRequestRecipients)
      .where(
        and(
          eq(schema.appointmentRequestRecipients.clinicId, clinicId),
          gte(schema.appointmentRequestRecipients.sentAt, clinicSince),
        ),
      );
    const used = rows[0]?.n ?? 0;
    if (used >= PER_CLINIC_LIMIT) {
      return { kind: "clinic_exceeded", clinicId, usedInWindow: used, limit: PER_CLINIC_LIMIT };
    }
  }

  // Per-provider.
  const providerSince = new Date(Date.now() - PROVIDER_WINDOW_MS);
  for (const providerNpi of args.providerNpis) {
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.appointmentRequestRecipients)
      .where(
        and(
          eq(schema.appointmentRequestRecipients.providerNpi, providerNpi),
          gte(schema.appointmentRequestRecipients.sentAt, providerSince),
        ),
      );
    const used = rows[0]?.n ?? 0;
    if (used >= PER_PROVIDER_LIMIT) {
      return { kind: "provider_exceeded", providerNpi, usedInWindow: used, limit: PER_PROVIDER_LIMIT };
    }
  }

  return { kind: "ok" };
}
