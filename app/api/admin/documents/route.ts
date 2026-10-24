import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { requireAdminFromRequest } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/state/active";
import { errorResponse, PRIVATE_HEADERS } from "@/lib/http/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminFromRequest(request);
    const context = await getActiveContext(getDb(), getConfig().DATA_NAMESPACE);
    return NextResponse.json(
      {
        active_index: context.index?.indexKey ?? null,
        active_document: context.index?.docKey ?? null,
        mode: context.mode,
        config_version: context.configVersion,
        documents: context.registeredDocuments,
        incident: context.incident,
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
