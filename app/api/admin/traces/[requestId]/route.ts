import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { requireAdminFromRequest } from "@/lib/auth/guards";
import { getTrace } from "@/lib/telemetry/requests";
import { errorResponse, PRIVATE_HEADERS } from "@/lib/http/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    await requireAdminFromRequest(request);
    const { requestId } = await context.params;
    const trace = await getTrace(getDb(), getConfig().DATA_NAMESPACE, decodeURIComponent(requestId));
    if (!trace) {
      return NextResponse.json(
        { status: "not_found", error: { code: "trace_not_found", message: "ไม่พบคำขอนี้" } },
        { status: 404, headers: PRIVATE_HEADERS },
      );
    }
    return NextResponse.json(trace, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
