import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { requireDemoControlsFromRequest } from "@/lib/auth/guards";
import { activateIndex } from "@/lib/seed/documents";
import { errorResponse, parseBody, PRIVATE_HEADERS } from "@/lib/http/api";
import { getActiveContext } from "@/lib/state/active";

/** POST /api/admin/indexes/activate — move the active pointer in PostgreSQL. */
const bodySchema = z.object({
  index: z.string().regex(/^index-[a-z0-9-]+$/),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireDemoControlsFromRequest(request);
    const body = await parseBody(request, bodySchema);
    const db = getDb();
    const namespace = getConfig().DATA_NAMESPACE;
    await activateIndex(db, namespace, body.index);
    const context = await getActiveContext(db, namespace);
    return NextResponse.json(
      {
        ok: true,
        active_index: context.index?.indexKey ?? null,
        active_document: context.index?.docKey ?? null,
        config_version: context.configVersion,
        note: "ตัวชี้ดัชนีอยู่ในฐานข้อมูล การ rollback โค้ดไม่ย้อนตัวชี้ให้",
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
