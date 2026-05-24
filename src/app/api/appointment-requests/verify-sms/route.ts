/**
 * POST /api/appointment-requests/verify-sms
 *
 * Two operations on the same endpoint:
 *   { action: "start", phone }                → SMS code dispatched
 *   { action: "check", phone, code }          → { valid: boolean }
 *
 * No PHI is stored by this endpoint — Twilio Verify holds the code
 * server-side for ~10 minutes. In dev (no Twilio creds), the lib accepts
 * the literal code "000000".
 */
import { NextRequest, NextResponse } from "next/server";
import {
  normalizeUsPhone,
  startVerification,
  checkVerification,
  smsIsStub,
} from "@/lib/sms";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { action?: string; phone?: string; code?: string };
  try {
    body = (await req.json()) as { action?: string; phone?: string; code?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const phoneE164 = body.phone ? normalizeUsPhone(body.phone) : null;
  if (!phoneE164) {
    return NextResponse.json(
      { error: "Invalid US phone — please enter a 10-digit number" },
      { status: 422 },
    );
  }

  if (body.action === "start") {
    const r = await startVerification(phoneE164);
    if (r.kind === "error") {
      return NextResponse.json({ error: r.message }, { status: 502 });
    }
    return NextResponse.json({ ok: true, stub: smsIsStub() });
  }

  if (body.action === "check") {
    const code = (body.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Code must be 6 digits" }, { status: 422 });
    }
    const r = await checkVerification(phoneE164, code);
    if (r.kind === "error") {
      return NextResponse.json({ error: r.message }, { status: 502 });
    }
    return NextResponse.json({ valid: r.valid });
  }

  return NextResponse.json(
    { error: "Unknown action — use 'start' or 'check'" },
    { status: 400 },
  );
}
