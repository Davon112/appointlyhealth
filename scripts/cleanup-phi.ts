/**
 * Scheduled PHI cleanup.
 *
 * Finds appointment_requests rows where deliveredAt < (now - 24h) and
 * phiDeletedAt IS NULL, then NULLs out every PHI column:
 *   firstName, lastName, dob, phone, email,
 *   reasonCategory, reasonDetail, insuranceSituation,
 *   preferredTimes, language
 *
 * Retained columns (long-term, NOT PHI):
 *   id, phoneHash, channel, status, submittedAt, deliveredAt, phiDeletedAt,
 *   consentVersion, consentAcceptedAt
 *
 * Per-clinic delivery rows (appointment_request_recipients) are retained
 * forever — clinic_id + status + timestamps are operational data, not PHI.
 *
 * Schedule:
 *   - Local: `npm run cleanup-phi` ad-hoc, OR a cron entry every hour.
 *   - Production (Vercel): wire this script to a Vercel Cron job hitting
 *     /api/cron/cleanup-phi at the same cadence. Cron support added later.
 *
 * Safe to run repeatedly — it only acts on rows that haven't been cleaned yet.
 */
import "dotenv/config";
import { db, schema, pgPool } from "../src/db";
import { and, isNull, lt, sql } from "drizzle-orm";

const PHI_TTL_MS = 24 * 60 * 60 * 1000;

async function main() {
  const cutoff = new Date(Date.now() - PHI_TTL_MS);
  console.log(`Cleanup cutoff: deliveredAt < ${cutoff.toISOString()}`);

  // Find candidates first so we can log a count without ambiguity.
  const candidates = await db
    .select({ id: schema.appointmentRequests.id })
    .from(schema.appointmentRequests)
    .where(
      and(
        isNull(schema.appointmentRequests.phiDeletedAt),
        lt(schema.appointmentRequests.deliveredAt, cutoff),
      ),
    );
  console.log(`Found ${candidates.length} request(s) to clean.`);

  if (candidates.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // NULL all PHI columns + stamp phiDeletedAt. Single UPDATE for all rows.
  const result = await db
    .update(schema.appointmentRequests)
    .set({
      firstName: null,
      lastName: null,
      dob: null,
      phone: null,
      email: null,
      reasonCategory: null,
      reasonDetail: null,
      insuranceSituation: null,
      preferredTimes: null,
      language: null,
      phiDeletedAt: new Date(),
    })
    .where(
      and(
        isNull(schema.appointmentRequests.phiDeletedAt),
        lt(schema.appointmentRequests.deliveredAt, cutoff),
      ),
    );

  console.log(`Cleaned. rowCount=${result.rowCount}`);

  // Sanity: count remaining unclean rows older than cutoff (should be 0).
  const remaining = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.appointmentRequests)
    .where(
      and(
        isNull(schema.appointmentRequests.phiDeletedAt),
        lt(schema.appointmentRequests.deliveredAt, cutoff),
      ),
    );
  console.log(`Remaining un-cleaned past cutoff: ${remaining[0]?.n ?? 0}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pgPool().end());
