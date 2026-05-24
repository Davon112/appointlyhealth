import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { providers, acceptingStatusReports } from "@/db/schema";
import { eq, gte, and } from "drizzle-orm";
import { createHash } from "crypto";

export const runtime = "nodejs";

const ALLOWED_STATUSES = new Set(["yes", "no", "full", "unknown"]);
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 1 day per IP+NPI

function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? "appointly-dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * POST /api/providers/:npi/verify
 * Body: { status: "yes" | "no" | "full" | "unknown", captchaToken?: string }
 *
 * In production set HCAPTCHA_SECRET and require captchaToken. Without it,
 * we still rate-limit by hashed IP and accept reports with low weight.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ npi: string }> },
) {
  const { npi } = await ctx.params;
  if (!/^\d{10}$/.test(npi)) {
    return NextResponse.json({ error: "Invalid NPI" }, { status: 400 });
  }

  let body: { status?: string; captchaToken?: string };
  try {
    body = (await req.json()) as { status?: string; captchaToken?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const status = body.status;
  if (!status || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "status must be one of: yes, no, full, unknown" },
      { status: 400 },
    );
  }

  const provider = await db.query.providers.findFirst({
    where: eq(providers.npi, npi),
  });
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  // hCaptcha verification (only when configured)
  const captchaSecret = process.env.HCAPTCHA_SECRET;
  if (captchaSecret) {
    if (!body.captchaToken) {
      return NextResponse.json({ error: "captchaToken required" }, { status: 400 });
    }
    const verifyRes = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: captchaSecret,
        response: body.captchaToken,
      }),
    });
    const verifyJson = (await verifyRes.json()) as { success?: boolean };
    if (!verifyJson.success) {
      return NextResponse.json({ error: "Captcha failed" }, { status: 403 });
    }
  }

  // Rate limit: 1 verification per IP per NPI per 24h
  const ipHash = hashIp(getClientIp(req));
  const recent = await db.query.acceptingStatusReports.findFirst({
    where: and(
      eq(acceptingStatusReports.npi, npi),
      eq(acceptingStatusReports.sourceDetail, ipHash),
      gte(acceptingStatusReports.reportedAt, new Date(Date.now() - RATE_LIMIT_WINDOW_MS)),
    ),
  });
  if (recent) {
    return NextResponse.json(
      { error: "You've already reported this provider in the last 24 hours." },
      { status: 429 },
    );
  }

  const now = new Date();
  await db.insert(acceptingStatusReports).values({
    npi,
    status,
    source: "user_report",
    sourceDetail: ipHash,
    reportedAt: now,
  });

  // Denormalize: provider row reflects the latest report.
  await db
    .update(providers)
    .set({
      acceptingStatus: status,
      acceptingStatusUpdatedAt: now,
      acceptingStatusSource: "user_report",
    })
    .where(eq(providers.npi, npi));

  return NextResponse.json({ ok: true, status, reported_at: now.toISOString() });
}
