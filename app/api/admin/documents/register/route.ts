import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { requireDemoControlsFromRequest, HttpError } from "@/lib/auth/guards";
import { ensureDocument } from "@/lib/seed/documents";
import { DOCUMENT_KEYS } from "@/lib/retrieval/canonical";
import { errorResponse, parseBody, PRIVATE_HEADERS } from "@/lib/http/api";

/** POST /api/admin/documents/register — register a version; do NOT activate. */
const bodySchema = z.object({
  document: z.enum(DOCUMENT_KEYS as [string, ...string[]]),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireDemoControlsFromRequest(request);
    const body = await parseBody(request, bodySchema);
    const result = await ensureDocument(getDb(), getConfig().DATA_NAMESPACE, body.document);
    return NextResponse.json(
      {
        ok: true,
        document: body.document,
        created: result.created,
        note: "ลงทะเบียนเอกสารแล้ว แต่ยังไม่เปลี่ยนดัชนีที่ใช้งาน ต้องสร้างและเปิดใช้ดัชนีแยก",
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    return errorResponse(error);
  }
}
