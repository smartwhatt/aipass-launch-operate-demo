import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { requireAdminFromRequest } from "@/lib/auth/guards";
import { getDashboardMetrics } from "@/lib/telemetry/metrics";
import { parseMetricsFilter } from "@/lib/telemetry/filter";
import { errorResponse, PRIVATE_HEADERS } from "@/lib/http/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminFromRequest(request);
    const config = getConfig();
    const filter = parseMetricsFilter(request.nextUrl.searchParams, config.DATA_NAMESPACE);
    const metrics = await getDashboardMetrics(getDb(), filter);
    return NextResponse.json(metrics, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
