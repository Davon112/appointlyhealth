import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { providers, providerLocations, acceptingStatusReports } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ npi: string }> },
) {
  const { npi } = await ctx.params;
  if (!/^\d{10}$/.test(npi)) {
    return NextResponse.json({ error: "Invalid NPI" }, { status: 400 });
  }

  const provider = await db.query.providers.findFirst({
    where: eq(providers.npi, npi),
  });
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const locations = await db.query.providerLocations.findMany({
    where: eq(providerLocations.npi, npi),
  });

  const reports = await db.query.acceptingStatusReports.findMany({
    where: eq(acceptingStatusReports.npi, npi),
    orderBy: desc(acceptingStatusReports.reportedAt),
    limit: 10,
  });

  return NextResponse.json({
    provider: {
      ...provider,
      languages: provider.languages ? JSON.parse(provider.languages) : [],
    },
    locations,
    recent_reports: reports,
  });
}
