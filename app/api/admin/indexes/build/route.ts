import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { requireDemoControlsFromRequest } from "@/lib/auth/guards";
import { ensureIndex } from "@/lib/seed/documents";
import { DOCUMENT_KEYS } from "@/lib/retrieval/canonical";
import { errorResponse, parseBody, PRIVATE_HEADERS } from "@/lib/http/api";

/** POST /api/admin/indexes/build — build an immutable index from a document. */
const bodySchema = z.object({
  docs: z.enum(DOCUMENT_KEYS as [string, ...string[]]),
  index: z.string().regex(/^index-[a-z0-9-]+$/),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireDemoControlsFromRequest(request);
    const body = await parseBody(request, bodySchema);
    const result = await ensureIndex(
      getDb(),
      getConfig().DATA_NAMESPACE,
      body.docs,
      body.index,
    );
    return NextResponse.json(
      {
        ok: true,
        index: result.indexKey,
        document: result.docKey,
        created: result.created,
        chunk_count: result.chunkCount,
        note: "ดัชนีไม่เปลี่ยนเมื่อสร้างซ้ำ และยังไม่เปลี่ยนดัชนีที่ใช้งาน",
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
